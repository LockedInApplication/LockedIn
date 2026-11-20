import styles from "../together-destinations.module.scss";

type TogetherDestination = "conversations" | "roadmap";

const destinations = [
  {
    view: "conversations",
    title: "Guided conversations",
    detail: "Pick a topic. Answer privately, then share when you’re both ready.",
    icon: "◎",
  },
  {
    view: "roadmap",
    title: "Our next steps",
    detail: "Open your roadmap for suggestions, agreements, and things to revisit.",
    icon: "↗",
  },
] as const;

export default function TogetherDestinations({ onNavigate }: { onNavigate: (view: TogetherDestination) => void }) {
  return (
    <nav className={styles.destinations} aria-label="Together activities">
      {destinations.map(({ view, title, detail, icon }) => (
        <button type="button" key={view} aria-label={title} aria-describedby={`together-${view}-detail`} onClick={() => onNavigate(view)}>
          <span className={styles.icon} aria-hidden="true">{icon}</span>
          <span className={styles.copy}><strong>{title}</strong><span id={`together-${view}-detail`}>{detail}</span></span>
          <span aria-hidden="true" className={styles.arrow}>→</span>
        </button>
      ))}
    </nav>
  );
}
