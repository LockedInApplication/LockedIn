"use client";

import Link from "next/link";
import { workspaceHref, type WorkspaceView } from "../journey.navigation";
import styles from "../workspace-nav.module.scss";

type Entry = { view: WorkspaceView; title: string; detail: string; path: string; lockedOnly?: boolean };
const homeEntries: Entry[] = [
  { view: "talk", title: "Talk", detail: "Topics, check-ins, and Atlas", path: "M19 11.5a7 7 0 0 1-7.5 6.5H4l1.6-3A6.5 6.5 0 0 1 4 11c0-3.9 3.4-7 7.5-7s7.5 3.1 7.5 7.5Z" },
  { view: "roadmap", title: "Plans", detail: "Outings and things you agree to do", path: "M5 6h14v14H5zM8 4v4m8-4v4M5 10h14m-9 4h4" },
  { view: "memories", title: "Memories", detail: "Photos, envelopes, and stories", path: "M4 5h16v14H4zM4 16l4-4 4 4 4-4 4 4M8 9h.01", lockedOnly: true },
];
const talkEntries: Entry[] = [
  { view: "room-to-talk", title: "Room to Talk", detail: "Bring your own topics and talk them through.", path: "M3 5h6l3 2 3-2h6v13h-6l-3 2-3-2H3zM12 7v13", lockedOnly: true },
  { view: "check-ins", title: "Check-ins", detail: "Answer privately. Choose what to share.", path: "M6 4h12v16H6zM9 9h6m-6 4h6m-6 4h3" },
  { view: "atlas", title: "Atlas", detail: "Find a meaning for words that matter to both of you.", path: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z" },
];

export default function WorkspaceNav({ section, lockedTogether, onNavigate }: {
  section: "home" | "talk";
  lockedTogether: boolean;
  onNavigate: (href: string) => void;
}) {
  const entries = section === "home" ? homeEntries : talkEntries;
  return <nav className={styles.navigation} aria-label={section === "home" ? "Together sections" : "Talk sections"}>
    {section === "home" ? <h2>Your space</h2> : null}
    {entries.filter(entry => !entry.lockedOnly || lockedTogether).map(({ view, title, detail, path }) => {
      const href = workspaceHref(view);
      return <Link key={view} className={styles.row} href={href}
        onNavigate={event => { event.preventDefault(); onNavigate(href); }}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
        </span>
        <span className={styles.copy}><strong>{title}</strong><small>{detail}</small></span>
        <span className={styles.chevron} aria-hidden="true">›</span>
      </Link>;
    })}
  </nav>;
}
