"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";
import RoadmapSteps from "./RoadmapSteps";
import ProposalChoices from "./ProposalChoices";
import NextStepForm from "./NextStepForm";
import ProposalHistory from "./ProposalHistory";
import SimplePlans from "./SimplePlans";
import type { SimplePlan } from "./roadmap.types";
import { useState } from "react";
import localStyles from "./styles/simple-plans.module.scss";

export default function RoadmapView({
  session,
  relationshipId,
  userId,
  simplePlans,
  busy,
  runAction,
  onDiscard,
  onConflict,
}: {
  session: JourneySession | null;
  relationshipId: string;
  userId: string;
  simplePlans?: SimplePlan[] | null;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
  onDiscard: () => void;
  onConflict: () => void;
}) {
  const [simpleEditing, setSimpleEditing] = useState(false);
  const [legacyDirty, setLegacyDirty] = useState(false);
  function runLegacyAction(action: () => Promise<unknown>, successMessage?: string) {
    return runAction(async () => {
      await action();
      setLegacyDirty(false);
    }, successMessage);
  }
  return (
    <div className={styles.roadmapPage}>
      {simplePlans ? <SimplePlans plans={simplePlans} relationshipId={relationshipId} userId={userId} busy={busy || legacyDirty} runAction={runAction} onDiscard={onDiscard} onConflict={onConflict} onEditing={setSimpleEditing} /> : null}
      {legacyDirty ? <p>Finish the check-in form before changing a separate plan.</p> : null}
      {session ? <fieldset className={localStyles.legacy} aria-label="Guided check-in next steps" disabled={busy || simpleEditing} onChangeCapture={() => setLegacyDirty(true)}>
        {session.nextSteps.length ? <RoadmapSteps session={session} busy={busy} runAction={runLegacyAction} /> : null}
        {session.proposals.length ? <ProposalChoices session={session} busy={busy} runAction={runLegacyAction} /> : null}
        {session.bothRevealed ? <NextStepForm session={session} busy={busy} runAction={runLegacyAction} /> : null}
        {session.proposalHistory.length ? <ProposalHistory session={session} /> : null}
      </fieldset> : null}
      {!simplePlans && !session ? <p>Plan suggestions are not available right now.</p> : null}
    </div>
  );
}
