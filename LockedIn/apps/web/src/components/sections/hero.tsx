import Avatar from "../avatar";
import Button from "../button";
import LockGraphic from "../icons/LockGraphic";
import styles from "../styles/hero.module.scss";
export default function Hero() {
    return (
        <div className={styles.hero}>
            <div className={styles.hero_description}>
                <h1>Clarity in <span className={styles.hero_description_title_highlight}>Modern</span> Relationships</h1>
                <p>LockedIn lets two people mutually confirm their relationship and provides gentle, respectful alerts if unusual connection patterns emerge — because trust starts with transparency.</p>
                <div className={styles.hero_description_buttons}>
                    <Button className={styles.hero_primaryButton}>Join Waitlist</Button>
                    <Button className={styles.hero_secondaryButton}>Learn More</Button>
                </div>
                <div className={styles.summary}>
                    <div className={styles.avatar}>
                        <Avatar name="Ahmed Moonsoon" />
                        <Avatar name="Fred Amugi" />
                        <Avatar name="Evans Asuboah" />
                        <Avatar name="Kobe Agyei" />
                        <Avatar name="Franca Vandamme" />
                    </div>
                    <span className={styles.summary_text}>2,400+ couples <span>on the waitlist</span></span>
                </div>
            </div>

            <div className={styles.hero_graph}>
                <LockGraphic />
            </div>
        </div>
    );
}
