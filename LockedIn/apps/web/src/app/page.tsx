import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import HomeStories from "./_homeSections/HomeStories";
import styles from "./page.module.scss";

const invitePath = "/connections?compose=invite";

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link href="/" className={styles.brand}><BrandLogo className={styles.brandMark} />LockedIn</Link>
          <div className={styles.navLinks}>
            <a href="#how-it-works">How it works</a>
            <a href="#trust">Privacy</a>
          </div>
          <Link href="/login" className={styles.navAction}>Sign in</Link>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <picture className={styles.heroImage}>
            <source media="(max-width: 600px)" srcSet="/home/blue-hour-portrait.webp" width={720} height={867} />
            <source srcSet="/home/blue-hour-1024.webp 1024w, /home/blue-hour-1536.webp 1536w" sizes="100vw" type="image/webp" />
            <Image className={styles.photo} src="/home/blue-hour-1536.webp" alt="" width={1536} height={1024} loading="eager" fetchPriority="high" unoptimized />
          </picture>
          <div className={styles.heroCopy}>
            <h1 id="hero-title">Go from hello{" "}<span>to a real date.</span></h1>
            <p className={styles.intro}>Meet someone new, or invite someone you already know.</p>
            <div className={styles.actions}>
              <Link href="/signup" className={styles.primary}>Join LockedIn</Link>
              <Link href={invitePath} prefetch={false} className={styles.invite}>Invite someone you know</Link>
            </div>
          </div>
        </section>

        <HomeStories />

        <section id="trust" className={styles.trust} aria-labelledby="trust-title" tabIndex={-1}>
          <div>
            <p className={styles.kicker}>Privacy &amp; choice</p>
            <h2 id="trust-title">A space for just you two.</h2>
            <p className={styles.trustIntro}>If you both choose to lock in, Discovery pauses and your existing chats stay open.</p>
          </div>
          <ul role="list">
            <li><strong>You choose what to share.</strong> Private reflections stay private unless you share them.</li>
            <li><strong>Both people get a say.</strong> Make plans and check in together in your shared space.</li>
            <li><strong>You can set a boundary.</strong> Block or report from your conversation when you need to.</li>
          </ul>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <a href="#top" className={styles.brand}><BrandLogo className={styles.brandMark} />LockedIn</a>
        <a href="#trust">Privacy &amp; choice</a>
        <Link href="/journey">Open LockedIn</Link>
        <small>© 2026 LockedIn</small>
      </footer>
    </div>
  );
}
