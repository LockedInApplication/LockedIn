import Button from "../button";
import Link from "next/link";
import styles from "../styles/footerHero.module.scss";
export default function FooterHero() {
  return (
    <section className={styles.footerHero}>
      <div className={styles.footerContent}>
        <h2>Choose what comes next—together.</h2>
        <p className={styles.description}>
          Start with one honest topic, one shared decision, and one next step that belongs to both of you.
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
