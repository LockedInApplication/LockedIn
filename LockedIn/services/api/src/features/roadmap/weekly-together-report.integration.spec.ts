import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPerson } from "../discovery/test/discovery.fixtures.js";

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("weekly Together reporting", () => {
  let db: typeof import("../../lib/prisma.js").prisma;
  const scripts = new URL("../../../../scripts/", import.meta.url);
  const readerName = "lockedin_report_reader";
  beforeAll(async () => { ({ prisma: db } = await import("../../lib/prisma.js")); });
  afterAll(async () => { await db?.$disconnect(); });

  async function report(week: string | null) {
    const [row] = await db.$queryRaw<{ report: object | null }[]>`SELECT lockedin_reporting.weekly_together_report(${week}::date) AS report`;
    return row?.report;
  }

  it("counts distinct shared pairs and dated plan actions without content, including the seven/thirty-day boundaries", async () => {
    const [{ week }] = await db.$queryRaw<{ week: string }[]>`SELECT
      (date_trunc('week', statement_timestamp() AT TIME ZONE 'UTC')::date - 56)::text AS week`;
    const at = (days: number) => new Date(Date.parse(`${week}T12:00:00Z`) + days * 86_400_000);
    const day = (days: number) => at(days).toISOString().slice(0, 10);
    const createPair = async () => {
      const a = await createPerson(), b = await createPerson();
      const { id } = await db.relationship.create({ data: {
        directLockedInAt: at(-12), members: { create: [{ userId: a.id }, { userId: b.id }] },
      } });
      return { id, a: a.id, b: b.id };
    };
    const enroll = (id: string, offset = -12) => db.$executeRaw`INSERT INTO lockedin_reporting.pilot_pair
      (relationship_id, enrolled_at) VALUES (${id}, ${at(offset)})`;
    async function memory(pair: Awaited<ReturnType<typeof createPair>>, days: number, both: boolean) {
      const time = at(days);
      const plan = await db.roadmapPlan.create({ data: {
        relationshipId: pair.id, proposerId: pair.a, title: "PRIVATE PLAN", note: "PRIVATE PLAN NOTE",
        status: "DONE", createdAt: time, acceptedAt: time, completedAt: time,
      } });
      await db.togetherPhoto.create({ data: {
        relationshipId: pair.id, uploaderId: pair.a, sourcePlanId: plan.id, title: "PRIVATE PHOTO",
        width: 120, height: 90, jpeg: new Uint8Array([1]), createdAt: time,
        pins: { create: { title: "PRIVATE PIN", x: 5000, y: 5000, notes: { create: {
          ...(both ? { authorId: pair.b, voice: new Uint8Array(32044), voiceDurationMs: 1000 }
            : { authorId: pair.a, text: "PRIVATE WRITTEN DETAIL" }), createdAt: time,
        } } } },
      } });
    }
    const pairs = await Promise.all(Array.from({ length: 7 }, createPair));
    const [a, b, c, d, e, late, unenrolled] = pairs;
    await Promise.all([a, b, c, d].map(pair => enroll(pair.id)));
    expect(await report(week)).toEqual({ weekStart: week, weekEndExclusive: day(7), timeZone: "UTC", status: "insufficient_cohort" });
    await enroll(e.id);
    await enroll(late.id, 3);
    await Promise.all([a, b, c, d, e, unenrolled].map(pair => memory(pair, 1, true)));
    await Promise.all([memory(a, 8, true), memory(b, 31, true), memory(c, 7, true), memory(d, 32, true), memory(e, 5, false)]);
    await db.roadmapPlan.createMany({ data: [
      { relationshipId: a.id, proposerId: a.a, title: "PRIVATE CANCELED PLAN", status: "CANCELED", createdAt: at(-2), acceptedAt: at(0) },
      { relationshipId: late.id, proposerId: late.a, title: "PRIVATE BEFORE ENROLLMENT", createdAt: at(2), acceptedAt: at(2), status: "ACCEPTED" },
      { relationshipId: late.id, proposerId: late.a, title: "PRIVATE AFTER ENROLLMENT", createdAt: at(3) },
    ] });
    expect(await report(week)).toEqual({
      status: "ok", weekStart: week, weekEndExclusive: day(7), timeZone: "UTC", enrolledPairs: 6,
      pairsWithSharedAction: 5, plansProposed: 7, plansAccepted: 7, plansMarkedDone: 6,
      savedMemories: 6, memoriesWithBothPeople: 5,
      repeatMemories: { status: "ok", pairsWithFullFollowUp: 5, pairsWithAnotherSharedMemory: 2 },
    });
    expect(await report(day(1))).toBeNull();
    expect(await report(null)).toMatchObject({ status: "ok", repeatMemories: { status: "insufficient_follow_up" } });
    await db.$executeRaw`DELETE FROM lockedin_reporting.pilot_pair WHERE relationship_id = ${a.id}`;
    expect(await report(week)).toMatchObject({ enrolledPairs: 5, pairsWithSharedAction: 4, repeatMemories: { status: "insufficient_follow_up" } });
  });

  it("provisions a login that can only get totals, rejects broad public grants, and runs the same CLI used on demand", async () => {
    const fixture = new URL(process.env.DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(fixture.hostname) || !/^\/lockedin_discovery_test_[a-f0-9]{24}$/.test(fixture.pathname)) {
      throw new Error("Privilege tests require a disposable local harness database.");
    }
    const admin = new Client({ connectionString: fixture.toString() });
    const provision = readFileSync(new URL("provision-together-report-reader.sql", scripts), "utf8");
    let reader: Client | undefined, created = false;
    await admin.connect();
    try {
      const { rows: [permissions] } = await admin.query(`SELECT
        EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) WHERE grantee = 0) AS public_function,
        EXISTS(SELECT FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) WHERE grantee = 0) AS public_schema
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.oid = 'lockedin_reporting.weekly_together_report(date)'::regprocedure`);
      expect(permissions).toEqual({ public_function: false, public_schema: false });
      await admin.query('GRANT SELECT ("id") ON public."RoadmapPlan" TO PUBLIC');
      try {
        await expect(admin.query(provision)).rejects.toThrow("Existing database grants");
      } finally {
        await admin.query("ROLLBACK");
        await admin.query('REVOKE SELECT ("id") ON public."RoadmapPlan" FROM PUBLIC');
      }
      await admin.query(provision);
      created = true;
      const { rows: [role] } = await admin.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = $1", [readerName]);
      expect(role.rolcanlogin).toBe(false);
      await admin.query("ALTER ROLE lockedin_report_reader LOGIN"); // Local fixture uses trust; no real credential.
      fixture.username = readerName;
      fixture.password = "";
      reader = new Client({ connectionString: fixture.toString() });
      await reader.connect();
      const { rows: [setting] } = await reader.query("SHOW default_transaction_read_only");
      expect(setting.default_transaction_read_only).toBe("on");
      const { rows: [answer] } = await reader.query("SELECT lockedin_reporting.weekly_together_report() AS report");
      expect(answer.report).toHaveProperty("status");
      for (const sql of [
        'SELECT title, note FROM public."RoadmapPlan"',
        'SELECT jpeg FROM public."TogetherPhoto"',
        'SELECT text, voice FROM public."TogetherPhotoNote"',
        'SELECT * FROM lockedin_reporting.pilot_pair',
      ]) {
        await expect(reader.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
      await reader.query("BEGIN READ WRITE");
      try {
        await expect(reader.query('UPDATE public."RoadmapPlan" SET title = \'denied\'')).rejects.toMatchObject({ code: "42501" });
      } finally { await reader.query("ROLLBACK"); }
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("report-together.mjs", scripts))], {
        env: { ...process.env, LOCKEDIN_REPORT_DATABASE_URL: fixture.toString() },
      });
      expect(JSON.parse(stdout)).toEqual(answer.report);
      expect(stderr).toBe("");
    } finally {
      await reader?.end();
      if (created) {
        await admin.query(`REVOKE EXECUTE ON FUNCTION lockedin_reporting.weekly_together_report(DATE) FROM lockedin_report_reader;
          REVOKE USAGE ON SCHEMA lockedin_reporting FROM lockedin_report_reader;
          REVOKE CONNECT ON DATABASE ${fixture.pathname.slice(1)} FROM lockedin_report_reader;
          DROP ROLE lockedin_report_reader;`);
      }
      await admin.end();
    }
  });
});
