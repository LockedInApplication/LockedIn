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
      // Section links leave a small gap below the sticky nav. Switch to the
      // light treatment there too, even if the last few pixels of the hero remain.
      const boundary = Math.ceil(nav.getBoundingClientRect().height) + 20;
      setOnPaper(hero.getBoundingClientRect().bottom <= boundary);
      observer = new IntersectionObserver(([entry]) => {
        setOnPaper(!entry.isIntersecting && entry.boundingClientRect.bottom <= boundary);
      }, { rootMargin: `-${boundary}px 0px 0px 0px` });
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
      <div className={styles.headerInner}>
        <a href="#top" className={styles.brand} aria-label="LockedIn home">
          <span>Locked<em>In</em></span>
        </a>
        <nav className={styles.desktopNav} aria-label="Learn about LockedIn">
          <a href="#how-it-works">How it works</a>
          <a href="#trust">Private space</a>
          <a href="#app-preview">Inside the app</a>
        </nav>
        <Link href="/signup" className={styles.headerJoin}>Get started</Link>
        <details ref={menu} className={styles.mobileMenu} onKeyDown={event => {
          if (event.key !== "Escape" || !event.currentTarget.open) return;
          closeMenu();
          event.currentTarget.querySelector("summary")?.focus();
        }}>
          <summary aria-label="Navigation"><span aria-hidden="true" /></summary>
          <nav aria-label="Mobile navigation">
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#trust" onClick={closeMenu}>Private space</a>
            <a href="#app-preview" onClick={closeMenu}>Inside the app</a>
            <Link href={invitePath} prefetch={false} onClick={closeMenu}>Invite someone</Link>
            <Link href="/login" onClick={closeMenu}>Sign in</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
