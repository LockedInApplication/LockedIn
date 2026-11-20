"use client";

import { journeyRequest } from "@/features/journey/journey.client";
import type { JourneySession } from "@/features/journey/journey.types";
import AlignmentStage from "./AlignmentStage";
import IntentionForm from "./IntentionForm";
import RevealStage from "./RevealStage";
import WaitingCard from "./WaitingCard";

export type SessionStageProps = {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
  onProposeNextStep?: () => void;
};

export default function SessionStage({
  session,
  busy,
  runAction,
  onProposeNextStep,
}: SessionStageProps) {
  if (!session.ownResponse) {
    return (
      <IntentionForm
        session={session}
        busy={busy}
        onSubmit={(answers, shareKeys, contextNotes, contextShareKeys) =>
          runAction(
            () =>
              journeyRequest(`/api/journey/sessions/${session.id}/responses`, {
                method: "PUT",
                body: JSON.stringify({ answers, shareKeys, contextNotes, contextShareKeys }),
              }),
            "Your intentions are saved privately.",
          )
        }
      />
    );
  }

  if (!session.partnerState.submitted) {
    return <WaitingCard title="Your reflection is saved." name={session.partnerState.name} detail="They can answer independently when they are ready. Your answers are still private." />;
  }

  if (!session.ownResponse.revealConsented) {
    return (
      <RevealStage
        session={session}
        busy={busy}
        onReveal={() =>
          runAction(
            () => journeyRequest(`/api/journey/sessions/${session.id}/reveal`, { method: "POST" }),
            "Your reveal consent is saved.",
          )
        }
      />
    );
  }

  if (!session.partnerState.revealConsented) {
    return <WaitingCard title="You chose what to reveal." name={session.partnerState.name} detail="The comparison will open only after both people consent. You cannot see their answers yet." />;
  }

  return <AlignmentStage session={session} onProposeNextStep={session.bothRevealed ? onProposeNextStep : undefined} />;
}
