"use client";

import styles from "@/app/journey/journey.module.scss";
import type { CSSProperties } from "react";
import type { JourneySession } from "../journey.types";
import type { WorkspaceView } from "../journey.navigation";
import { initials } from "../journey.utils";

type JourneyMilestoneState = "complete" | "current" | "waiting" | "upcoming";

export default function SharedJourneyPath({
  session,
  historyCount,
  partnerName,
  onNavigate,
  onFocusCurrent,
}: {
  session: JourneySession | null;
  historyCount: number;
  partnerName: string;
  onNavigate: (view: WorkspaceView) => void;
  onFocusCurrent: () => void;
}) {
  const reflectionComplete = Boolean(
    session?.ownResponse && session.partnerState.submitted,
  );
  const revealComplete = Boolean(session?.bothRevealed);
  const planChosen = Boolean(session?.nextSteps.length);
  const revisitComplete = Boolean(
    session?.nextSteps.length &&
      session.nextSteps.every(
        (step) => step.ownReflection && step.partnerReflection.submitted,
      ),
  );

  const reflectionState: JourneyMilestoneState = !session
    ? "upcoming"
    : reflectionComplete
      ? "complete"
      : session.ownResponse
        ? "waiting"
        : "current";
  const revealState: JourneyMilestoneState = !reflectionComplete
    ? "upcoming"
    : revealComplete
      ? "complete"
      : session?.ownResponse?.revealConsented
        ? "waiting"
        : "current";
  const planState: JourneyMilestoneState = !revealComplete
    ? "upcoming"
    : planChosen
      ? "complete"
      : "current";
  const revisitState: JourneyMilestoneState = !planChosen
    ? "upcoming"
    : revisitComplete
      ? "complete"
      : "current";

  const milestones: Array<{
    title: string;
    detail: string;
    action: string;
    icon: string;
    state: JourneyMilestoneState;
    onClick: () => void;
  }> = [
    {
      title: "Connected",
      detail: `Your private space with ${partnerName}`,
      action: "Together",
      icon: "✓",
      state: "complete",
      onClick: () => undefined,
    },
    {
      title: session ? session.topic : "Choose a conversation",
      detail: session ? "Your shared topic is set" : "Pick what matters to both of you",
      action: session ? "Change topic" : "Choose a topic",
      icon: "◎",
      state: session ? "complete" : "current",
      onClick: () => onNavigate("conversations"),
    },
    {
      title: "Reflect privately",
      detail:
        reflectionState === "waiting"
          ? `Waiting for ${partnerName}`
          : reflectionState === "complete"
            ? "Both private reflections are ready"
            : "Answer without seeing each other",
      action: reflectionState === "waiting" ? "Your part is done" : "Open reflection",
      icon: "✎",
      state: reflectionState,
      onClick: session ? onFocusCurrent : () => onNavigate("conversations"),
    },
    {
      title: "Reveal by choice",
      detail:
        revealState === "waiting"
          ? `${partnerName} still has full privacy`
          : revealState === "complete"
            ? "Shared ground is now visible"
            : "Open only what you both consent to",
      action: revealState === "complete" ? "View shared ground" : "Continue",
      icon: "↗",
      state: revealState,
      onClick: session ? onFocusCurrent : () => onNavigate("conversations"),
    },
    {
      title: "Choose a next step",
      detail: planChosen
        ? `${session?.nextSteps.length} shared step${session?.nextSteps.length === 1 ? "" : "s"} in motion`
        : "Turn clarity into something you both accept",
      action: planChosen ? "See your roadmap" : "Choose together",
      icon: "◇",
      state: planState,
      onClick: () => onNavigate("roadmap"),
    },
    {
      title: "Revisit together",
      detail: revisitComplete
        ? "You both reflected on every step"
        : planChosen
          ? "Return when the moment you chose arrives"
          : "Your path will keep growing here",
      action: planChosen ? "Open next steps" : "Later",
      icon: "↻",
      state: revisitState,
      onClick: () => onNavigate("roadmap"),
    },
  ];

  const activeMilestoneIndex = milestones.findIndex(
    (milestone) =>
      milestone.state === "current" || milestone.state === "waiting",
  );
  const currentIndex =
    activeMilestoneIndex === -1 ? milestones.length - 1 : activeMilestoneIndex;
  const pathProgress = Math.max(0, Math.min(100, (currentIndex / 5) * 100));
  const currentMilestone = milestones[currentIndex];

  return (
    <section className={styles.journeyMap} aria-labelledby="journey-map-title">
      <header className={styles.journeyMapHeader}>
        <div>
          <span className={styles.eyebrow}>YOUR SHARED PATH</span>
          <h2 id="journey-map-title">One step at a time.</h2>
          <p>The path moves only when both voices are ready.</p>
        </div>
        <div className={styles.mapStatus}>
          <div className={styles.mapPair} aria-label={`You and ${partnerName}`}>
            <span className={styles.mapYou}>You</span>
            <i />
            <span className={styles.mapPartner}>{initials(partnerName)}</span>
          </div>
          <strong>{currentMilestone?.title}</strong>
          <small>{historyCount + (revealComplete ? 1 : 0)} chapter{historyCount + (revealComplete ? 1 : 0) === 1 ? "" : "s"} so far</small>
        </div>
      </header>

      <div
        className={styles.pathCanvas}
        style={{ "--mobile-progress": `${pathProgress}%` } as CSSProperties}
      >
        <div className={styles.pathGlowOne} aria-hidden />
        <div className={styles.pathGlowTwo} aria-hidden />
        <svg
          className={styles.pathSvg}
          viewBox="0 0 600 760"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <path
            className={styles.pathBase}
            d="M300 52 C300 105 178 96 178 174 C178 256 422 240 422 326 C422 410 178 390 178 478 C178 562 422 548 422 630 C422 690 344 704 300 724"
            pathLength="100"
          />
          <path
            className={styles.pathProgress}
            d="M300 52 C300 105 178 96 178 174 C178 256 422 240 422 326 C422 410 178 390 178 478 C178 562 422 548 422 630 C422 690 344 704 300 724"
            pathLength="100"
            style={{ strokeDashoffset: 100 - pathProgress }}
          />
        </svg>

        <ol className={styles.milestoneList}>
          {milestones.map((milestone, index) => (
            <li
              key={milestone.title}
              className={`${styles.milestone} ${styles[`milestone_${index}`]} ${styles[`milestone_${milestone.state}`]}`}
            >
              <button
                className={styles.milestoneButton}
                onClick={milestone.onClick}
                aria-current={milestone.state === "current" ? "step" : undefined}
              >
                <span className={styles.milestoneNode}>
                  <span>{milestone.state === "complete" ? "✓" : milestone.icon}</span>
                </span>
                <span className={styles.milestoneCard}>
                  <small>
                    {milestone.state === "complete"
                      ? "Complete"
                      : milestone.state === "waiting"
                        ? "Waiting together"
                        : milestone.state === "current"
                          ? "You are here"
                          : "Coming up"}
                  </small>
                  <strong>{milestone.title}</strong>
                  <span>{milestone.detail}</span>
                  <em>{milestone.action} <b>→</b></em>
                  {milestone.state === "waiting" ? (
                    <span className={styles.waitingPair} aria-hidden>
                      <i className={styles.waitingYou}>Y</i>
                      <i className={styles.waitingPartner}>{initials(partnerName)}</i>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
