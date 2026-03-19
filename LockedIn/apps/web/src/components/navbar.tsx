import Button from "./button";
import styles from "./styles/navbar.module.scss";
export default function Navbar() {
    return (
        <nav className={styles.navbar}>
            <div className={styles.navheader}>
                <p>LockedIn</p>
                <div className={styles.navheader_logo}>
                    <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="6" cy="6" r="3" fill="white" opacity="0.9" />
                        <circle cx="13" cy="12" r="3" fill="white" opacity="0.6" />
                        <line x1="8.5" y1="7.5" x2="10.5" y2="10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
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