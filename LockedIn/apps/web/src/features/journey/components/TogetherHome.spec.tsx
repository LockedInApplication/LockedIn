import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SessionStage from "@/features/check-ins/SessionStage";
import type { JourneySession } from "../journey.types";
import SharedJourneyPath from "./SharedJourneyPath";
import WorkspaceNav from "./WorkspaceNav";
import TogetherChatActions from "./TogetherChatActions";
import { TogetherHomeHeading, TogetherPlan, TogetherWelcome } from "./TogetherHome";
import { getUpcomingTogetherPlan, shouldCelebrateLockIn } from "../together-home";
import type { SimplePlan } from "@/features/roadmap/roadmap.types";

const session: JourneySession = {
  id: "conversation", topic: "Feeling connected", packKey: "support", createdAt: "2026-11-20T12:00:00Z",
  status: "REVEALED", questions: [],
  ownResponse: { answers: {}, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: true },
  partnerState: { name: "Jordan", submitted: true, revealConsented: true },
  bothRevealed: true, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
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

it("makes the main message link draft-free and offers the prompt as a separate action", () => {
  const html = renderToStaticMarkup(<TogetherChatActions conversationId="chat" partnerName="Maya" confirmLeave={() => true} />);
  expect(html).toContain('href="/messages/chat?from=together"');
  expect(html).toContain('href="/messages/chat?from=together&amp;starter=good-memory"');
  expect(html.indexOf("Message Maya")).toBeLessThan(html.indexOf("Try a prompt"));
  expect(html).not.toContain("<form");
});

it("uses quiet links for Atlas, next steps, and history without duplicating the topic picker", () => {
  const html = renderToStaticMarkup(<WorkspaceNav active="home" onChange={() => {}} />);
  expect(html.match(/<a\b/g)).toHaveLength(3);
  expect(html).toContain('href="/journey?view=atlas">Atlas</a>');
  expect(html).toContain('href="/journey?view=roadmap">Our next steps</a>');
  expect(html).toContain('href="/journey?view=chapters">Past conversations</a>');
  expect(html).not.toContain('view=conversations');
});

it("preserves the workspace navigation when viewing a destination", () => {
  const html = renderToStaticMarkup(<WorkspaceNav active="atlas" onChange={() => {}} />);
  expect(html.match(/<a\b/g)).toHaveLength(5);
  expect(html).toContain('href="/journey"');
  expect(html).toContain('href="/journey?view=conversations"');
  expect(html).toContain('aria-current="page"');
});

it("offers Behind the Photo only in a mutually locked-in workspace", () => {
  const closed = renderToStaticMarkup(<WorkspaceNav active="home" onChange={() => {}} />);
  expect(closed).not.toContain("Behind the Photo");
  const open = renderToStaticMarkup(<WorkspaceNav active="home" memoriesAvailable onChange={() => {}} />);
  expect(open).toContain('href="/journey?view=memories">Behind the Photo</a>');
});

it("renders the illustrated map without any clickable milestones", () => {
  const html = renderToStaticMarkup(<SharedJourneyPath session={null} historyCount={0} partnerName="Jordan" />);
  expect(html).toContain('viewBox="0 0 600 760" aria-hidden="true"');
  const paths = [...html.matchAll(/<path[^>]+d="([^"]+)"/g)].map(match => match[1]);
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe(paths[1]);
  expect(html).toContain('stroke-dashoffset="85"');
  expect(html.match(/<li\b/g)).toHaveLength(6);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain("Reflect privately");
  expect(html).not.toMatch(/<(a|button|input)\b/);
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
