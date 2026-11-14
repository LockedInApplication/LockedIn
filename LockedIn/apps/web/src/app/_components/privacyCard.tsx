import styles from "./styles/privacyCard.module.scss";
type privacyCardType = {
  icon: string;
  title: string;
  description: string;
};
export default function PrivacyCard({
  icon,
  title,
  description,
}: privacyCardType) {
  return (
    <div className={styles.privacyCardContainer}>
      <div>
        <div className={styles.icon}>{icon}</div>
        <div className={styles.title}>{title}</div>
        <div className={styles.description}>{description}</div>
      </div>
    </div>
  );
}
