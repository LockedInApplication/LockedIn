// All writes happen in a newly created disposable database, never the app database.
import { Client } from 'pg';
import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
config({path:'api/.env',quiet:true});
const name=`lockedin_notify_test_${randomBytes(6).toString('hex')}`;
const admin=new Client({connectionString:process.env.DATABASE_URL});
await admin.connect();
let created=false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);created=true;
  const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;
  const env={...process.env,DATABASE_URL:url.toString(),NOTIFICATIONS_INTEGRATION:'true',BETTER_AUTH_SECRET:'notification-integration-only-secret-at-least-32-characters',BETTER_AUTH_URL:'http://localhost:8000',APP_URL:'http://localhost:3001',REQUIRE_EMAIL_VERIFICATION:'false'};
  execFileSync('npm',['run','prisma','--','migrate','deploy'],{env,stdio:'pipe'});
  execFileSync('npm',['test','--','api/src/features/notifications/notification.integration.spec.ts'],{env,stdio:'inherit'});
  if(process.env.NOTIFICATION_BROWSER_SCRIPT)execFileSync('node',[process.env.NOTIFICATION_BROWSER_SCRIPT],{env,stdio:'inherit'});
} finally {
  if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
