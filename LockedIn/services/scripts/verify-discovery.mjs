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
Object.assign(childEnv, { DISCOVERY_PHOTOS_ENABLED: "false", CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "" });
// Tests must not inherit an operator's open/invalid rollout mode.
childEnv.DISCOVERY_ACCESS_MODE = "pilot";
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
  await database.query(`UPDATE "user" SET "inAppActivity"=false,"activityEmails"=false WHERE id='discovery-preserved-a';
    UPDATE "IntentionSession" SET status='REVEALED' WHERE id='discovery-preserved-session';
    INSERT INTO "IntentionSession" (id,"relationshipId","createdById",status,"updatedAt") VALUES ('discovery-preserved-archive','discovery-preserved-relationship','discovery-preserved-b','ARCHIVED',NOW());
    INSERT INTO "IntentionResponse" (id,"sessionId","userId",answers,"shareKeys","revealConsentedAt","updatedAt") VALUES ('discovery-preserved-archived-response','discovery-preserved-archive','discovery-preserved-b','{"private":"archived legacy answer"}',ARRAY['private'],'2026-01-02',NOW());
    INSERT INTO "SharedNextStep" (id,"sessionId","proposedById",title,details,status,"acceptedAt","updatedAt") VALUES ('discovery-preserved-step','discovery-preserved-session','discovery-preserved-a','An old agreement','Keep this history','ACCEPTED','2026-01-03',NOW());
    INSERT INTO "Reflection" (id,"nextStepId","userId",outcome,note,"updatedAt") VALUES ('discovery-preserved-step-reflection','discovery-preserved-step','discovery-preserved-b','COMPLETED','Private legacy step reflection',NOW());
    UPDATE "MeaningChapter" SET status='SHARED',"candidateVersion"=1 WHERE id='discovery-preserved-chapter';
    INSERT INTO "MeaningDefinitionProposal" (id,"chapterId","userId",kind,definition,"updatedAt") VALUES ('discovery-preserved-proposal','discovery-preserved-chapter','discovery-preserved-a','PERSONAL','An approved meaning',NOW());
    INSERT INTO "MeaningSelection" (id,"chapterId","userId",mode,"proposalId","updatedAt") VALUES ('discovery-preserved-selection','discovery-preserved-chapter','discovery-preserved-b','PROPOSAL','discovery-preserved-proposal',NOW());
    INSERT INTO "MeaningFinalApproval" (id,"chapterId","userId","candidateVersion") VALUES ('discovery-preserved-approval-a','discovery-preserved-chapter','discovery-preserved-a',1),('discovery-preserved-approval-b','discovery-preserved-chapter','discovery-preserved-b',1);`);
  const preservedTables=["user","Relationship","RelationshipMember","RelationshipInvite","IntentionSession","IntentionResponse","SharedNextStep","Reflection","MeaningChapter","MeaningResponse","MeaningDefinitionProposal","MeaningSelection","MeaningFinalApproval","ConversationChoice","Notification","InvitationBlock"];
  const snapshot = async () => {
    const result={};
    for(const table of preservedTables) result[table]=(await database.query(`SELECT jsonb_agg(to_jsonb(t)-'discoveryConnectionId'-'safePublicLabel' ORDER BY id) AS rows FROM "${table}" t`)).rows[0].rows;
    return result;
  };
  const before = await snapshot();
  for (const entry of readdirSync(migrations)) {
    if (entry >= "20261116010000_discovery_pilot" && entry < "20261118002000_shared_messaging" && entry !== "migration_lock.toml") cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  }
  run(["migrate", "deploy", "--config", config]);
  // Rehearse expansion over actual pre-migration chat rows, not empty tables.
  await database.query(`INSERT INTO "DiscoveryConnection" (id,"userLowId","userHighId","inviterId","questionKey","questionText",hello,"senderPublicName","senderAvatarPreset",state,"expiresAt","updatedAt") VALUES ('discovery-preserved-contact','discovery-preserved-a','discovery-preserved-b','discovery-preserved-a','support','Support?','Opening','Public alias','leaf','ACCEPTED',NOW()+INTERVAL '1 day',NOW());
    INSERT INTO "DiscoveryMessage" (id,"connectionId","senderId","requestId",text) VALUES ('discovery-preserved-message','discovery-preserved-contact','discovery-preserved-a','discovery-preserved-request','Historical chat');
    INSERT INTO "DiscoveryReport" (id,"reporterId","reportedUserId","connectionId",reason,"sourceType","sourceId",evidence) VALUES ('discovery-preserved-report','discovery-preserved-b','discovery-preserved-a','discovery-preserved-contact','SPAM','MESSAGE','discovery-preserved-message','{"text":"Historical chat"}');`);
  const chatSnapshot = async () => (await database.query(`SELECT jsonb_build_object('messages',(SELECT jsonb_agg(to_jsonb(m)-'conversationId' ORDER BY id) FROM "DiscoveryMessage" m),'reports',(SELECT jsonb_agg(to_jsonb(r)-'conversationId' ORDER BY id) FROM "DiscoveryReport" r)) AS snapshot`)).rows[0].snapshot;
  const chatBefore = await chatSnapshot();
  for (const entry of readdirSync(migrations)) {
    if (entry >= "20261118002000_shared_messaging" && entry !== "migration_lock.toml") cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  }
  run(["migrate", "deploy", "--config", config]);
  if (JSON.stringify(chatBefore) !== JSON.stringify(await chatSnapshot())) throw new Error("Messaging expansion changed historical messages/reports");
  if (JSON.stringify(before) !== JSON.stringify(await snapshot())) throw new Error("Migration changed historical content/IDs/consent");
  console.log("Historical fixture snapshot preserved exactly.");
  const files = process.env.DISCOVERY_TEST_FILES?.split(",").filter(Boolean) ?? ["api/src"];
  const migrationTest = "api/src/features/messaging/test/messaging-migration.integration.spec.ts";
  // The backfill deliberately scans all sources. Do not run it against other
  // test files' concurrently mutating fixtures in this shared disposable DB.
  if (!process.env.DISCOVERY_TEST_FILES) {
    execFileSync("npm", ["test", "--", migrationTest], { cwd: services, env: childEnv, stdio: "inherit" });
  }
  execFileSync("npm", ["test", "--", ...files, ...(!process.env.DISCOVERY_TEST_FILES ? ["--exclude", migrationTest] : [])], { cwd: services, env: childEnv, stdio: "inherit" });
  if(process.argv.includes("--browser")) execFileSync(process.execPath,["--import","tsx",path.join(services,"scripts/verify-discovery-browser.mjs")],{cwd:services,env:childEnv,stdio:"inherit"});
} finally {
  await database?.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  rmSync(temp, { recursive: true, force: true });
}
