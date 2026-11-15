"use client";

import navStyles from "../workspace-nav.module.scss";
import type { WorkspaceView } from "../journey.navigation";

export default function WorkspaceNav({
  active,
  onChange,
  compact=false,
}: {
  active: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
  compact?:boolean;
}) {
  const items: Array<{ key: WorkspaceView; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "⌂" },
    { key: "conversations", label: "Conversations", icon: "◎" },
    { key: "atlas", label: "Understand each other", icon: "✦" },
    { key: "roadmap", label: "Our next steps", icon: "↗" },
    { key: "chapters", label: "Past conversations", icon: "◌" },
  ];

  return (
    <nav className={`${navStyles.navigation} ${compact?navStyles.compact:''}`} aria-label="Relationship workspace">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? navStyles.active : ""}
          aria-current={active === item.key ? "page" : undefined}
          onClick={() => onChange(item.key)}
        >
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

