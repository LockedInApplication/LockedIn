import Link from "next/link";
import Button from "../button";
import styles from "../styles/hero.module.scss";
export default function Hero() {
    return (
        <div className={styles.hero}>
            <div className={styles.hero_description}>
                <div className={styles.eyebrow}><span>Two voices</span><i />one shared direction</div>
                <h1>Make the next move <span className={styles.hero_description_title_highlight}>together.</span></h1>
                <p>Start separately. Share intentionally. Leave with one next step that genuinely belongs to both of you.</p>
                <div className={styles.hero_description_buttons}>
                    <Link href="/signup"><Button className={styles.hero_primaryButton}>Start your journey</Button></Link>
                    <Link href="#how-it-works" className={styles.textLink}>See the process <span>↘</span></Link>
                </div>
                <div className={styles.summary}>
                    <span className={styles.summaryDot} />
                    <span className={styles.summary_text}>Private by default <span>No scores. No forced timelines.</span></span>
                </div>
            </div>

            <div className={styles.hero_graph}>
                <div className={styles.conversationCanvas}>
                    <div className={styles.canvasLabel}>A conversation in LockedIn</div>
                    <article className={`${styles.voiceCard} ${styles.voiceOne}`}>
                        <span>You</span>
                        <p>I want us to talk about what the next year could look like.</p>
                        <small>Private until you choose to share</small>
                    </article>
                    <article className={`${styles.voiceCard} ${styles.voiceTwo}`}>
                        <span>Your person</span>
                        <p>I’m ready for that conversation too.</p>
                        <small>Shared by choice</small>
                    </article>
                    <div className={styles.sharedStep}>
                        <b>✓</b>
                        <div><span>Chosen together</span><strong>Compare priorities over coffee</strong></div>
                    </div>
                    <div className={styles.orbitOne} />
                    <div className={styles.orbitTwo} />
                </div>
            </div>
        </div>
    );
}
