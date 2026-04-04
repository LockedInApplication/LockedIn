"use client";

import PrivacyCard from "../_components/privacyCard";
import styles from "../_components/styles/privacyContainer.module.scss";
import { useScrollReveal } from "@/hooks/useScrollReveal";
export default function PrivacyContainer() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>();

  const privacyCards = [
    {
      icon: "🔐",
      title: "End-to-End Privacy",
      description:
        "Your data is encrypted and never sold or shared with third parties.",
    },
    {
      icon: "🤝",
      title: "Mutual Consent",
      description:
        "Nothing happens without both people agreeing. Symmetry is the rule.",
    },
    {
      icon: "💬",
      title: "Soft Language",
      description:
        "Our alerts are gentle observations — never accusations or judgments.",
    },
    {
      icon: "🗑️",
      title: "Right to Delete",
      description:
        "Leave anytime and your data is permanently removed within 24 hours. Nothing happens without both people agreeing. Symmetry is the rule.",
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
          <div className={styles.shield}>🛡️</div>
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
