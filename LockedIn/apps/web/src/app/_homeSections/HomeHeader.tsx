"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "../page.module.scss";

const invitePath = "/connections?compose=invite";

export default function HomeHeader() {
  const header = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [onPaper, setOnPaper] = useState(false);
  const closeMenu = () => {
    if (menu.current) menu.current.open = false;
  };

  useEffect(() => {
    const hero = document.getElementById("home-hero");
    const nav = header.current;
    if (!hero || !nav || !("IntersectionObserver" in window)) return;

    let observer: IntersectionObserver | undefined;
    const track = () => {
      observer?.disconnect();
      const height = Math.ceil(nav.getBoundingClientRect().height);
      setOnPaper(hero.getBoundingClientRect().bottom <= height);
      observer = new IntersectionObserver(([entry]) => {
        setOnPaper(!entry.isIntersecting && entry.boundingClientRect.bottom <= height);
      }, { rootMargin: `-${height}px 0px 0px 0px` });
      observer.observe(hero);
    };

    track();
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(track) : undefined;
    resizeObserver?.observe(nav);
    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <header ref={header} className={`${styles.header} ${onPaper ? styles.onPaper : ""}`}>
      <nav className={styles.desktopNav} aria-label="Learn about LockedIn">
        <a href="#how-it-works">How it works</a>
        <a href="#trust">Private space</a>
        <Link href={invitePath} prefetch={false}>Invite someone</Link>
      </nav>
      <details ref={menu} className={styles.mobileMenu} onKeyDown={event => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        closeMenu();
        event.currentTarget.querySelector("summary")?.focus();
      }}>
        <summary aria-label="Navigation"><span aria-hidden="true" /></summary>
        <nav aria-label="Mobile navigation">
          <a href="#how-it-works" onClick={closeMenu}>How it works</a>
          <a href="#trust" onClick={closeMenu}>Private space</a>
          <Link href={invitePath} prefetch={false} onClick={closeMenu}>Invite someone</Link>
          <Link href="/login" onClick={closeMenu}>Sign in</Link>
        </nav>
      </details>
      <a href="#top" className={styles.brand} aria-label="LockedIn home">LockedIn</a>
      <nav className={styles.accountNav} aria-label="Your account">
        <Link href="/login" className={styles.desktopSignIn}>Sign in</Link>
        <Link href="/signup" className={styles.headerJoin} aria-label="Join LockedIn">Join<span> LockedIn</span></Link>
      </nav>
    </header>
  );
}
