"use client";

import { useState } from "react";
import BrandLogo from "./brandLogo";
import Button from "./button";
import styles from "./styles/navbar.module.scss";

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const closeMenu = () => {
        setIsOpen(false);
    };

    return (
        <nav className={styles.navbar}>
            <div className={styles.navheader}>
                <p>LockedIn</p>
                <BrandLogo />
            </div>
            <button 
                className={`${styles.hamburger} ${isOpen ? styles.active : ""}`}
                onClick={toggleMenu}
                aria-label="Toggle navigation menu"
            >
                <span></span>
                <span></span>
                <span></span>
            </button>
            <div className={`${styles.nav_list} ${isOpen ? styles.active : ""}`}>
                <div onClick={closeMenu}>How it works</div>
                <div onClick={closeMenu}>Preview</div>
                <div onClick={closeMenu}>Trust</div>
                <Button>Join Waitlist</Button>
            </div>
        </nav>
    );
}