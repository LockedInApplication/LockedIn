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

const unlocks = [
  { title: "A private space", detail: "Talk, make plans, or check in privately when you both want to." },
  { title: "Discovery pauses", detail: "You won’t see new profiles while you’re locked in. Your existing chats stay open." },
  { title: "The Atlas of Us", detail: "Answer separately, choose when to reveal, and write a shared meaning together." },
];

const sampleLandmarks = [
  { title: "Support", icon: "✓", status: "Shared", prompt: "When one of us has a hard week, what does support look like from the other?", answer: "Ask if I want advice or just someone to listen." },
  { title: "Space", icon: "◌", status: "In progress", prompt: "How can we ask for time alone and still feel connected?" },
  { title: "Quality time", icon: "☀", status: "Unexplored", prompt: "What’s a small moment together you’d like more of?" },
];

export function TogetherWelcome({ hasInboxActivity, canInvite, requiresLockIn = true }: {
  hasInboxActivity: boolean;
  canInvite: boolean;
  requiresLockIn?: boolean;
}) {
  const primary = !hasInboxActivity && canInvite ? invite : inbox;
  const secondary = (canInvite ? [inbox, invite] : [inbox]).filter(action => action !== primary);

  return <><section className={styles.welcome} aria-labelledby="together-welcome">
    <div className={styles.welcomeCopy}>
      <p className={styles.eyebrow}>Together</p>
      <h1 id="together-welcome">Make time{" "}<span>for <em>someone.</em></span></h1>
      <p className={styles.lede}>{requiresLockIn
        ? "Start with a chat. When you both choose to lock in, you’ll have a private place to talk and make plans."
        : "Invite someone you know or meet someone new. Together gives you a private place to talk and make plans."}</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href={primary.href}>{primary.label}<span aria-hidden="true">→</span></Link>
        <div className={styles.links}>
          {secondary.map(action => <Link key={action.href} href={action.href}>{action.label}</Link>)}
          {requiresLockIn ? <a href="#lock-in-details">How locking in works</a> : null}
          <Link href={discover.href}>{discover.label}</Link>
        </div>
      </div>
    </div>
    <figure className={styles.photo}>
      <Image src={photo} alt="Two coffees on a café table, one with a heart in the foam" width={1440} height={960}
        sizes="(max-width: 700px) 91vw, (max-width: 1400px) 45vw, 590px" preload />
      <figcaption>A table for two</figcaption>
    </figure>
  </section>{requiresLockIn ? <TogetherPreview /> : null}</>;
}

function TogetherPreview() {
  return <>
    <section id="lock-in-details" tabIndex={-1} className={styles.unlocks} aria-labelledby="lock-in-title">
      <p className={styles.eyebrow}>What unlocks</p>
      <h2 id="lock-in-title">One person, one space, no noise.</h2>
      <ol className={styles.unlockList} role="list">
        {unlocks.map(({title, detail}, index) => (
          <li key={title}>
            <span aria-hidden="true">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{detail}</p>
          </li>
        ))}
      </ol>
    </section>
    <section className={styles.atlasPreview} aria-labelledby="atlas-preview-title">
      <div className={styles.previewCopy}>
        <p className={styles.eyebrow}>The Atlas of Us</p>
        <h2 id="atlas-preview-title">One chapter at a time.</h2>
        <p>A shared vocabulary you build together. Answer the same prompt separately, then reveal your answers when you’re both ready.</p>
        <p className={styles.sampleBadge}>Example · 1 of 3 landmarks explored</p>
      </div>
      <div className={styles.atlasExamples} aria-label="Sample Atlas chapters">
        {sampleLandmarks.map(({title, icon, status, prompt, answer}) => (
          <details key={title} name="together-atlas-preview" open={status === "Shared"}>
            <summary>
              <span className={styles.landmarkIcon} data-shared={status === "Shared"} aria-hidden="true">{icon}</span>
              <strong>{title}</strong>
              <span className={styles.landmarkStatus}>{status}</span>
              <span className={styles.landmarkChevron} aria-hidden="true" />
            </summary>
            <div className={styles.exampleAnswer}><p>{prompt}</p>{answer ? <blockquote>“{answer}”</blockquote> : null}</div>
          </details>
        ))}
      </div>
    </section>
  </>;
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
