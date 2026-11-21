"use client";

import { useEffect } from "react";
import styles from "../page.module.scss";

const revealThreshold = 0.15;

export default function HomeMotion() {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main || !("IntersectionObserver" in window) ||
      !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < revealThreshold) continue;
        observer.unobserve(entry.target);
        entry.target.classList.add(styles.arrive);
      }
    }, { threshold: revealThreshold });

    main.querySelectorAll("[data-home-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return null;
}
