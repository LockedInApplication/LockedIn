"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "../page.module.scss";

const revealThreshold = 0.18;

export default function StoryMotion({ children }: { children: ReactNode }) {
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!grid.current || !("IntersectionObserver" in window) ||
      !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < revealThreshold) continue;
        observer.unobserve(entry.target);
        entry.target.classList.add(styles.arrive);
      }
    }, { threshold: revealThreshold });

    grid.current.querySelectorAll("[data-home-story]").forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  // Preserve old homepage links to the first-hello demo.
  return <div id="preview" tabIndex={-1} className={styles.stories} ref={grid}>{children}</div>;
}
