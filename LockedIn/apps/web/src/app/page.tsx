import Image from "next/image";
import Link from "next/link";
import HomeHeader from "./_homeSections/HomeHeader";
import HomeMotion from "./_homeSections/HomeMotion";
import HomeProductPreviews from "./_homeSections/HomeProductPreviews";
import HomeSignup from "./_homeSections/HomeSignup";
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
          <div className={styles.heroContent}>
            <p className={styles.heroLabel}>A quieter way to meet</p>
            <h1 id="hero-title">Go from hello{" "}<em>to a real date.</em></h1>
            <div className={styles.heroBottom}>
              <p>One good conversation beats ten empty ones. Notice something on a profile, say it, and turn the chat into a plan you both want.</p>
              <div className={styles.heroActions}>
                <Link href="/signup" className={styles.lightButton}>Join LockedIn</Link>
                <a href="#how-it-works" className={styles.outlineButton}>How it works</a>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={styles.approach} aria-labelledby="process-title" tabIndex={-1}>
          <div className={`${styles.approachHead} ${styles.fromLeft}`} data-home-reveal="">
            <p className={styles.label}>How it works</p>
            <h2 id="process-title">A good chat can{" "}<span>turn into <em>a plan.</em></span></h2>
          </div>
          <div id="preview" className={`${styles.approachCopy} ${styles.fromRight}`} data-home-reveal="" tabIndex={-1}>
            <svg className={styles.connector} viewBox="0 0 60 48" aria-hidden="true" data-home-reveal="">
              <path d="M3 3C9 25 27 39 54 40m-10-7 10 7-11 5" />
            </svg>
            <p>Reply to something you noticed on a profile. If the conversation feels right, suggest a place and pick a time that works for both of you.</p>
            <Link href="/signup" className={styles.primary}>Join LockedIn</Link>
          </div>
        </section>

        <section id="trust" className={styles.trust} aria-labelledby="trust-title" tabIndex={-1}>
          <div className={styles.trustInner}>
            <figure className={`${styles.trustPhoto} ${styles.fromLeft}`} data-home-reveal="">
              <Image src="/home/editorial-coffee.webp" alt="Two people laughing over coffee on a café terrace" width={960} height={720} loading="lazy" unoptimized />
              <figcaption>Plans happen in the space you keep together.</figcaption>
            </figure>
            <div className={`${styles.trustCopy} ${styles.fromRight}`} data-home-reveal="">
              <p className={styles.label}>Privacy &amp; choice</p>
              <h2 id="trust-title">A space for just you two.</h2>
              <p>Lock in when you’re both ready. Discovery pauses, your existing chats stay open, and you get a private space for plans and check-ins.</p>
              <p>Your private reflections stay yours unless you share them. You can block or report from your conversation at any time.</p>
            </div>
          </div>
        </section>
        <HomeProductPreviews />
        <section id="join" className={styles.join} aria-labelledby="join-title" tabIndex={-1}>
          <div className={styles.joinContent}>
            <p className={styles.label}>Join LockedIn</p>
            <h2 id="join-title">Start with one good conversation.</h2>
            <p>Enter your email to get started. You’ll set up your account on the next screen.</p>
            <HomeSignup />
            <p className={styles.joinNote}>You choose if and when to appear in Discovery.</p>
          </div>
        </section>
        <HomeMotion />
      </main>

      <footer className={styles.footer}>
        <div>
          <a href="#top" className={styles.brand} aria-label="LockedIn home"><span>Locked<em>In</em></span></a>
          <p>A quieter place to meet someone, and then make time for each other.</p>
        </div>
        <nav aria-label="More about LockedIn">
          <a href="#trust">Privacy &amp; choice</a>
          <Link href="/connections?compose=invite">Invite someone</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/journey">Open LockedIn</Link>
        </nav>
        <small>© 2026 LockedIn</small>
      </footer>
    </div>
  );
}
