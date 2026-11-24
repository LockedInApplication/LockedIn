import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SessionStage from "@/features/check-ins/SessionStage";
import type { JourneyOverview, JourneySession } from "../journey.types";
import SharedJourneyPath from "./SharedJourneyPath";
import WorkspaceNav from "./WorkspaceNav";
import TogetherChatActions from "./TogetherChatActions";
import { QuietTogetherHome, TogetherHomeHeading, TogetherPlan, TogetherWelcome } from "./TogetherHome";
import { getTogetherNextUp, getUpcomingTogetherPlan, shouldCelebrateLockIn } from "../together-home";
import type { SimplePlan } from "@/features/roadmap/roadmap.types";

const session: JourneySession = {
  id: "conversation", topic: "Feeling connected", packKey: "support", createdAt: "2026-11-20T12:00:00Z",
  status: "REVEALED", questions: [],
  ownResponse: { answers: {}, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: true },
  partnerState: { name: "Jordan", submitted: true, revealConsented: true },
  bothRevealed: true, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
};
const plan: SimplePlan = { id: "a/b", title: "Try the café", status: "ACCEPTED", note: null, day: "2099-11-24", completionOpensAt: "2099-11-24T05:00:00.000Z", version: 1, yours: true, proposerName: "Devon", resolvedBy: null };
const overview: JourneyOverview = {
  user: { id: "me", name: "Devon", email: "devon@example.test" },
  relationship: { id: "space", isMutuallyLockedIn: true, partner: { name: "Maya", email: "maya@example.test" } },
  messaging: { enabled: true, conversationId: "chat" }, pendingInvites: [], session: null,
  simplePlans: [plan], checkInHistory: [], conversationPacks: [], conversationSelection: null, atlas: { words: [] },
};

it("prioritizes the right Inbox action and keeps Discover on the photo welcome", () => {
  const fresh = renderToStaticMarkup(<TogetherWelcome canInvite hasInboxActivity={false} />);
  const returning = renderToStaticMarkup(<TogetherWelcome canInvite hasInboxActivity />);
  const paused = renderToStaticMarkup(<TogetherWelcome canInvite={false} hasInboxActivity />);
  expect(fresh).toContain("Make time <span>for <em>someone.</em></span>");
  expect(fresh).toContain('alt="Two coffees on a café table, one with a heart in the foam"');
  expect(fresh.indexOf("Invite someone you know")).toBeLessThan(fresh.indexOf("Open Inbox"));
  expect(returning.indexOf("Open Inbox")).toBeLessThan(returning.indexOf("Invite someone you know"));
  expect(paused).not.toContain("Invite someone you know");
  for (const page of [fresh, returning, paused]) expect(page).toContain('href="/discover"');
  expect(fresh).toContain('href="#lock-in-details"');
  expect(fresh).toContain('id="lock-in-details"');
  expect(fresh).toContain("Your existing chats stay open.");
  expect(fresh).toContain("Example · 1 of 3 landmarks explored");
  expect(fresh).toContain("Ask if I want advice or just someone to listen.");
  expect(fresh.match(/<details\b/g)).toHaveLength(3);
  expect(renderToStaticMarkup(<TogetherWelcome canInvite hasInboxActivity={false} requiresLockIn={false} />)).not.toContain("What unlocks");
});

it("celebrates a recent server-confirmed choice only once", () => {
  const now = Date.parse("2026-11-22T15:00:00.000Z");
  const recent = "2026-11-22T14:59:59.000Z";
  expect(shouldCelebrateLockIn(recent, null, now)).toBe(true);
  expect(shouldCelebrateLockIn(recent, recent, now)).toBe(false);
  expect(shouldCelebrateLockIn("2026-11-21T14:59:59.000Z", null, now)).toBe(false);
  expect(shouldCelebrateLockIn("2026-11-23T14:59:59.000Z", null, now)).toBe(false);
  expect(shouldCelebrateLockIn("invalid", null, now)).toBe(false);
  const props = { userId: "me", user: { name: "Devon", avatarPreset: "sun" }, partner: { name: "Maya", avatarPreset: "moon" } };
  const shared = renderToStaticMarkup(<TogetherHomeHeading {...props} locked />);
  expect(shared).toContain("You &amp; Maya");
  expect(shared).toContain("You both chose to lock in.");
  expect(shared).toContain('data-preset="moon"');
  expect(renderToStaticMarkup(<TogetherHomeHeading {...props} locked={false} />)).not.toContain("You both chose");
});

it("shows only the next actual shared plan and links directly to it", () => {
  const base: SimplePlan = { id: "a/b", title: "Try the café", status: "ACCEPTED", note: null, day: "2026-11-24", completionOpensAt: "2026-11-24T05:00:00.000Z", version: 1, yours: true, proposerName: "Devon", resolvedBy: null };
  const otherPlans = [
    { ...base, id: "past", day: "2026-11-20" },
    { ...base, id: "pending", status: "PENDING", day: "2026-11-22" } as const,
    { ...base, id: "undated", day: null },
  ];
  expect(getUpcomingTogetherPlan([...otherPlans, base], "2026-11-22")).toEqual(base);
  expect(getUpcomingTogetherPlan(otherPlans.slice(0, 2), "2026-11-22")).toBeUndefined();
  const html = renderToStaticMarkup(<TogetherPlan plan={base} onOpen={() => {}} />);
  expect(html).toContain('href="/journey?view=roadmap#step-a%2Fb"');
  expect(html).toContain("Try the café");
});

