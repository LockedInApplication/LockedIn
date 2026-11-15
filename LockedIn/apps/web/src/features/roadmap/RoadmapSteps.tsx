"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";
import AcceptedStep from "./AcceptedStep";

export default function RoadmapSteps({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  return (
    <section className={styles.roadmapBoard}>
      <div className={styles.roadmapHeader}>
        <span className={styles.eyebrow}>YOUR SHARED NEXT STEPS</span>
        <h2>A roadmap with room for more than one plan.</h2>
        <p>Each step has its own timing. Reflect on them independently when their revisit dates arrive.</p>
      </div>
      <div className={styles.roadmapList}>
        {session.nextSteps.map((step, index) => (
          <AcceptedStep
            key={step.id}
            session={session}
            step={step}
            stepNumber={index + 1}
            busy={busy}
            runAction={runAction}
          />
        ))}
      </div>
    </section>
  );
}
