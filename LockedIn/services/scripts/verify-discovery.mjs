// Only this runner's validated, disposable database may be created or removed.
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const services = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DISCOVERY_TEST_ADMIN_URL) throw new Error("DISCOVERY_TEST_ADMIN_URL is required; application DATABASE_URL is never used");
const adminUrl = new URL(process.env.DISCOVERY_TEST_ADMIN_URL);
// pg query options can override the URL's hostname; this local-only harness
// accepts no options/fragments and validates before constructing any client.
if (!["postgres:", "postgresql:"].includes(adminUrl.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname) || adminUrl.search || adminUrl.hash) throw new Error("Discovery tests require an explicit local PostgreSQL admin URL without query options or fragments");
const name = `lockedin_discovery_test_${randomBytes(12).toString("hex")}`;
if (!/^lockedin_discovery_test_[a-f0-9]{24}$/.test(name)) throw new Error("Invalid generated test database name");
const url = new URL(adminUrl); url.pathname = `/${name}`;
const childEnv = { ...process.env, DATABASE_URL: url.toString(), DISCOVERY_INTEGRATION: "true", NOTIFICATIONS_INTEGRATION: "true", BETTER_AUTH_SECRET: "discovery-integration-only-secret-at-least-32-characters", BETTER_AUTH_URL: "http://localhost:8000", APP_URL: "http://localhost:3001", REQUIRE_EMAIL_VERIFICATION: "false", RESEND_API_KEY: "", RESEND_FROM_EMAIL: "", DISCOVERY_ENABLED: "false", DISCOVERY_PILOT_USER_IDS: "", DISCOVERY_MODERATOR_USER_IDS: "", DISCOVERY_AREAS_JSON: "[]", NODE_ENV: "test" };
delete childEnv.DISCOVERY_TEST_ADMIN_URL;
const temp = mkdtempSync(path.join(tmpdir(), "lockedin-discovery-harness-"));
const admin = new Client({ connectionString: adminUrl.toString() });
let created = false, database;
const run = (args) => execFileSync(process.execPath, [path.join(services, "node_modules/prisma/build/index.js"), ...args], { cwd: services, env: childEnv, stdio: "inherit" });
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const migrations = path.join(services, "api/prisma/migrations");
  for (const entry of readdirSync(migrations)) {
    if (entry < "20261116010000_discovery_pilot" || entry === "migration_lock.toml") cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  }
  const config = path.join(temp, "prisma.config.ts");
  // Absolute config and schema avoid the app's dotenv-loading Prisma config entirely.
  writeFileSync(config, `export default ${JSON.stringify({ schema: path.join(services, "api/prisma/schema.prisma"), migrations: { path: path.join(temp, "migrations") }, datasource: { url: url.toString() } })};\n`);
  run(["migrate", "deploy", "--config", config]);
  database = new Client({ connectionString: url.toString() }); await database.connect();
  await database.query(`INSERT INTO "user" (id,email,"updatedAt") VALUES ('discovery-preserved-a','preserved-a@example.test',NOW()),('discovery-preserved-b','preserved-b@example.test',NOW());
    INSERT INTO "Relationship" (id,"updatedAt") VALUES ('discovery-preserved-relationship',NOW());
    INSERT INTO "RelationshipMember" (id,"relationshipId","userId") VALUES ('discovery-preserved-member-a','discovery-preserved-relationship','discovery-preserved-a'),('discovery-preserved-member-b','discovery-preserved-relationship','discovery-preserved-b');
    INSERT INTO "IntentionSession" (id,"relationshipId","createdById","updatedAt") VALUES ('discovery-preserved-session','discovery-preserved-relationship','discovery-preserved-a',NOW());
    INSERT INTO "IntentionResponse" (id,"sessionId","userId",answers,"shareKeys","revealConsentedAt","updatedAt") VALUES ('discovery-preserved-response','discovery-preserved-session','discovery-preserved-a','{"private":"legacy answer"}',ARRAY['private'],'2026-01-01',NOW());
    INSERT INTO "MeaningChapter" (id,"relationshipId","wordKey","createdById","sharedDefinition","updatedAt") VALUES ('discovery-preserved-chapter','discovery-preserved-relationship','support','discovery-preserved-a','legacy shared definition',NOW());
    INSERT INTO "Notification" ("recipientId","relationshipId",kind,"entityId","eventKey","updatedAt") VALUES ('discovery-preserved-a','discovery-preserved-relationship','CHAPTER_STARTED','discovery-preserved-chapter','discovery-preserved-event',NOW());`);
  const snapshot = async () => (await database.query(`SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "user" t),'relationships',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Relationship" t),'responses',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "IntentionResponse" t),'chapters',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "MeaningChapter" t),'notifications',(SELECT jsonb_agg(to_jsonb(t)-'discoveryConnectionId' ORDER BY id) FROM "Notification" t)) AS snapshot`)).rows[0].snapshot;
  const before = await snapshot();
  if (readdirSync(migrations).includes("20261116010000_discovery_pilot")) cpSync(path.join(migrations, "20261116010000_discovery_pilot"), path.join(temp, "migrations/20261116010000_discovery_pilot"), { recursive: true });
  run(["migrate", "deploy", "--config", config]);
  if (JSON.stringify(before) !== JSON.stringify(await snapshot())) throw new Error("Migration changed historical content/IDs/consent");
  console.log("Historical fixture snapshot preserved exactly.");
  const files = process.env.DISCOVERY_TEST_FILES?.split(",").filter(Boolean) ?? ["api/src/features/discovery/test/discovery.policy.spec.ts", "api/src/features/discovery/test/discovery.http.spec.ts", "api/src/features/discovery/test/discovery.migration.integration.spec.ts"];
  execFileSync("npm", ["test", "--", ...files], { cwd: services, env: childEnv, stdio: "inherit" });
} finally {
  await database?.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  rmSync(temp, { recursive: true, force: true });
}
