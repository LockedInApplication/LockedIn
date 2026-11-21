import Image from "next/image";
import StoryMotion from "./StoryMotion";
import styles from "../page.module.scss";

const stories = [
  {
    label: "Start talking",
    title: "“What record are you looking for?”",
    detail: "Say hi about something you noticed on their profile. A specific question makes it easier to write back.",
    image: "/home/story-record-shop.webp",
    alt: "Records in a warmly lit shop window",
    className: styles.fromLeft,
  },
  {
    label: "Make a plan",
    title: "“Coffee this Saturday?”",
    detail: "When it feels right, suggest a place and pick a time that works for both of you.",
    image: "/home/story-coffee-date.webp",
    alt: "Two people laughing across a café table",
    className: styles.fromRight,
  },
];

export default function HomeStories() {
  return (
    <section id="how-it-works" className={styles.storySection} aria-labelledby="process-title" tabIndex={-1}>
      <div className={`${styles.wrap} ${styles.storyContent}`}>
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>How it works</p>
          <h2 id="process-title">See where a hello goes.</h2>
        </div>
        <StoryMotion>
          {stories.map(story => (
            <article key={story.label} className={`${styles.storyCard} ${story.className}`} data-home-story="">
              <Image src={story.image} alt={story.alt} width={720} height={450} loading="lazy" unoptimized />
              <div className={styles.storyCopy}>
                <p className={styles.kicker}>{story.label}</p>
                <h3>{story.title}</h3>
                <p>{story.detail}</p>
              </div>
            </article>
          ))}
        </StoryMotion>
      </div>
    </section>
  );
}
