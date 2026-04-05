import BrandLogo from "./brandLogo";
import Button from "./button";
import styles from "./styles/navbar.module.scss";
export default function Navbar() {
    return (
        <nav className={styles.navbar}>
            <div className={styles.navheader}>
                <p>LockedIn</p>
                <BrandLogo className={styles.navheader_logo} />
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