it("opens the main chat without a draft and has no separate prompt shortcut", () => {
  const html = renderToStaticMarkup(<TogetherChatActions conversationId="chat" partnerName="Maya" confirmLeave={() => true} />);
  expect(html).toContain('href="/messages/chat?from=together"');
  expect(html).not.toContain("starter=");
  expect(html).not.toContain("Try a prompt");
  expect(html).not.toContain("<form");
});

it("puts only Talk, Plans and Memories in the home navigation", () => {
  const html = renderToStaticMarkup(<WorkspaceNav section="home" lockedTogether onNavigate={() => {}} />);
  expect(html.match(/<a\b/g)).toHaveLength(3);
  expect(html).toContain('href="/journey?view=talk"');
  expect(html).toContain('href="/journey?view=roadmap"');
  expect(html).toContain('href="/journey?view=memories"');
  expect(html).not.toMatch(/view=(atlas|chapters|conversations|room-to-talk)/);
});

it("puts Room to Talk, Check-ins and Atlas under Talk", () => {
  const html = renderToStaticMarkup(<WorkspaceNav section="talk" lockedTogether onNavigate={() => {}} />);
  expect(html.match(/<a\b/g)).toHaveLength(3);
  expect(html).toContain('href="/journey?view=room-to-talk"');
  expect(html).toContain('href="/journey?view=check-ins"');
  expect(html).toContain('href="/journey?view=atlas"');
  expect(html).not.toMatch(/view=(roadmap|memories|chapters)/);
});

it("keeps Memories and Room to Talk gated by the mutual lock-in", () => {
  const home = renderToStaticMarkup(<WorkspaceNav section="home" lockedTogether={false} onNavigate={() => {}} />);
  const talk = renderToStaticMarkup(<WorkspaceNav section="talk" lockedTogether={false} onNavigate={() => {}} />);
  expect(home).not.toContain("Memories");
  expect(talk).not.toContain("Room to Talk");
  expect(talk).toContain("Check-ins");
});

it("shows one timely item in Quiet home, with neither progress nor chat prompts on the page", () => {
  const waitingOnMe = { ...session, bothRevealed: false, ownResponse: null };
  const html = renderToStaticMarkup(<QuietTogetherHome overview={{ ...overview, session: waitingOnMe }}
    onNavigate={() => {}} confirmLeave={() => true} />);
  expect(html.match(/data-next-up\b/g)).toHaveLength(1);
  expect(html.indexOf("Message Maya")).toBeLessThan(html.indexOf("Answer your private check-in"));
  expect(html.indexOf("Answer your private check-in")).toBeLessThan(html.indexOf("Your space"));
  expect(html).toContain('href="/journey?view=check-ins#current-action"');
  expect(html).toContain('aria-label="Together options"');
  expect(html).not.toMatch(/Try a prompt|Shared progress|Try the café|Past check-ins/);
});

it("falls back to the next accepted plan when a check-in is waiting and leaves the slot empty when there is nothing due", () => {
  const waiting = { ...session, bothRevealed: false, partnerState: { ...session.partnerState, submitted: false } };
  expect(getTogetherNextUp({ ...overview, session: waiting }, "2026-11-24")).toEqual({ kind: "plan", plan });
  expect(getTogetherNextUp({ ...overview, simplePlans: [] }, "2026-11-24")).toBeUndefined();
  const invitation = { ownChoice: { submitted: false, packKey: null }, partnerChoice: { submitted: true, packKey: "support", name: "Maya" } };
  expect(getTogetherNextUp({ ...overview, conversationSelection: invitation })).toMatchObject({
    kind: "check-in", href: "/journey?view=conversations#your-topic", title: "Review a check-in topic",
  });
});

it("links Shared progress to the chosen conversation without making the milestones interactive", () => {
  const html = renderToStaticMarkup(<SharedJourneyPath session={null} historyCount={0} partnerName="Jordan" onViewConversations={() => {}} />);
  expect(html).toContain('href="/journey?view=conversations#your-topic"');
  expect(html).toContain('aria-labelledby="journey-map-title"');
  expect(html.match(/<a\b/g)).toHaveLength(1);
  expect(html).toContain('viewBox="0 0 600 760" aria-hidden="true"');
  const paths = [...html.matchAll(/<path[^>]+d="([^"]+)"/g)].map(match => match[1]);
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe(paths[1]);
  expect(html).toContain('stroke-dashoffset="85"');
  expect(html.match(/<li\b/g)).toHaveLength(6);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain("Reflect privately");
  expect(html).not.toMatch(/<(button|input)\b/);
});

it("only offers the check-in handoff after mutual reveal", () => {
  const props = { busy: false, onProposeNextStep: () => {}, runAction: async () => {} };
  const shared = renderToStaticMarkup(<SessionStage session={session} {...props} />);
  expect(shared).toContain("Make this a next step");
  const waiting = renderToStaticMarkup(<SessionStage {...props} session={{ ...session,
    bothRevealed: false, partnerState: { ...session.partnerState, revealConsented: false },
  }} />);
  expect(waiting).not.toContain("Make this a next step");
});
