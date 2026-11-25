"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { discoveryVisibilityHref, togetherChatSafetyHref, togetherReportingProfileHref } from "../journey.navigation";
import styles from "./manage-together.module.scss";

export const leaveTogetherDescription = "Leaving ends Together for both of you. You’ll both lose access to this space, its plans and memories, and any chat linked to it. Your other chats stay open. Neither profile becomes visible in Discovery automatically.";

export default function ManageTogether({ conversationId, busy, onLeave, onNavigate }: {
  conversationId: string | null;
  busy: boolean;
  onLeave: () => void;
  onNavigate: (href: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const destinations = [
    {
      href: conversationId ? togetherChatSafetyHref(conversationId) : "/connections",
      title: conversationId ? "Chat safety" : "Open Inbox",
      detail: conversationId ? "Block a contact or learn how to report a message." : "Block or report from the chat you want to manage.",
      icon: "M20 11.5a8 8 0 0 1-8 8H4l1.4-3.5A8 8 0 1 1 20 11.5Z",
    },
    {
      href: discoveryVisibilityHref,
      title: "Discovery visibility",
      detail: "Check who can see your Discovery profile.",
      icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
    },
    {
      href: togetherReportingProfileHref,
      title: "Together reporting",
      detail: "See what we count or opt out privately.",
      icon: "M12 3 5 6v5c0 4.6 3.3 7.8 7 10 3.7-2.2 7-5.4 7-10V6l-7-3ZM9 12l2 2 4-4",
    },
  ];

  return <div className={styles.screen}>
    <h1 tabIndex={-1} ref={heading}>Manage Together</h1>
    <section className={styles.leaveCard} aria-labelledby="manage-together-choice">
      <h2 id="manage-together-choice">Your participation is always voluntary.</h2>
      <p>You can leave Together at any time.</p>
      <div className={styles.leaveActions}>
        <button type="button" disabled={busy} onClick={onLeave}>Leave Together</button>
      </div>
    </section>
    <nav className={styles.shortcuts} aria-labelledby="manage-together-shortcuts">
      <h2 id="manage-together-shortcuts">Where other things live</h2>
      <ul role="list">
        {destinations.map(({ href, title, detail, icon }, index) => (
          <li key={href}>
            <Link href={href} aria-labelledby={`${id}-${index}-title`} aria-describedby={`${id}-${index}-detail`}
              onNavigate={event => { event.preventDefault(); onNavigate(href); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
              <span><strong id={`${id}-${index}-title`}>{title}</strong><small id={`${id}-${index}-detail`}>{detail}</small></span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  </div>;
}
