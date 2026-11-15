import { formatDate } from "@/features/journey/journey.utils";
import type { AtlasCompletedChapter, AtlasResponse } from "./atlas.types";
import chapterStyles from "./atlas-chapter.module.scss";

function MeaningCard({ title, response }: { title: string; response: AtlasResponse | null }) {
  return (
    <article className={chapterStyles.meaningCard}>
      <h4>{title}</h4>
      {response ? (
        <dl>
          <dt>In my words</dt><dd>{response.definition || "No definition was saved."}</dd>
          <dt>A moment that shows it</dt><dd>{response.example || "No example was saved."}</dd>
          <dt>What it is not</dt><dd>{response.notMeaning || "No boundary was saved."}</dd>
        </dl>
      ) : <p>No response was saved for this person.</p>}
    </article>
  );
}

function UnderstandingCheck({ title, response, checkedBy }: {
  title: string;
  response: AtlasResponse | null;
  checkedBy: string;
}) {
  const status = response?.heardStatus;
  return (
    <article className={chapterStyles.checkCard}>
      <h4>{title}</h4>
      {response?.heardSummary ? (
        <>
          <blockquote>“{response.heardSummary}”</blockquote>
          <p className={chapterStyles.checkResult}>
            {status === "CONFIRMED" ? `✓ ${checkedBy} confirmed this`
              : status === "ALMOST" ? `${checkedBy} said it was almost right`
                : status === "MISSING" ? `${checkedBy} said something was missing`
                  : "No completed check was recorded."}
          </p>
        </>
      ) : <p>No understanding summary was saved.</p>}
    </article>
  );
}

export default function AtlasChapterContent({ chapter }: { chapter: AtlasCompletedChapter }) {
  return (
    <div className={chapterStyles.content}>
      <p className={chapterStyles.savedDate}>
        Started {formatDate(chapter.createdAt)} · Shared {formatDate(chapter.sharedAt)} · Read-only
      </p>

      <section aria-label="Original meanings">
        <h3>What each of you meant</h3>
        <div className={chapterStyles.pair}>
          <MeaningCard title="Your meaning" response={chapter.ownResponse} />
          <MeaningCard title={`${chapter.partner.name}’s meaning`} response={chapter.partner.response} />
        </div>
      </section>

      <section aria-label="Understanding checks">
        <h3>How you understood each other</h3>
        <div className={chapterStyles.pair}>
          <UnderstandingCheck title={`What you heard from ${chapter.partner.name}`} response={chapter.ownResponse} checkedBy={chapter.partner.name} />
          <UnderstandingCheck title={`What ${chapter.partner.name} heard from you`} response={chapter.partner.response} checkedBy="You" />
        </div>
      </section>

      <section className={chapterStyles.agreement} aria-label="Final shared meaning">
        <span aria-hidden>✓</span>
        <h3>For us, “{chapter.word.title}” means…</h3>
        {chapter.sharedDefinition ? <blockquote>“{chapter.sharedDefinition}”</blockquote> : <p>No shared wording was saved.</p>}
        <p>This is the meaning you shared in this chapter. Your current chapter stays separate.</p>
      </section>
    </div>
  );
}
