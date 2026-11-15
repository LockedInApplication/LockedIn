"use client";

import styles from "@/app/journey/journey.module.scss";

export default function EmptyWorkspace({
  title,
  detail,
  onAction,
}: {
  title: string;
  detail: string;
  onAction?: () => void;
}) {
  return (
    <section className={styles.emptyWorkspace}>
      <span>✦</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {onAction ? <button className={styles.primaryAction} onClick={onAction}>Choose a conversation</button> : null}
    </section>
  );
}
