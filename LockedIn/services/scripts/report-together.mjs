import { spawnSync } from "node:child_process";
import { Client } from "pg";

const reader = "lockedin_report_reader";
const service = "LockedIn Together Reporting";
const [week, ...extra] = process.argv.slice(2);

function credential() {
  if (process.env.LOCKEDIN_REPORT_DATABASE_URL) return process.env.LOCKEDIN_REPORT_DATABASE_URL;
  if (process.platform !== "darwin") return null;
  const result = spawnSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", reader, "-w"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function connection(raw) {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(url.pathname.slice(1));
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || decodeURIComponent(url.username) !== reader
    || !host || !database || database.includes("/") || url.hash || (!local && !url.password)) throw new Error("Wrong login");
  return {
    host, port: Number(url.port || 5432), database, user: reader, password: decodeURIComponent(url.password),
    // Ignore all URL options; they must not override the account or disable TLS.
    ssl: local ? false : { rejectUnauthorized: true },
    application_name: "lockedin-weekly-report", connectionTimeoutMillis: 12000,
  };
}

function monday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCDay() === 1 && date.toISOString().slice(0, 10) === value;
}

if (extra.length || (week !== undefined && !monday(week))) {
  console.error("Provide a Monday in YYYY-MM-DD format, or no date for the latest completed week.");
  process.exitCode = 1;
} else {
  let client;
  try {
    const secret = credential();
    if (!secret) {
      console.error("Read-only Together reporting has not been connected on this machine. See docs/plan-memories-pilot.md.");
      process.exitCode = 1;
    } else {
      client = new Client(connection(secret));
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const { rows } = await client.query("SELECT lockedin_reporting.weekly_together_report($1::date) AS report", [week ?? null]);
      await client.query("COMMIT");
      if (rows[0]?.report) {
        console.log(JSON.stringify(rows[0].report, null, 2));
      } else {
        console.error("Choose a completed UTC week within the last 52 weeks.");
        process.exitCode = 1;
      }
    }
  } catch {
    // Client/URL errors may include connection details. Do not print them.
    console.error("Couldn’t run the Together report. Check the report-only login, allowed network, and migration.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
