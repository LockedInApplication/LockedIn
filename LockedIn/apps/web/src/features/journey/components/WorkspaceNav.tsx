"use client";

import Link from "next/link";
import navStyles from "../workspace-nav.module.scss";
import type { WorkspaceView } from "../journey.navigation";

const links: Array<{ key: WorkspaceView; label: string; icon: string }> = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "conversations", label: "Conversations", icon: "◎" },
  { key: "atlas", label: "Atlas", icon: "✦" },
  { key: "roadmap", label: "Our next steps", icon: "↗" },
  { key: "memories", label: "Behind the Photo", icon: "▧" },
  { key: "chapters", label: "Past conversations", icon: "◌" },
];
const secondaryLinks = [
  { key: "room-to-talk", label: "Room to Talk", icon: "◎" } as const,
  ...links.filter(({ key }) => key !== "home" && key !== "conversations"),
];

export default function WorkspaceNav({
  active,
  onChange,
  lockedTogether = false,
}: {
  active: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
  lockedTogether?: boolean;
}) {
  const home = active === "home";

  return (
    <nav className={home ? navStyles.homeLinks : `${navStyles.navigation} ${active === "conversations" ? navStyles.compact : ""}`}
      data-memories={lockedTogether || undefined}
      aria-label={home ? "Together resources" : "Relationship workspace"}>
      {(home ? secondaryLinks : links).filter(({ key }) => (key !== "memories" && key !== "room-to-talk") || lockedTogether).map(({ key, label, icon }) => (
        <Link
          key={key}
          href={key === "home" ? "/journey" : `/journey?view=${key}`}
          aria-current={active === key ? "page" : undefined}
          onNavigate={event => { event.preventDefault(); onChange(key); }}
        >
          {!home ? <span aria-hidden="true">{icon}</span> : null}
          {label}
        </Link>
      ))}
    </nav>
  );
}

