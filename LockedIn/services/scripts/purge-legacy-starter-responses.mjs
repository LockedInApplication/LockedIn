import fs from 'node:fs';
import pg from 'pg';

// Explicit one-time production cleanup; never load a default/local DATABASE_URL.
const [credentialFile, mode] = process.argv.slice(2);
if (!credentialFile || !['inspect', 'purge'].includes(mode)) throw new Error('Usage: node scripts/purge-legacy-starter-responses.mjs CREDENTIAL_FILE inspect|purge');
const connectionString = fs.readFileSync(credentialFile, 'utf8').trim();
const target = new URL(connectionString);
if (target.pathname !== '/lockedin_test' || !target.hostname.startsWith('dpg-dbsqq6rl550s7397njqg-a.')) throw new Error('Unexpected production database target');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 });
const counts = async () => (await client.query(`SELECT
  (SELECT count(*)::int FROM "DiscoveryDraft") AS drafts,
  (SELECT count(*)::int FROM "DiscoverySharedResponse") AS starter_answers,
  (SELECT count(*)::int FROM "DiscoveryMessage") AS chat_messages,
  (SELECT count(*)::int FROM "DiscoveryConnection" WHERE length(hello) > 0) AS opening_replies,
  (SELECT count(*)::int FROM "DiscoveryReport") AS safety_reports`)).rows[0];
const fingerprints = async () => {
  const result = {};
  for (const table of ['DiscoveryMessage', 'DiscoveryConnection', 'DiscoveryReport']) {
    result[table] = (await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY id), '')) AS fingerprint FROM "${table}" t`)).rows[0];
  }
  return JSON.stringify(result);
};
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '2s'");
  await client.query("SET LOCAL statement_timeout = '10s'");
  const incoming = await client.query(`SELECT conname FROM pg_constraint WHERE contype = 'f' AND confrelid IN ('"DiscoveryDraft"'::regclass, '"DiscoverySharedResponse"'::regclass)`);
  if (incoming.rowCount) throw new Error('Unexpected dependent foreign keys; inspect before deletion');
  if (mode === 'purge') {
    await client.query('LOCK TABLE "DiscoveryDraft", "DiscoverySharedResponse", "DiscoveryMessage", "DiscoveryConnection", "DiscoveryReport" IN SHARE ROW EXCLUSIVE MODE');
  }
  const before = await counts();
  console.log(JSON.stringify({ mode, database: target.pathname.slice(1), before }));
  if (mode === 'inspect') {
    await client.query('ROLLBACK');
  } else {
    const protectedBefore = await fingerprints();
    const drafts = await client.query('DELETE FROM "DiscoveryDraft"');
    const answers = await client.query('DELETE FROM "DiscoverySharedResponse"');
    const after = await counts();
    if (after.drafts !== 0 || after.starter_answers !== 0 || protectedBefore !== await fingerprints()) throw new Error('Cleanup validation failed; rolling back');
    await client.query('COMMIT');
    console.log(JSON.stringify({ committed: true, deleted: { drafts: drafts.rowCount, starter_answers: answers.rowCount }, after, protectedRecordsUnchanged: true }));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Cleanup failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
