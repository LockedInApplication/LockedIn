import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SessionStage from "@/features/check-ins/SessionStage";
import type { JourneySession } from "../journey.types";
import TogetherDestinations from "./TogetherDestinations";

const session: JourneySession = {
  id: "conversation", topic: "Feeling connected", packKey: "support", createdAt: "2026-11-20T12:00:00Z",
  status: "REVEALED", questions: [],
  ownResponse: { answers: {}, shareKeys: [], contextNotes: {}, contextShareKeys: [], revealConsented: true },
  partnerState: { name: "Jordan", submitted: true, revealConsented: true },
  bothRevealed: true, alignment: [], proposals: [], proposalHistory: [], nextSteps: [], nextStep: null,
};

it("shows separate destinations for check-ins and the shared roadmap", () => {
  const html = renderToStaticMarkup(<TogetherDestinations onNavigate={() => {}} />);
  expect(html).toContain('aria-label="Guided conversations"');
  expect(html).toContain('aria-label="Our next steps"');
  expect(html).toContain("Answer privately");
  expect(html.match(/<button/g)).toHaveLength(2);
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
