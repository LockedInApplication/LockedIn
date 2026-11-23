import Image from "next/image";
import type { ReactNode } from "react";
import { writtenPrompts } from "@/features/discovery/discovery-prompt";
import { memberTabs } from "@/features/journey/member-navigation";
import home from "../page.module.scss";
import styles from "./home-product-previews.module.scss";

const atlasLandmarks = [
  { title: "Support", status: "Shared" },
  { title: "Space", status: "In progress" },
  { title: "Quality time", status: "Unexplored" },
] as const;

export function HomeAtlasExample({ variant }: { variant: "panel" | "phone" }) {
  const panel = variant === "panel";
  return (
    <div className={panel ? `${styles.atlasExample} ${styles.atlasPanel}` : styles.atlasExample}>
      <p className={styles.eyebrow}>{panel ? "Example from Together" : "Together · Understand each other"}</p>
      <h3 className={styles.screenTitle}>The Atlas of Us</h3>
      <p className={styles.atlasIntro}>
        {panel
          ? "Each of you answers a prompt on your own. Once you’ve both answered, you can read what the other wrote and agree on a shared meaning."
          : "What does support look like when one of you is having a hard week?"}
      </p>
      <ul className={styles.landmarks} aria-label="Example Atlas landmarks" role="list">
        {atlasLandmarks.map(({ title, status }) => (
          <li key={title}>
            <strong>{title}</strong>
            <span className={styles.landmarkStatus}>{status}</span>
          </li>
        ))}
      </ul>
      <div className={styles.atlasChapter}>
        <p className={styles.eyebrow}>A shared landmark</p>
        <p>For us, “Support” means…</p>
        <blockquote>“Ask if I want advice or just someone to listen.”</blockquote>
      </div>
    </div>
  );
}

function Phone({ active, children }: { active: "Discover" | "Together"; children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <div className={styles.phone}>
        <div className={styles.screen}>
          <div className={styles.statusBar} aria-hidden="true">
            <span>9:41</span><span className={styles.indicators} />
          </div>
          <div className={styles.appHeader} aria-hidden="true"><span>Locked<em>In</em></span><span className={styles.dots}>•••</span></div>
          <div className={styles.screenContent}>{children}</div>
          <div className={styles.tabBar} aria-hidden="true">
            {memberTabs.map(tab => (
              <span key={tab.label} className={tab.label === active ? styles.activeTab : undefined}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeProductPreviews() {
  return (
    <section id="app-preview" className={styles.section} aria-labelledby="app-preview-title" tabIndex={-1}>
      <div className={styles.intro}>
        <p className={home.label}>03 · Inside the app</p>
        <h2 id="app-preview-title">A look at Discovery{" "}<em>and Together.</em></h2>
        <p>These previews show a fictional profile and an example from the Atlas of Us.</p>
      </div>

      <div className={styles.showcase}>
        <figure className={`${styles.figure} ${home.fromLeft}`} aria-labelledby="discovery-preview-caption" data-home-reveal="">
          <Phone active="Discover">
            <p className={styles.eyebrow}>Discovery · Browse locally</p>
            <h3 className={styles.screenTitle}>People nearby</h3>
            <div className={styles.profile}>
              <Image src="/home/discovery-preview-maya.webp" alt="Portrait of Maya, a fictional profile" width={480} height={600} loading="lazy" unoptimized className={styles.portrait} />
              <p className={styles.profileName}>Maya</p>
              <p className={styles.intention}>Looking for a long-term relationship</p>
              <div className={styles.prompt}>
                <h4>{writtenPrompts.sunday}</h4>
                <p>Coffee and a look through the used records at the shop down the street.</p>
              </div>
            </div>
          </Phone>
          <figcaption>
            <strong id="discovery-preview-caption">Discovery</strong>
            <p>If something in a photo or profile answer catches your eye, you can reply to it.</p>
          </figcaption>
        </figure>

        <figure className={`${styles.figure} ${home.fromRight}`} aria-labelledby="atlas-preview-caption" data-home-reveal="">
          <Phone active="Together">
            <HomeAtlasExample variant="phone" />
          </Phone>
          <figcaption>
            <strong id="atlas-preview-caption">The Atlas of Us</strong>
            <p>Inside Together, you can explore what words like support and space mean to each of you.</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
