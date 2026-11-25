import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import HomeHeader from "./_homeSections/HomeHeader";
import HomeMotion from "./_homeSections/HomeMotion";
import HomeProductPreviews, { HomeAtlasExample } from "./_homeSections/HomeProductPreviews";
import styles from "./page.module.scss";

export const metadata: Metadata = {
  title: "LockedIn | Dating at your own pace",
  description: "Meet through Discovery or invite someone you know. Start with a chat, then choose together whether to lock in.",
};

const steps = [
  {
    title: "Send a hello",
    description: "Reply to something you noticed on a Discovery profile, or send a direct invite to someone you already know.",
  },
  {
    title: "Get to know each other",
    description: "When they accept, a private chat opens in Inbox. If you’d like to meet, use the chat to talk through where and when.",
  },
  {
    title: "Decide whether to lock in",
    description: "Either of you can ask. If you both say yes, you’ll have a private space in Together and Discovery will pause.",
  },
];

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main-content">Skip to content</a>
      <HomeHeader />

      <main id="main-content" tabIndex={-1}>
        <section id="home-hero" className={styles.hero} aria-labelledby="hero-title">
          <picture className={styles.heroImage}>
            <source media="(max-width: 640px)" srcSet="/home/blue-hour-portrait.webp" width={720} height={867} />
            <source srcSet="/home/blue-hour-1024.webp 1024w, /home/blue-hour-1536.webp 1536w" sizes="100vw" type="image/webp" />
            <Image className={styles.photo} src="/home/blue-hour-1536.webp" alt="" width={1536} height={1024} loading="eager" fetchPriority="high" unoptimized />
          </picture>
          <div className={styles.heroContent}>
            <p className={styles.heroLabel}>Dating at your own pace</p>
            <h1 id="hero-title">Meet someone.{" "}<em>Make time for each other.</em></h1>
            <p className={styles.heroLead}>Reply to a photo or profile answer in Discovery, or invite someone you know to chat. If you both want to focus on each other, you can lock in.</p>
            <div className={styles.actions}>
              <Link href="/signup" className={styles.lightButton}>Join LockedIn</Link>
              <a href="#how-it-works" className={styles.outlineButton}>See how it works</a>
            </div>
            <p className={styles.heroNote}>Already a member? <Link href="/login">Sign in</Link></p>
          </div>
        </section>

        <section id="how-it-works" className={styles.approach} aria-labelledby="process-title" tabIndex={-1}>
          <div className={styles.fromLeft} data-home-reveal="">
            <p className={styles.label}>01 · How it works</p>
            <h2 id="process-title">From a first hello{" "}<em>to Together.</em></h2>
          </div>
          <ol id="preview" className={`${styles.steps} ${styles.fromRight}`} data-home-reveal="" tabIndex={-1} role="list">
            {steps.map(({ title, description }, index) => (
              <li key={title}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className={styles.trust} aria-labelledby="trust-title" tabIndex={-1}>
          <div className={styles.trustInner}>
            <div className={`${styles.trustCopy} ${styles.fromLeft}`} data-home-reveal="">
              <p className={styles.label}>02 · Privacy &amp; choice</p>
              <h2 id="trust-title">A private space{" "}<em>for the two of you.</em></h2>
              <p>In Together, you can make plans and check in with each other. Your existing chats stay open while Discovery is paused.</p>
              <ul className={styles.privacyList} role="list">
                <li>You choose whether to publish a Discovery profile. You can pause it from your settings.</li>
                <li>Your private reflection is only visible to you.</li>
                <li>You can block a contact or report a message from chat.</li>
              </ul>
            </div>
            <div className={styles.fromRight} data-home-reveal="">
              <HomeAtlasExample variant="panel" />
            </div>
          </div>
        </section>
        <HomeProductPreviews />
        <section id="join" className={styles.join} aria-labelledby="join-title" tabIndex={-1}>
          <div className={styles.joinContent}>
            <p className={styles.label}>Join LockedIn</p>
            <h2 id="join-title">Start with{" "}<em>a conversation.</em></h2>
            <p>Create an account to invite someone you know or set up a Discovery profile.</p>
            <div className={styles.actions}>
              <Link href="/signup" className={styles.lightButton}>Join LockedIn</Link>
              <Link href="/login" className={styles.outlineButton}>Sign in</Link>
            </div>
          </div>
        </section>
        <HomeMotion />
      </main>

      <footer className={styles.footer}>
        <div>
          <a href="#top" className={styles.brand} aria-label="LockedIn home"><span>Locked<em>In</em></span></a>
          <p>A dating app for the first hello and what comes after.</p>
        </div>
        <nav aria-label="More about LockedIn">
          <a href="#trust">Privacy &amp; choice</a>
          <Link href="/privacy">Together privacy notice</Link>
          <Link href="/connections?compose=invite">Invite someone</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/journey">Open LockedIn</Link>
        </nav>
        <small>© 2026 LockedIn</small>
      </footer>
    </div>
  );
}
