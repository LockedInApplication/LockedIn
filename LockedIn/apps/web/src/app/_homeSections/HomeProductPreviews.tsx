import Image from "next/image";
import type { ReactNode } from "react";
import BrandLogo from "@/components/brandLogo";
import { writtenPrompts } from "@/features/discovery/discovery-prompt";
import { memberTabs } from "@/features/journey/member-navigation";
import home from "../page.module.scss";
import styles from "./home-product-previews.module.scss";

const atlasLandmarks = [
  { title: "Support", symbol: "✓", status: "Shared" },
  { title: "Space", symbol: "◌", status: "In progress" },
  { title: "Quality time", symbol: "☀", status: "Unexplored" },
] as const;

function Phone({ active, children }: { active: "Discover" | "Together"; children: ReactNode }) {
  return (
    <div className={styles.phone}>
      <div className={styles.screen}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span><span className={styles.camera} /><span className={styles.battery} />
        </div>
        <div className={styles.appHeader} aria-hidden="true"><BrandLogo className={styles.mark} />LockedIn</div>
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
  );
}

export default function HomeProductPreviews() {
  return (
    <section id="app-preview" className={styles.section} aria-labelledby="app-preview-title">
      <div className={styles.intro}>
        <p className={home.label}>Inside LockedIn</p>
        <h2 id="app-preview-title">A look at the app.</h2>
        <p>Example screens with a fictional profile and a sample Atlas chapter.</p>
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
                <p>A record shop, a long walk, and nowhere to rush.</p>
              </div>
            </div>
          </Phone>
          <figcaption>
            <strong id="discovery-preview-caption">Discovery</strong>
            <p>Photos and profile answers give you something to talk about.</p>
          </figcaption>
        </figure>

        <figure className={`${styles.figure} ${styles.atlasFigure} ${home.fromRight}`} aria-labelledby="atlas-preview-caption" data-home-reveal="">
          <Phone active="Together">
            <p className={styles.eyebrow}>Together · Understand each other</p>
            <div className={styles.atlasHeader}>
              <h3 className={styles.screenTitle}>The Atlas of Us</h3>
              <p>What do everyday words like support and space mean to each of you?</p>
            </div>
            <div className={styles.atlasMap}>
              <svg viewBox="0 0 300 130" preserveAspectRatio="none" aria-hidden="true">
                <path d="M50 93 C92 93 109 68 150 68 S214 43 250 43" />
              </svg>
              <ul className={styles.landmarks} aria-label="Atlas landmarks">
                {atlasLandmarks.map(({ title, symbol, status }) => (
                  <li key={title}>
                    <span className={styles.landmarkIcon} aria-hidden="true">{symbol}</span>
                    <strong>{title}</strong>
                    <span className={styles.landmarkStatus}>{status}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.atlasChapter}>
              <p className={styles.eyebrow}>A shared landmark</p>
              <h4>For us, “Support” means…</h4>
              <blockquote>“Ask if I want advice or just someone to listen.”</blockquote>
            </div>
          </Phone>
          <figcaption>
            <strong id="atlas-preview-caption">The Atlas of Us</strong>
            <p>Answer on your own, see each other’s answers once you’ve both submitted, and write a meaning you both agree on.</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
