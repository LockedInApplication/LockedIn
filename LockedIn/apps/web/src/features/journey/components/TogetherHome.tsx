"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { SimplePlan } from "@/features/roadmap/roadmap.types";
import { shouldCelebrateLockIn } from "../together-home";
import photo from "../../../../public/together/two-coffees.webp";
import styles from "./together-home.module.scss";

const inbox = { href: "/connections", label: "Open Inbox" };
const invite = { href: "/connections?compose=invite", label: "Invite someone you know" };
const discover = { href: "/discover", label: "Meet someone new" };

export function TogetherWelcome({ hasInboxActivity, canInvite, requiresLockIn = true }: {
  hasInboxActivity: boolean;
  canInvite: boolean;
  requiresLockIn?: boolean;
}) {
  const primary = !hasInboxActivity && canInvite ? invite : inbox;
  const secondary = (canInvite ? [inbox, invite, discover] : [inbox, discover]).filter(action => action !== primary);

  return <section className={styles.welcome} aria-labelledby="together-welcome">
    <div className={styles.welcomeCopy}>
      <p className={styles.eyebrow}>Together</p>
      <h1 id="together-welcome">Make time for someone.</h1>
      <p className={styles.lede}>{requiresLockIn
        ? "Start with a chat. When you both choose to lock in, you’ll have a private place to talk and make plans."
        : "Invite someone you know or meet someone new. Together gives you a private place to talk and make plans."}</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href={primary.href}>{primary.label}<span aria-hidden="true">↗</span></Link>
        <div className={styles.links}>{secondary.map(action => <Link key={action.href} href={action.href}>{action.label}</Link>)}</div>
      </div>
    </div>
    <figure className={styles.photo}>
      <Image src={photo} alt="Two coffees on a café table, one with a heart in the foam" width={1440} height={960}
        sizes="(max-width: 700px) 91vw, (max-width: 1400px) 45vw, 590px" preload />
      <figcaption>A table for two</figcaption>
    </figure>
  </section>;
}

type AvatarIdentity = { name: string; avatarPreset?: string };
export function TogetherHomeHeading({ user, userId, partner, locked, lockedAt }: {
  user: AvatarIdentity;
  userId: string;
  partner: AvatarIdentity;
  locked: boolean;
  lockedAt?: string;
}) {
  const pair = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const element = pair.current;
    if (!element || !locked || !lockedAt) return;
    const storageKey = `lockedin:together-arrival:${userId}`;
    let previous = shown.current;
    try { previous ??= localStorage.getItem(storageKey); } catch { /* The ceremony still works with storage disabled. */ }
    if (!shouldCelebrateLockIn(lockedAt, previous, Date.now())) return;
    shown.current = lockedAt;
    try { localStorage.setItem(storageKey, lockedAt); } catch { /* The current visit is already marked seen. */ }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) element.dataset.arrival = "true";
  }, [userId, locked, lockedAt]);

  return <section className={styles.paired} aria-labelledby="together-pair">
    <div className={styles.pairAvatars} ref={pair} aria-hidden="true">
      <ProfileAvatar name={user.name} preset={user.avatarPreset} />
      <ProfileAvatar name={partner.name} preset={partner.avatarPreset} />
    </div>
    <p className={styles.eyebrow}>Together</p>
    <h1 id="together-pair">You &amp; {partner.name}</h1>
    {locked ? <p className={styles.locked} role="status">You both chose to lock in.</p> : null}
  </section>;
}

export function TogetherPlan({ plan, onOpen }: { plan: SimplePlan; onOpen: (href: string) => void }) {
  const href = `/journey?view=roadmap#step-${encodeURIComponent(plan.id)}`;
  return <Link className={styles.plan} href={href} onNavigate={event => { event.preventDefault(); onOpen(href); }}>
    <span><span className={styles.eyebrow}>Coming up together</span><strong>{plan.title}</strong></span><span aria-hidden="true">↗</span>
  </Link>;
}
