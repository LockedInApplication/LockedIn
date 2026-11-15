"use client";

import styles from "@/app/journey/journey.module.scss";

export default function ProgressRail({ current }: { current: number }) {
  const steps = ["Connect", "Reflect", "Reveal", "Choose", "Revisit"];
  return (
    <ol className={styles.progressRail} aria-label="Journey progress">
      {steps.map((step, index) => (
        <li key={step} className={index < current ? styles.progressDone : index === current ? styles.progressCurrent : ""}>
          <span>{index < current ? "✓" : index + 1}</span>
          <small>{step}</small>
        </li>
      ))}
    </ol>
  );
}
