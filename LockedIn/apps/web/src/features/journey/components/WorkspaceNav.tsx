"use client";

import styles from "@/app/journey/journey.module.scss";
import type { WorkspaceView } from "../journey.navigation";

export default function WorkspaceNav({
  active,
  onChange,
}: {
  active: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  const items: Array<{ key: WorkspaceView; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "⌂" },
    { key: "conversations", label: "Conversations", icon: "◎" },
    { key: "atlas", label: "Atlas", icon: "✦" },
    { key: "roadmap", label: "Roadmap", icon: "↗" },
    { key: "chapters", label: "Chapters", icon: "◌" },
  ];

  return (
    <nav className={styles.workspaceNav} aria-label="Relationship workspace">
      {items.map((item) => (
        <button
          key={item.key}
          className={active === item.key ? styles.workspaceNavActive : ""}
          onClick={() => onChange(item.key)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

