import Button from "../button";
import Link from "next/link";
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
          <Link href="/signup">
            <Button className={styles.joinButton}>Sign Up</Button>
          </Link>
          <Link href="/login">
            <Button className={styles.joinButton}>Login</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
