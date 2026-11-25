import { generateKeyPairSync, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockedInReportPath, lockedInReportProtocol, lockedInReportResponse } from "./lockedin-report-protocol.js";
import { registerLockedInReport } from "./lockedin-report.routes.js";

const withheld = { acceptedInvites: null, firstTwoWayChats: null, repeatTwoWayChats: null };
const dayMs = 86_400_000;

describe.skipIf(process.env.DISCOVERY_INTEGRATION !== "true")("weekly LockedIn report (disposable database)", () => {
  let db: typeof import("../../lib/prisma.js").prisma;
  beforeAll(async () => { ({ prisma: db } = await import("../../lib/prisma.js")); });
  afterAll(async () => { await db?.$disconnect(); });

  async function period(offset: number) {
    const [row] = await db.$queryRaw<{ week: string }[]>`SELECT
      (date_trunc('week', statement_timestamp() AT TIME ZONE 'UTC')::date + ${offset}::int)::text AS week`;
    const at = (days: number, hour = 0) => new Date(Date.parse(row.week + "T00:00:00Z") + days * dayMs + hour * 3_600_000);
    return { ...row, at };
  }

  async function report(week: string | null) {
    const [row] = await db.$queryRaw<{ report: unknown }[]>`
      SELECT lockedin_reporting.weekly_lockedin_report(${week}::date) AS report`;
    return row.report === null ? null : lockedInReportResponse.parse(row.report);
  }

  async function newAccount(createdAt: Date, emailVerified = false) {
    const id = randomUUID();
    await db.user.create({ data: { id, email: "synthetic-" + id + "@example.test", createdAt, emailVerified } });
    return id;
  }

  function permit(id: string, at: Date) {
    return db.$executeRaw`INSERT INTO lockedin_reporting.weekly_app_permission
      (user_id, granted_at) VALUES (${id}, ${at})`;
  }

  async function newPair(createdAt: Date, grantedAt: Date, allowed = true) {
    const [low, high] = (await Promise.all([newAccount(createdAt), newAccount(createdAt)])).sort();
    if (allowed) await Promise.all([permit(low, grantedAt), permit(high, grantedAt)]);
    return { low, high };
  }

  type Pair = Awaited<ReturnType<typeof newPair>>;
  function acceptDirect(pair: Pair, acceptedAt: Date) {
    return db.relationshipInvite.create({ data: {
      inviterId: pair.high, inviteeId: pair.low, status: "ACCEPTED", acceptedAt, createdAt: acceptedAt,
    } });
  }

  async function chat(route: "discover" | "direct", pair: Pair, acceptedAt: Date) {
    const source = route === "discover"
      ? await db.discoveryConnection.create({ data: {
        userLowId: pair.low, userHighId: pair.high, inviterId: pair.low, state: "ACCEPTED", acceptedAt,
        expiresAt: new Date(acceptedAt.getTime() + 2 * dayMs), createdAt: acceptedAt,
        questionKey: "synthetic", questionText: "Synthetic prompt", hello: "Synthetic greeting",
        senderPublicName: "Synthetic user", senderAvatarPreset: "leaf",
      } })
      : await acceptDirect(pair, acceptedAt);
    const { id } = await db.chatConversation.create({ data: {
      userLowId: pair.low, userHighId: pair.high,
      createdAt: acceptedAt,
      ...(route === "discover"
        ? { origin: "DISCOVERY", accessMode: "DISCOVERY", discoveryConnectionId: source.id }
        : { origin: "DIRECT_INVITATION", accessMode: "DIRECT_INVITATION", directInvitationId: source.id }),
    } });
    return { ...pair, id, sourceId: source.id };
  }

  type Chat = Awaited<ReturnType<typeof chat>>;
  async function send(target: Chat, values: [sender: string, time: Date, generated?: "plan" | "place"][]) {
    await db.discoveryMessage.createMany({ data: values.map(([senderId, createdAt, kind]) => ({
      conversationId: target.id, requestId: randomUUID(), senderId, createdAt,
      text: "Synthetic message content that must never be reported",
      ...(kind === "plan" ? { datePlanEvent: { test: true } } : kind === "place" ? { dateSpotPlaceId: "test-only" } : {}),
    })) });
  }

  it("returns only the five requested metrics, preserves chat origin, and excludes activity outside permission and time windows", async () => {
    const { week, at } = await period(-56);
    const signupIds = await Promise.all(Array.from({ length: 12 }, (_, i) => newAccount(at(0), i < 6)));
    await Promise.all(signupIds.map(id => permit(id, at(0))));
    await newAccount(at(2), true); // no permission
    await permit(await newAccount(at(2), true), at(3)); // signup precedes permission
    await permit(await newAccount(at(7), true), at(7)); // exactly next week
    const [discover, direct] = await Promise.all([
      Promise.all(Array.from({ length: 15 }, async () => chat("discover", await newPair(at(-1), at(-1)), at(1)))),
      Promise.all(Array.from({ length: 10 }, async () => chat("direct", await newPair(at(-1), at(-1)), at(1)))),
    ]);
    const first = (c: Chat) => send(c, [[c.low, at(2, 9)], [c.high, at(2, 10)]]);
    const repeat = (c: Chat) => send(c, [[c.low, at(4, 9)], [c.high, at(5, 10)]]);
    await Promise.all([
      ...discover.slice(0, 10).map(first),
      ...discover.slice(0, 5).map(repeat),
      ...direct.slice(0, 5).map(first),
      ...direct.slice(0, 5).map(repeat),
    ]);
    // An accepted chat is still counted if it later closed.
    await db.discoveryConnection.update({ where: { id: discover[0]!.sourceId }, data: { state: "CLOSED", closedAt: at(6) } });
    // Neither a second message that day nor a one-sided follow-up is a repeat.
    await send(discover[5]!, [[discover[5]!.low, at(2, 11)], [discover[5]!.high, at(2, 12)]]);
    await send(discover[6]!, [[discover[6]!.low, at(4)], [discover[6]!.low, at(5)]]);
    await send(discover[7]!, [[discover[7]!.low, at(9, 10)], [discover[7]!.high, at(9, 11)]]);
    await db.discoveryConnection.update({ where: { id: discover[8]!.sourceId }, data: { lockedInAt: at(4) } });
    await repeat(discover[8]!); // after Lock In
    const reused = await acceptDirect(discover[9]!, at(2, 11));
    await db.chatConversation.update({ where: { id: discover[9]!.id }, data: { directInvitationId: reused.id, accessMode: "DIRECT_INVITATION" } });
    // Two messages after the direct acceptance would qualify as a new direct
    // chat if origin were ignored. They are on Discover's first exchange day.
    await send(discover[9]!, [[discover[9]!.low, at(2, 12)], [discover[9]!.high, at(2, 13)]]);
    await send(discover[10]!, [[discover[10]!.low, at(2)]]);
    await send(discover[11]!, [[discover[11]!.low, at(2)], [discover[11]!.high, at(8)]]);
    await send(discover[12]!, [[discover[12]!.low, at(2)], [discover[12]!.high, at(2, 1), "plan"]]);
    await send(discover[13]!, [[discover[13]!.low, at(0)], [discover[13]!.high, at(2)]]);
    await send(discover[14]!, [[discover[14]!.low, at(2)], [discover[14]!.high, at(2, 1), "place"]]);

    const locked = direct[5]!;
    const { id: relationshipId } = await db.relationship.create({ data: {
      directLockedInAt: at(2), members: { create: [{ userId: locked.low }, { userId: locked.high }] },
    } });
    await db.chatConversation.update({ where: { id: locked.id }, data: { relationshipId, accessMode: "RELATIONSHIP" } });
    await first(locked); // must not borrow Together activity
    const onlyTogether = await newPair(at(-1), at(-1), false);
    const togetherSpace = await db.relationship.create({ data: { members: { create: [
      { userId: onlyTogether.low }, { userId: onlyTogether.high },
    ] } } });
    await db.$executeRaw`INSERT INTO lockedin_reporting.pilot_pair (relationship_id, enrolled_at)
      VALUES (${togetherSpace.id}, ${at(-1)})`;
    await first(await chat("direct", onlyTogether, at(1)));
    const partial = await newPair(at(-1), at(-1), false);
    await permit(partial.low, at(-1));
    await first(await chat("direct", partial, at(1)));
    const late = await newPair(at(-1), at(2));
    await first(await chat("discover", late, at(1)));

    const expected = {
      weekStart: week, weekEndExclusive: at(7).toISOString().slice(0, 10), timeZone: "UTC",
      firstChatsReady: true, repeatChatsReady: true,
      accounts: { signups: 12, verifiedAccounts: 6 },
      discover: { acceptedInvites: 15, firstTwoWayChats: 10, repeatTwoWayChats: 5 },
      directInvites: { acceptedInvites: 11, firstTwoWayChats: 5, repeatTwoWayChats: 5 },
    };
    const keys = generateKeyPairSync("ed25519");
    const api = Fastify();
    await api.register(registerLockedInReport, { verificationKey: keys.publicKey });
    try {
      const url = lockedInReportPath + "?week=" + week;
      const get = () => api.inject({ url, headers: { authorization: lockedInReportProtocol.sign(keys.privateKey, url) } });
      expect(await report(week)).toEqual(expected);
      const response = await get();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expected);

      // Evidence of withdrawal excludes the entire chat for the rerun.
      await db.$executeRaw`DELETE FROM lockedin_reporting.weekly_app_permission WHERE user_id = ${discover[0]!.high}`;
      expect((await get()).json()).toEqual({
        ...expected, discover: { acceptedInvites: 14, firstTwoWayChats: 9, repeatTwoWayChats: null },
      });
    } finally {
      await api.close();
    }
  });

  it("distinguishes pending follow-up, suppresses small groups, and rejects arbitrary weeks", async () => {
    const { week, at } = await period(-7);
    const accounts = await Promise.all(Array.from({ length: 6 }, (_, i) => newAccount(at(1), i > 0)));
    await Promise.all(accounts.map(id => permit(id, at(1))));
    const pairs = await Promise.all(Array.from({ length: 5 }, () => newPair(at(-1), at(-1))));
    await Promise.all(pairs.map(pair => acceptDirect(pair, at(2))));
    const one = await newPair(at(-1), at(-1));
    await Promise.all(Array.from({ length: 8 }, () => acceptDirect(one, at(2))));
    const recent = {
      weekStart: week, weekEndExclusive: at(7).toISOString().slice(0, 10), timeZone: "UTC",
      firstChatsReady: false, repeatChatsReady: false,
      accounts: { signups: 6, verifiedAccounts: null },
      discover: withheld, directInvites: { ...withheld, acceptedInvites: 13 },
    };
    expect(await report(null)).toEqual(recent);
    expect(await report(at(1).toISOString().slice(0, 10))).toBeNull();
    expect(await report(at(7).toISOString().slice(0, 10))).toBeNull();
    expect(await report(at(-364).toISOString().slice(0, 10))).toBeNull();
    const previous = await period(-14);
    expect(await report(previous.week)).toMatchObject({ firstChatsReady: true, repeatChatsReady: false });
    const old = await period(-70);
    const pair = await newPair(old.at(-1), old.at(-1));
    await Promise.all(Array.from({ length: 8 }, () => acceptDirect(pair, old.at(2))));
    expect(await report(old.week)).toMatchObject({
      accounts: { signups: null, verifiedAccounts: null }, discover: withheld, directInvites: withheld,
    });
  });
});
