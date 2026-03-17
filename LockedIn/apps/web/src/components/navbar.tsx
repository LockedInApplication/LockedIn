import Button from "./button";
import styles from "./styles/navbar.module.scss";
export default function Navbar() {
  return (
    <nav className={styles.navbar}>
        <div>
            LockedIn
        </div>
        <div className={styles.nav_list}>
            <div>How it works</div>
            <div>Preview</div>
            <div>Trust</div>
            <Button>Join Waitlist</Button>
        </div>
    </nav>
  );
}