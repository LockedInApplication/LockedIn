"use client";

import styles from "@/app/journey/journey.module.scss";
import type { JourneySession } from "@/features/journey/journey.types";
import type { JourneyNextStep } from "./roadmap.types";
import { journeyRequest } from "@/features/journey/journey.client";
import { daysUntil, formatDate } from "@/features/journey/journey.utils";
import ReflectionForm from "./ReflectionForm";

export default function AcceptedStep({
  session,
  step,
  stepNumber,
  busy,
  runAction,
}: {
  session: JourneySession;
  step: JourneyNextStep;
  stepNumber: number;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const complete = Boolean(step.ownReflection && step.partnerReflection.submitted);

  return (
    <section className={styles.acceptedCard}>
      <div className={styles.acceptedTop}>
        <span className={styles.acceptedIcon}>{stepNumber}</span>
        <div>
          <span className={styles.eyebrow}>{complete ? "REFLECTION COMPLETE" : "MUTUALLY CHOSEN"}</span>
          <h2>{step.title}</h2>
          {step.details ? <p>{step.details}</p> : null}
          {step.targetDate ? <span className={styles.datePill}>Revisit · {formatDate(step.targetDate)}</span> : null}
        </div>
      </div>

      {complete ? (
        <div className={styles.completionPanel}>
          <strong>You both reflected.</strong>
          <p>
            The outcome is not a relationship score. Completing, changing, or pausing a plan can all be intentional choices.
          </p>
          <div>
            <span>Your reflection: {step.ownReflection?.outcome.replaceAll("_", " ").toLowerCase()}</span>
            <span>{session.partnerState.name}: {step.partnerReflection.outcome?.replaceAll("_", " ").toLowerCase()}</span>
          </div>
        </div>
      ) : step.ownReflection ? (
        <div className={styles.pendingLine}>Your reflection is private until {session.partnerState.name} submits theirs.</div>
      ) : !step.reflectionAvailable ? (
        <div className={styles.reflectionLocked}>
          <span className={styles.lockIcon}>⌛</span>
          <div>
            <span className={styles.eyebrow}>NEXT STEP IN PROGRESS</span>
            <h3>Reflection opens {formatDate(step.targetDate)}.</h3>
            <p>
              Give this shared step the time you both chose. You can return on the revisit date to reflect privately.
            </p>
            <strong>
              {daysUntil(step.reflectionOpensAt)} {daysUntil(step.reflectionOpensAt) === 1 ? "day" : "days"} remaining
            </strong>
          </div>
        </div>
      ) : (
        <ReflectionForm
          busy={busy}
          onSubmit={(outcome, note) =>
            runAction(
              () =>
                journeyRequest(`/api/journey/next-steps/${step.id}/reflections`, {
                  method: "POST",
                  body: JSON.stringify({ outcome, note: note || undefined }),
                }),
              "Your reflection is saved privately.",
            )
          }
        />
      )}
    </section>
  );
}
