import styles from "@/app/journey/journey.module.scss";
import { formatDate } from "@/features/journey/journey.utils";
import type { AtlasWord } from "./atlas.types";
import AtlasChapterButton from "./AtlasChapterButton";

export default function AtlasHistory({ word }: { word: AtlasWord }) {
  const history = word.previousDefinitions ?? [];
  if (!history.length) return null;

  return (
    <section className={styles.atlasSharedMoment} aria-labelledby={`completed-${word.key}`}>
      <span className={styles.atlasSharedSeal} aria-hidden>✓</span>
      <span className={styles.atlasStageLabel}>ALREADY SHARED · ALWAYS HERE</span>
      <h3 id={`completed-${word.key}`}>Completed {word.title} chapters</h3>
      <p>Your completed meanings stay saved while you explore a new chapter together.</p>
      {history.map((item, index) => (
        <div className={styles.atlasHistory} key={item.id}>
          <span className={styles.atlasStageLabel}>
            Chapter {history.length - index} · Shared {formatDate(item.sharedAt)}
          </span>
          {item.definition ? (
            <blockquote>“{item.definition}”</blockquote>
          ) : (
            <p>No shared wording was saved for this chapter.</p>
          )}
          <AtlasChapterButton chapterId={item.id} wordTitle={word.title} />
        </div>
      ))}
    </section>
  );
}
