import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SessionStage from "@/features/check-ins/SessionStage";
import type { JourneySession } from "../journey.types";
import SharedJourneyPath from "./SharedJourneyPath";
import WorkspaceNav from "./WorkspaceNav";

const session: JourneySession = {
  id: "conversation", topic: "Feeling connected", packKey: "support", createdAt: "2026-11-20T12:00:00Z",
  status: "REVEALED", questions: [],
  ownResponse: { answers: {}, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: true },
  partnerState: { name: "Jordan", submitted: true, revealConsented: true },
  bothRevealed: true, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
};

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

it("shows progress without any clickable milestones", () => {
  const html = renderToStaticMarkup(<SharedJourneyPath session={null} historyCount={0} partnerName="Jordan" />);
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
