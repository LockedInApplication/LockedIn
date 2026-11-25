"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TogetherMemories } from "@/features/memories/use-together-memories";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { SimplePlan } from "@/features/roadmap/roadmap.types";
import { daysTogether, getTogetherNextUp, shouldCelebrateLockIn, togetherPlanHref } from "../together-home";
import { manageTogetherHref } from "../journey.navigation";
import type { JourneyOverview } from "../journey.types";
import TogetherChatActions from "./TogetherChatActions";
import TogetherLetter, { type LetterControls } from "./TogetherLetter";
import WorkspaceNav from "./WorkspaceNav";
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
const lockDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

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
export function TogetherHomeHeading({ user, userId, partner, locked, lockedAt, now }: {
  user: AvatarIdentity;
  userId: string;
  partner: AvatarIdentity;
  locked: boolean;
  lockedAt?: string;
  now: number;
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

  const days = daysTogether(lockedAt, now);
  return <section className={styles.paired} aria-labelledby="together-pair">
    <div className={styles.pairAvatars} ref={pair} aria-hidden="true">
      <ProfileAvatar name={user.name} preset={user.avatarPreset} />
      <ProfileAvatar name={partner.name} preset={partner.avatarPreset} />
    </div>
    <div className={styles.pairTitle}>
      <p className={styles.eyebrow}>Together</p>
      <h1 id="together-pair">You <em>&amp;</em> {partner.name}</h1>
      {locked ? <p className={styles.locked} role="status">{days === null || !lockedAt ? "Locked in together."
        : days === 0 ? "You both chose to lock in today."
        : <>Locked in since <time dateTime={lockedAt}>{lockDate.format(new Date(lockedAt))}</time>{" · "}<strong>{days} {days === 1 ? "day" : "days"}</strong></>}</p> : null}
    </div>
  </section>;
}

export function ManageTogetherLink({ onNavigate }: { onNavigate: (href: string) => void }) {
  return <Link href={manageTogetherHref} className={styles.optionsLink} aria-label="Manage Together"
    onNavigate={event => { event.preventDefault(); onNavigate(manageTogetherHref); }}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
    </svg>
  </Link>;
}

type MemoryPreview = Pick<TogetherMemories, "gallery" | "error">;

export function QuietTogetherHome({ overview, memories, letter, onNavigate, confirmLeave, children }: {
  overview: JourneyOverview;
  memories: MemoryPreview;
  letter: LetterControls;
  onNavigate: (href: string) => void;
  confirmLeave: () => boolean;
  children?: ReactNode;
}) {
  const [now] = useState(Date.now);
  const relationship = overview.relationship;
  if (!relationship) return null;
  const lockedTogether = relationship.isMutuallyLockedIn === true;
  const chatId = overview.messaging?.enabled ? overview.messaging.conversationId : null;
  const nextUp = getTogetherNextUp(overview);
  return <div className={styles.quietHome}>
    <header className={styles.quietHeader}>
      <TogetherHomeHeading user={{ ...overview.user, name: overview.user.name || overview.user.email }} userId={overview.user.id}
        partner={relationship.partner} locked={lockedTogether} lockedAt={relationship.mutuallyLockedInAt} now={now} />
      <ManageTogetherLink onNavigate={onNavigate} />
    </header>
    {lockedTogether ? <TogetherLetter {...letter} partnerName={relationship.partner.name} gallery={memories.gallery} now={now} onNavigate={onNavigate} /> : null}
    {chatId ? <TogetherChatActions conversationId={chatId} partnerName={relationship.partner.name} confirmLeave={confirmLeave} /> : null}
    {nextUp?.kind === "check-in" ? <NextUpLink label="Your turn" href={nextUp.href} title={nextUp.title} detail={nextUp.detail} onOpen={onNavigate} />
      : nextUp?.kind === "plan" ? <TogetherPlan plan={nextUp.plan} onOpen={onNavigate} /> : null}
    <WorkspaceNav section="home" lockedTogether={lockedTogether} onNavigate={onNavigate} />
    {children}
  </div>;
}

const planDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export function TogetherPlan({ plan, onOpen }: { plan: SimplePlan; onOpen: (href: string) => void }) {
  return <NextUpLink href={togetherPlanHref(plan.id)} label="Coming up together" title={plan.title}
    detail={plan.day ? <time dateTime={plan.day}>{planDay.format(new Date(`${plan.day}T12:00:00Z`))}</time> : "No day picked yet"} onOpen={onOpen} />;
}

function NextUpLink({ href, label, title, detail, onOpen }: {
  href: string; label: string; title: string; detail: ReactNode; onOpen: (href: string) => void;
}) {
  return <Link className={styles.plan} data-next-up href={href} onNavigate={event => { event.preventDefault(); onOpen(href); }}>
    <span><span className={styles.eyebrow}>{label}</span><strong>{title}</strong><small>{detail}</small></span><span aria-hidden="true">↗</span>
  </Link>;
}
