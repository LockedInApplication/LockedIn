import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import FirstHelloPreview from "./_homeSections/FirstHelloPreview";
import styles from "./page.module.scss";

const invitePath = "/connections?compose=invite";

const steps = [
  { title: "Start with something you noticed.", detail: "Read a profile and reply to an answer that makes you curious." },
  { title: "Turn a good chat into a plan.", detail: "Once you connect, suggest a place to meet or keep talking until you’re ready." },
  { title: "Lock in when you’re both ready.", detail: "Choose a private space together. Discovery pauses for both of you, and your existing chats stay open." },
];

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link href="/" className={styles.brand}><BrandLogo className={styles.brandMark} />LockedIn</Link>
          <div className={styles.navLinks}>
            <a href="#how-it-works">How it works</a>
            <a href="#preview">Try it</a>
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
            <h1 id="hero-title">Go from hello{" "}<em>to a real date.</em></h1>
            <p className={styles.intro}>Meet someone new, find a place you’d both like, and make a plan together.</p>
            <div className={styles.actions}>
              <Link href="/signup" className={styles.primary}>Join LockedIn</Link>
              <Link href={invitePath} prefetch={false} className={styles.invite}>Invite someone you know</Link>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={`${styles.wrap} ${styles.process}`} aria-labelledby="process-title" tabIndex={-1}>
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>How it works</p>
            <h2 id="process-title">A hello is enough to start.</h2>
          </div>
          <ol className={styles.steps} role="list">
            {steps.map(step => <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </li>)}
          </ol>
        </section>

        <FirstHelloPreview />

        <section id="trust" className={`${styles.wrap} ${styles.trust}`} aria-labelledby="trust-title" tabIndex={-1}>
          <div>
            <p className={styles.kicker}>Privacy &amp; choice</p>
            <h2 id="trust-title">Closeness without <em>the pressure.</em></h2>
          </div>
          <ul role="list">
            <li><strong>You choose what to share.</strong> Private reflections stay private unless you share them.</li>
            <li><strong>Both people get a say.</strong> Opening a shared space through Discovery is a mutual choice.</li>
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
