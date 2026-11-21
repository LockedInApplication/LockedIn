import Image from "next/image";
import Link from "next/link";
import HomeHeader from "./_homeSections/HomeHeader";
import HomeMotion from "./_homeSections/HomeMotion";
import styles from "./page.module.scss";

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
          <h1 id="hero-title">Go from hello{" "}<span>to a real date.</span></h1>
        </section>

        <section id="how-it-works" className={styles.approach} aria-labelledby="process-title" tabIndex={-1}>
          <div className={`${styles.approachHead} ${styles.fromLeft}`} data-home-reveal="">
            <p className={styles.label}>How it works</p>
            <h2 id="process-title">A good chat can{" "}<span>turn into <em>a plan.</em></span></h2>
          </div>
          <div className={styles.connector} aria-hidden="true" data-home-reveal="" />
          <div id="preview" className={`${styles.approachCopy} ${styles.fromRight}`} data-home-reveal="" tabIndex={-1}>
            <p>Reply to something you noticed on a profile. If the conversation feels right, suggest a place and pick a time that works for both of you.</p>
            <Link href="/signup" className={styles.primary}>Join LockedIn</Link>
          </div>
        </section>

        <section id="trust" className={styles.trust} aria-labelledby="trust-title" tabIndex={-1}>
          <div className={`${styles.trustPhoto} ${styles.fromLeft}`} data-home-reveal="">
            <Image src="/home/editorial-coffee.webp" alt="Two people laughing over coffee on a café terrace" width={960} height={720} loading="lazy" unoptimized />
          </div>
          <div className={`${styles.trustCopy} ${styles.fromRight}`} data-home-reveal="">
            <p className={styles.label}>Privacy &amp; choice</p>
            <h2 id="trust-title">A space for just you two.</h2>
            <p>Lock in when you’re both ready. Discovery pauses, your chats stay open, and you get a private space for plans and check-ins.</p>
            <p>Your private reflections stay yours unless you share them. You can block or report from your conversation at any time.</p>
          </div>
        </section>
        <HomeMotion />
      </main>

      <footer className={styles.footer}>
        <a href="#top" className={styles.brand}>LockedIn</a>
        <a href="#trust">Privacy &amp; choice</a>
        <Link href="/journey">Open LockedIn</Link>
        <small>© 2026 LockedIn</small>
      </footer>
    </div>
  );
}
