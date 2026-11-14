import styles from "@/app/journey/journey.module.scss";
import { initials } from "@/features/journey/journey.utils";

export type WaitingCardProps = {
  title: string;
  name: string;
  detail: string;
};

export default function WaitingCard({ title, name, detail }: WaitingCardProps) {
  return (
    <section className={styles.waitingCard}>
      <span className={styles.waitingIcon}>◌</span>
      <span className={styles.eyebrow}>WAITING WITHOUT PRESSURE</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className={styles.waitingPerson}>
        <span className={styles.avatar}>{initials(name)}</span>
        <span>{name} will continue in their own time.</span>
      </div>
    </section>
  );
}
