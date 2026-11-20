import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatSession, loadChatRefresh, mergeLatestMessages, prependMessages, readThroughSequence } from "./chat-state";
const message = (id: string) => ({ id, sequence: id, author: "partner" as const, text: `Text ${id}`, createdAt: "2026-11-17T00:00:00.000Z" });
afterEach(() => vi.unstubAllGlobals());
describe("shared chat state and request ownership", () => {
  it("acknowledges only a visible, current partner message", () => {
    const partner = message("9007199254740994"), self = { ...message("9007199254740995"), author: "self" as const };
    const messages = [partner, self];
    const shown=()=>true;
    expect(readThroughSequence(messages,true,true,false,shown)).toBe(partner.sequence);
    expect(readThroughSequence(messages,false,true,false,shown)).toBeNull();
    expect(readThroughSequence([self,partner],true,false,false,shown)).toBeNull();
    expect(readThroughSequence(messages,true,false,false,shown)).toBe(partner.sequence);
    expect(readThroughSequence(messages,true,true,true,shown)).toBeNull();
    expect(readThroughSequence(messages,true,true,false,()=>false)).toBeNull();
    expect(readThroughSequence([self],true,true,false,shown)).toBeNull();
    expect(readThroughSequence([],true,true,false,shown)).toBeNull();
  });
  it("can mark the newest visible text behind an unread date invite without marking the invite", () => {
    const text = message("12");
    const invite = { ...message("13"), datePlanEvent: {
      id: "plan", action: "propose" as const, sourceMessageId: "venue", venueName: "Gallery",
      startsAt: "2026-11-21T12:00:00Z", timeZone: "UTC", state: "pending" as const, revision: 1,
    } };
    const entries = [text, invite];
    expect(readThroughSequence(entries, true, true, false, () => true, true)).toBe("12");
    expect(readThroughSequence(entries, true, false, false, row => row.id === text.id, true)).toBe("12");
    expect(readThroughSequence(entries, true, true, false, row => row.id === invite.id, true)).toBeNull();
    expect(readThroughSequence(entries, true, true, false, () => true)).toBe("13");
  });
  it("keeps loaded history on overlapping refresh and removes duplicate messages", () => {
    expect(mergeLatestMessages({ items: [message("1"),message("2")], nextCursor: "1" },{ items: [message("2"),message("3")], nextCursor: null })).toEqual({ items: [message("1"),message("2"),message("3")], nextCursor: "1" });
    expect(prependMessages({ items: [message("2"),message("3")], nextCursor: "2" },{ items: [message("1"),message("2")], nextCursor: null }).items.map(m => m.id)).toEqual(["1","2","3"]);
    expect(mergeLatestMessages({ items: [message("1")], nextCursor: null },{ items: [message("8")], nextCursor: "8" }).items.map(m => m.id)).toEqual(["8"]);
  });
  it("fills a multi-page refresh gap before extending the mounted history", async () => {
    const page = (ids: string[], nextCursor: string | null) => ({ items: ids.map(message), nextCursor });
    const previous = page(["1", "3", "5"], null);
    const load = vi.fn(async (before?: string) => before === "12" ? page(["8", "10"], "8") : before === "8" ? page(["3", "5", "7"], "3") : page(["12", "14"], "12"));
    const refresh = await loadChatRefresh(previous, load);
    expect(load.mock.calls).toEqual([[], ["12"], ["8"]]);
    expect(refresh.deferred).toBeNull();
    expect(mergeLatestMessages(previous, refresh.contiguous!)).toEqual(page(["1", "3", "5", "7", "8", "10", "12", "14"], null));
  });
  it("bounds large catch-ups without discarding or splicing across visible history", async () => {
    const previous = { items: [message("1")], nextCursor: null };
    const load = vi.fn(async (before?: string) => {
      const id = String(before ? Number(before) - 1 : 100);
      return { items: [message(id)], nextCursor: id };
    });
    const refresh = await loadChatRefresh(previous, load);
    expect(load.mock.calls.length).toBeGreaterThan(1);
    expect(load.mock.calls.length).toBeLessThanOrEqual(6);
    expect(refresh).toEqual({ contiguous: null, deferred: { items: [message("100")], nextCursor: "100" } });
  });
  it("reuses the receipt on an unchanged retry and never forwards a stale account response", async () => {
    const requests: RequestInit[] = []; let fail = true;
    vi.stubGlobal("fetch",async (_url: string, init: RequestInit) => { requests.push(init); if (fail) { fail=false; throw Error("offline"); } return Response.json({ ownerId: "a", value: message("1") }); });
    const session = new ChatSession("a","conversation");
    await expect(session.send("Hello")).rejects.toThrow("offline");
    await session.send("Hello");
    expect(JSON.parse(requests[0]!.body as string).requestId).toBe(JSON.parse(requests[1]!.body as string).requestId);
    expect(new Headers(requests[1]!.headers).get("x-messaging-owner")).toBe("a");
    expect(requests[1]!.credentials).toBe("include"); expect(requests[1]!.cache).toBe("no-store");
    session.close(); expect(requests[1]!.signal?.aborted).toBe(true);
    await expect(session.send("Old account text")).rejects.toThrow(); expect(requests).toHaveLength(2);
    vi.stubGlobal("fetch",async () => Response.json({ ownerId: "a", value: message("1") }));
    const switched = new ChatSession("b","conversation");
    await expect(switched.load()).rejects.toMatchObject({ status: 409 });
  });
  it("aborts old history and refuses sends after the mounted identity is disposed", async () => {
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch",async (_url: string, init: RequestInit) => { signal=init.signal; return Response.json({ ownerId: "a", value: { items: [], nextCursor: null } }); });
    const session = new ChatSession("a","first"); await session.load(); session.close();
    expect(signal?.aborted).toBe(true);
    await expect(session.load()).rejects.toThrow();
  });
});
