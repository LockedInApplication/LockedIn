import styles from "./styles/footer.module.scss";
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLogo}>LockedIn</div>
      <div className={styles.footerLinks}>
        <a href="#">About</a>
        <a href="#">Privacy</a>
        <a href="#">Contact</a>
      </div>
      <div className={styles.copyright}>© 2026 LockedIn</div>
    </footer>
  );
}
