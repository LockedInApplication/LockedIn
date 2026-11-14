"use client";

import PrivacyCard from "../_components/privacyCard";
import styles from "../_components/styles/privacyContainer.module.scss";
import { useScrollReveal } from "@/hooks/useScrollReveal";
export default function PrivacyContainer() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

  const privacyCards = [
    {
      icon: "P",
      title: "Private by Default",
      description:
        "Your answers begin as yours alone. You decide which responses can be compared.",
    },
    {
      icon: "M",
      title: "Mutual Consent",
      description:
        "Nothing happens without both people agreeing. Symmetry is the rule.",
    },
    {
      icon: "Ø",
      title: "No Relationship Score",
      description:
        "Alignment and difference are presented without ranking your relationship or declaring a winner.",
    },
    {
      icon: "↺",
      title: "No Forced Timeline",
      description:
        "Pause, revise, decline, or leave. A healthy choice does not have to look like constant progress.",
    },
  ];
  return (
    <div ref={ref} className={`${styles.container} ${isVisible ? styles.isVisible : ""}`}>
      <div className={styles.cards}>
        {privacyCards.map((item) => (
          <PrivacyCard
            key={item.title + item.description}
            icon={item.icon}
            title={item.title}
            description={item.description}
          />
        ))}
      </div>
     
        <div className={styles.trustcontainer}>
          <div className={styles.shield}>✓</div>
          <p className={styles.heading}>
            Built on <em>mutual trust</em>
          </p>
          <p className={styles.subtext}>
            Privacy-first. Consent-driven.
            <br />
            Designed to bring people closer, not create fear.
          </p>
        </div>
    </div>
  );
}
