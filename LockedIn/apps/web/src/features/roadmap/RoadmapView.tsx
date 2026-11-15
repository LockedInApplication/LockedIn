"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";
import EmptyWorkspace from "@/features/journey/components/EmptyWorkspace";
import RoadmapSteps from "./RoadmapSteps";
import ProposalChoices from "./ProposalChoices";
import NextStepForm from "./NextStepForm";
import ProposalHistory from "./ProposalHistory";

export default function RoadmapView({
  session,
  busy,
  runAction,
}: {
  session: JourneySession | null;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  if (!session) {
    return <EmptyWorkspace title="Your roadmap is still open." detail="Complete a guided conversation, then propose the first next step you both want to take." />;
  }

  return (
    <div className={styles.roadmapPage}>
      <section className={styles.sectionHero}>
        <span className={styles.eyebrow}>YOUR SHARED ROADMAP</span>
        <h2>Agreements with room to change.</h2>
        <p>Every accepted step keeps its own timing and private reflection. One plan never silently replaces another.</p>
      </section>
      {session.nextSteps.length ? <RoadmapSteps session={session} busy={busy} runAction={runAction} /> : null}
      {session.proposals.length ? <ProposalChoices session={session} busy={busy} runAction={runAction} /> : null}
      {session.bothRevealed ? <NextStepForm session={session} busy={busy} runAction={runAction} /> : (
        <div className={styles.noComparison}>Finish the current check-in together before proposing a new roadmap step.</div>
      )}
      {session.proposalHistory.length ? <ProposalHistory session={session} /> : null}
    </div>
  );
}
