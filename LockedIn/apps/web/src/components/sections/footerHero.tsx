import Button from "../button";
import styles from "../styles/footerHero.module.scss";
export default function FooterHero() {
  return (
    <section className={styles.footerHero}>
      <div className={styles.footerContent}>
        <h2>Bring clarity to your relationships</h2>
        <p className={styles.description}>
          Join thousands already on the waitlist. Be among the first to
          experience a new standard of trust.
        </p>
        <div className={styles.buttonGroup}>
          <Button className={styles.joinButton}>Sign Up</Button>
          <Button className={styles.joinButton}>Login</Button>
        </div>
      </div>
    </section>
  );
}
