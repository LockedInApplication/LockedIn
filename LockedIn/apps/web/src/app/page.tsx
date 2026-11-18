import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brandLogo";
import FirstHelloPreview from "./_homeSections/FirstHelloPreview";
import styles from "./page.module.scss";

const steps = [
  { number: "01", label: "Notice", title: "Find a reason to say hello.", detail: "A profile answer can give you more to go on than a photo. Reply to something that makes you curious." },
  { number: "02", label: "Talk", title: "See where it goes.", detail: "If you both choose to connect, keep the conversation going in Messages. Take it at your own pace." },
  { number: "03", label: "Build", title: "Make a next step together.", detail: "Open a shared space when you both choose it. Already have someone in mind? Invite them directly." },
];

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#top" className={styles.brand}><BrandLogo />LockedIn</a>
          <div className={styles.navLinks}>
            <a href="#how-it-works">How it works</a>
            <a href="#preview">Try it</a>
            <a href="#trust">Privacy</a>
          </div>
          <Link href="/journey" className={styles.navAction}>Open LockedIn <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <main id="main-content">
        <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}><span className={styles.dot} /> Dating with intention</p>
            <h1 id="hero-title">A better hello.<br /><em>A closer us.</em></h1>
            <p className={styles.intro}>Meet someone new or invite someone you already know. Start a real conversation, then decide together what comes next.</p>
            <div className={styles.actions}>
              <Link href="/signup" className={styles.primary}>Get started <span aria-hidden="true">↗</span></Link>
              <a href="#preview" className={styles.secondary}>Try a first hello <span aria-hidden="true">↓</span></a>
            </div>
            <p className={styles.heroNote}>Private by default. Built for two people choosing together.</p>
          </div>
          <figure className={styles.heroImage}>
            <Image src="/lockedin-coffee-hello.webp" alt="Two people sharing a laugh over coffee on a sunlit terrace" fill preload unoptimized sizes="(max-width: 760px) 100vw, 45vw" />
            <figcaption>
              <span>01 / THE FIRST HELLO</span>
              <strong>Good things start small.</strong>
            </figcaption>
          </figure>
        </section>

        <section id="how-it-works" className={`${styles.wrap} ${styles.process}`} aria-labelledby="process-title">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>How it works</p>
            <h2 id="process-title">From first hello to <em>what’s next.</em></h2>
          </div>
          <ol className={styles.steps}>
            {steps.map(step => <li key={step.number}>
              <p className={styles.stepLabel}><span>{step.number}</span>{step.label}</p>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </li>)}
          </ol>
        </section>

        <FirstHelloPreview />

        <section id="trust" className={`${styles.wrap} ${styles.trust}`} aria-labelledby="trust-title">
          <div>
            <p className={styles.kicker}>On your terms</p>
            <h2 id="trust-title">Closeness without <em>the pressure.</em></h2>
          </div>
          <ul>
            <li><strong>You choose what to share.</strong> Private reflections stay private unless you share them.</li>
            <li><strong>Both people get a say.</strong> Opening a shared space through Discovery is a mutual choice.</li>
            <li><strong>You can set a boundary.</strong> Block or report from your conversation when you need to.</li>
          </ul>
        </section>

        <section className={`${styles.wrap} ${styles.closing}`} aria-labelledby="closing-title">
          <p className={styles.kicker}>There’s no perfect first line</p>
          <h2 id="closing-title">Start with <em>something real.</em></h2>
          <Link href="/signup" className={styles.primary}>Get started <span aria-hidden="true">↗</span></Link>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <a href="#top" className={styles.brand}><BrandLogo />LockedIn</a>
        <a href="#trust">Privacy &amp; choice</a>
        <Link href="/login">Sign in</Link>
        <small>© 2026 LockedIn</small>
      </footer>
    </div>
  );
}
