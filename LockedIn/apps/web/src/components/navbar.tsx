"use client";

import { useState } from "react";
import BrandLogo from "./brandLogo";
import Button from "./button";
import Link from "next/link";
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
                <a href="#how-it-works" onClick={closeMenu}>How it works</a>
                <a href="#preview" onClick={closeMenu}>Preview</a>
                <a href="#trust" onClick={closeMenu}>Trust</a>
                <Link href="/journey" onClick={closeMenu}><Button>Open LockedIn</Button></Link>
            </div>
        </nav>
    );
}
