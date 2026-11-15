import styles from "@/app/journey/journey.module.scss";
import AtlasChapterButton from "./AtlasChapterButton";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

export default function AtlasSharedChapter({ word, chapter, busy, onStartAgain }: {
  word: AtlasWord;
  chapter: AtlasChapter;
  busy: boolean;
  onStartAgain: () => void;
}) {
  return (
    <section className={styles.atlasSharedMoment}>
      <div className={styles.atlasConfetti} aria-hidden><i>✦</i><i>●</i><i>◆</i><i>✦</i><i>●</i></div>
      <span className={styles.atlasSharedSeal}>✓</span>
      <span className={styles.atlasStageLabel}>A SHARED LANDMARK</span>
      <h3>For us, “{word.title}” means…</h3>
      {chapter.sharedDefinition ? <blockquote>“{chapter.sharedDefinition}”</blockquote> : <p>No shared wording was saved.</p>}
      <p>This is a living definition, not a permanent verdict. You can explore it again when life changes.</p>
      <AtlasChapterButton chapterId={chapter.id} wordTitle={word.title} />
      <button onClick={onStartAgain} disabled={busy}>Explore a new chapter</button>
    </section>
  );
}
