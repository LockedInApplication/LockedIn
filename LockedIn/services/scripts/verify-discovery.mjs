// Only this runner's validated, disposable database may be created or removed.
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
childEnv.ACCOUNT_PHOTO_DELETION_ENABLED = "false";
// Tests must not inherit an operator's open/invalid rollout mode.
childEnv.DISCOVERY_ACCESS_MODE = "pilot";
childEnv.DISCOVERY_MATCH_PREFERENCES_REQUIRED = "false";
childEnv.DISCOVERY_LOCATION_REQUIRED = "false";
delete childEnv.DISCOVERY_LOCATION_MODE;
delete childEnv.DISCOVERY_LOCATION_GENERATION;
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
    for(const table of preservedTables) {
      const additiveFields = table === "Relationship" ? "-'directLockedInAt'" : table === "Notification" ? "-'conversationId'" : "";
      result[table]=(await database.query(`SELECT jsonb_agg(to_jsonb(t)-'discoveryConnectionId'-'safePublicLabel'${additiveFields} ORDER BY id) AS rows FROM "${table}" t`)).rows[0].rows;
    }
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
  const chatSnapshot = async () => (await database.query(`SELECT jsonb_build_object('messages',(SELECT jsonb_agg(to_jsonb(m)-'conversationId'-'dateSpotPlaceId'-'unreadAlertSuppressed'-'datePlanEvent' ORDER BY id) FROM "DiscoveryMessage" m),'reports',(SELECT jsonb_agg(to_jsonb(r)-'conversationId' ORDER BY id) FROM "DiscoveryReport" r)) AS snapshot`)).rows[0].snapshot;
  const chatBefore = await chatSnapshot();
  for (const entry of readdirSync(migrations)) {
    if (entry >= "20261118002000_shared_messaging" && entry < "20261119004000_chat_read_state") cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  }
  run(["migrate", "deploy", "--config", config]);
  const dateSheetExpansion = "20261120010000_shared_date_sheet";
  const later = readdirSync(migrations).filter(entry => entry >= "20261119004000_chat_read_state" && entry !== "migration_lock.toml");
  for (const entry of later.filter(entry => entry < dateSheetExpansion)) cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  run(["migrate", "deploy", "--config", config]);
  const baseline = await database.query(`SELECT EXISTS (
    SELECT 1 FROM "DiscoveryConnection" d JOIN "DiscoveryMessage" m ON m."connectionId" = d.id
    WHERE m.id = 'discovery-preserved-message' AND m.sequence = d."legacyUnreadBaseline"
      AND NOT EXISTS (SELECT 1 FROM "ChatConversation" c WHERE c."discoveryConnectionId" = d.id)
  ) AS "legacyPreserved"`);
  if (!baseline.rows[0].legacyPreserved) throw new Error("Unread migration did not baseline an unlinked legacy chat");
  const planning = await database.query('SELECT EXISTS (SELECT 1 FROM "ChatDatePlan") OR EXISTS (SELECT 1 FROM "DiscoveryMessage" WHERE "datePlanEvent" IS NOT NULL) AS backfilled');
  if (planning.rows[0].backfilled) throw new Error("Date plans migration changed legacy messages or created plans");
  if (JSON.stringify(chatBefore) !== JSON.stringify(await chatSnapshot())) throw new Error("Messaging expansion changed historical messages/reports");
  if (JSON.stringify(before) !== JSON.stringify(await snapshot())) throw new Error("Migration changed historical content/IDs/consent");
  console.log("Historical fixture snapshot preserved exactly.");
  // Simulate an old server creating and reading dates before the new schema exists.
  const conversation = randomUUID(), sender = "discovery-preserved-a", recipient = "discovery-preserved-b";
  await database.query(`INSERT INTO "ChatConversation" (id,"userLowId","userHighId",origin,"accessMode","discoveryConnectionId","updatedAt")
    VALUES ($1,$2,$3,'DISCOVERY','DISCOVERY','discovery-preserved-contact',NOW())`, [conversation, sender, recipient]);
  const legacyDates = [];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID(), planId = randomUUID();
    const startsAt = new Date(Date.now() + (i + 1) * 86_400_000).toISOString();
    const event = { id: planId, sourceMessageId: id, venueName: "Migration library", startsAt, timeZone: "UTC",
      revision: 1, state: "declined", action: "propose", fingerprint: "0".repeat(64) };
    const { rows } = await database.query(`INSERT INTO "DiscoveryMessage" (id,"conversationId","connectionId","senderId","requestId",text,"datePlanEvent")
      VALUES ($1,$2,'discovery-preserved-contact',$3,$4,'Suggested a date time.',$5) RETURNING sequence`, [id, conversation, sender, randomUUID(), event]);
    await database.query(`INSERT INTO "ChatDatePlan" (id,"conversationId","sourceMessageId","venueName","startsAt","timeZone",revision,"proposerId",state,"updatedAt")
      VALUES ($1,$2,$3,'Migration library',$4,'UTC',1,$5,'declined',NOW())`, [planId, conversation, id, startsAt, sender]);
    if (!i) await database.query(`INSERT INTO "ChatReadState" ("conversationId","userId",through) VALUES ($1,$2,$3)`, [conversation, recipient, rows[0].sequence]);
    legacyDates.push(id);
  }
  const dateSnapshot = async () => (await database.query(`SELECT id,"datePlanEvent",sequence FROM "DiscoveryMessage" WHERE id=ANY($1) ORDER BY sequence`, [legacyDates])).rows;
  const beforeSheet = await dateSnapshot();
  const matchingExpansion = "20261120012000_mutual_discovery_preferences";
  for (const entry of later.filter(entry => entry >= dateSheetExpansion && entry < matchingExpansion)) cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  run(["migrate", "deploy", "--config", config]);
  if (JSON.stringify(beforeSheet) !== JSON.stringify(await dateSnapshot())) throw new Error("Sheet expansion changed legacy date events");
  const [alreadySeen, unseen] = legacyDates;
  const legacy = await database.query(`SELECT m.id
    FROM "DiscoveryMessage" m JOIN "ChatReadState" r ON r."conversationId"=m."conversationId"
    LEFT JOIN "ChatDatePlanRead" p ON p."planId"=m."datePlanEvent"->>'id' AND p."userId"=r."userId"
    WHERE m.id=ANY($1) AND r."userId"=$2 AND m.sequence>GREATEST(p.through,r.through)
    ORDER BY m.sequence`, [[alreadySeen, unseen], recipient]);
  if (legacy.rows.length !== 1 || legacy.rows[0]?.id !== unseen) throw new Error("Sheet expansion changed what was unseen");
  const historicalOwner = "discovery-preserved-publication-owner";
  await database.query('INSERT INTO "user" (id,email,"updatedAt") VALUES ($1,$2,NOW())', [historicalOwner, `${historicalOwner}@example.test`]);
  const historicalProfile = { publicName: "Historical alias", avatarPreset: "leaf", bio: "Historical public introduction", areaId: "pilot-city", intention: "LONG_TERM", interests: ["Reading"], pace: null };
  await database.query(`INSERT INTO "DiscoveryProfile" (id,"ownerId",draft,"publishedSnapshot","publishedAreaId","publishedIntention","adultAttestedAt","publicationConsentedAt","publicationConsentVersion","publishedAt","publicationVersion","pausedAt","updatedAt")
    VALUES ($1,$2,$3,$4,'pilot-city','LONG_TERM',NOW(),NOW(),1,NOW(),1,NOW(),NOW())`, [randomUUID(), historicalOwner, { revision: 1, profile: historicalProfile }, historicalProfile]);
  const matchingBaseline = async () => ({
    preserved: await snapshot(), chat: await chatSnapshot(), dates: await dateSnapshot(),
    publicProfiles: (await database.query('SELECT to_jsonb(p) AS profile FROM "DiscoveryProfile" p ORDER BY id')).rows,
    plans: (await database.query('SELECT to_jsonb(d) AS plan FROM "ChatDatePlan" d ORDER BY id')).rows,
  });
  const beforeMatching = await matchingBaseline();
  const photoDeletionExpansion = "20261121012000_account_photo_cleanup";
  for (const entry of later.filter(entry => entry >= matchingExpansion && entry < photoDeletionExpansion)) cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  run(["migrate", "deploy", "--config", config]);
  const inferred = await database.query('SELECT EXISTS (SELECT 1 FROM "DiscoveryMatchPreferences") OR EXISTS (SELECT 1 FROM "DiscoveryMatchPreferenceGuard") AS inferred');
  if (inferred.rows[0].inferred || JSON.stringify(beforeMatching) !== JSON.stringify(await matchingBaseline())) throw new Error("Matching migration populated owner settings or changed historical records");
  const newFields = await database.query(`SELECT EXISTS (SELECT 1 FROM "Relationship" WHERE "directLockedInAt" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Notification" WHERE "conversationId" IS NOT NULL) OR EXISTS (SELECT 1 FROM "AccountDeletionRequest") AS inferred`);
  if (newFields.rows[0].inferred) throw new Error("Lock In or deletion request migrations inferred choices for historical accounts");
  console.log("Matching migration preserved historical records and did not infer settings.");
  const manualRequestId = randomUUID();
  await database.query(`INSERT INTO "AccountDeletionRequest" (id,"userId") VALUES ($1,'discovery-preserved-a')`, [manualRequestId]);
  for (const entry of later.filter(entry => entry >= photoDeletionExpansion)) cpSync(path.join(migrations, entry), path.join(temp, "migrations", entry), { recursive: true });
  run(["migrate", "deploy", "--config", config]);
  const manual = await database.query(`SELECT state,"lastCleanupCheckAt" FROM "AccountDeletionRequest" WHERE id=$1`, [manualRequestId]);
  if (manual.rows[0]?.state !== "MANUAL_REQUEST" || manual.rows[0]?.lastCleanupCheckAt !== null) throw new Error("Photo cleanup migration changed the meaning of an existing manual request");
  await database.query(`DELETE FROM "AccountDeletionRequest" WHERE id=$1`, [manualRequestId]);
  console.log("Photo cleanup migration preserved existing manual requests and did not authorize deletion.");
  const files = process.env.DISCOVERY_TEST_FILES?.split(",").filter(Boolean) ?? ["api/src"];
  const migrationTest = "api/src/features/messaging/test/messaging-migration.integration.spec.ts";
  const rolloutTest = "api/src/features/messaging/test/messaging-rollout.integration.spec.ts";
  // The backfill deliberately scans all sources. Do not run it against other
  // test files' concurrently mutating fixtures in this shared disposable DB.
  if (!process.env.DISCOVERY_TEST_FILES) {
    execFileSync("npm", ["test", "--", migrationTest], { cwd: services, env: childEnv, stdio: "inherit" });
    execFileSync("npm", ["test", "--", rolloutTest], { cwd: services, env: childEnv, stdio: "inherit" });
  }
  execFileSync("npm", ["test", "--", ...files, ...(!process.env.DISCOVERY_TEST_FILES ? ["--exclude", migrationTest,"--exclude",rolloutTest] : [])], { cwd: services, env: childEnv, stdio: "inherit" });
  if(process.argv.includes("--browser")) execFileSync(process.execPath,["--import","tsx",path.join(services,"scripts/verify-discovery-browser.mjs")],{cwd:services,env:childEnv,stdio:"inherit"});
  if(process.argv.includes("--messaging-browser")) execFileSync(process.execPath,["--import","tsx",path.join(services,"scripts/verify-shared-messaging-browser.mjs")],{cwd:services,env:childEnv,stdio:"inherit"});
} finally {
  await database?.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  rmSync(temp, { recursive: true, force: true });
}
