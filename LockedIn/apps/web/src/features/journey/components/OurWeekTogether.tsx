"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useDiscoveryResource } from "@/features/discovery/use-discovery-resource";
import { MemoryThumbnail } from "@/features/memories/MemoryEnvelopes";
import { memoryPath } from "@/features/memories/memory-api";
import { memoryNoteHref } from "@/features/memories/memory-note-preview";
import { JourneyApiError, journeyRequest } from "../journey.client";
import { ourWeekDetailHref } from "../journey.navigation";
import { togetherPlanHref } from "../together-home";
import styles from "./our-week-together.module.scss";

export type OurWeek = {
  startsOn: string;
  endsOn: string;
  plans: { id: string; title: string; completedAt: string }[];
  memories: { id: string; title: string; sharedAt: string; envelopeTitle: string | null }[];
  topic: { title: string; discussedAt: string } | null;
};
const shortDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const weekSpan = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const utcDay = (day: string) => new Date(day + "T00:00:00Z");

function RecapLink({ href, title, detail, picture, onNavigate }: {
  href: string;
  title: string;
  detail: ReactNode;
  picture: ReactNode;
  onNavigate: (href: string) => void;
}) {
  return <Link className={styles.item} href={href} prefetch={false}
    onNavigate={event => { event.preventDefault(); onNavigate(href); }}>
    {picture}
    <span className={styles.copy}><strong>{title}</strong><small>{detail}</small></span>
    <span className={styles.arrow} aria-hidden="true">›</span>
  </Link>;
}

function Day({ iso }: { iso: string }) {
  return <time dateTime={iso}>{shortDay.format(new Date(iso))}</time>;
}

export function OurWeekHighlights({ recap, relationshipId, onNavigate }: {
  recap: OurWeek;
  relationshipId: string;
  onNavigate: (href: string) => void;
}) {
  if (!recap.plans.length && !recap.memories.length && !recap.topic) return <div className={styles.empty}>
    <h2>Nothing to revisit from last week yet.</h2>
    <p>Finished plans, shared photos, and topics you mark discussed will show up here.</p>
  </div>;

  return <>
    {recap.plans.length ? <section className={styles.group} aria-labelledby="our-week-plans">
      <h2 id="our-week-plans">Plans</h2>
      <ul role="list">{recap.plans.map(plan => <li key={plan.id}>
        <RecapLink href={ourWeekDetailHref(togetherPlanHref(plan.id))} title={plan.title} onNavigate={onNavigate}
          detail={<><Day iso={plan.completedAt} /> · Marked done</>}
          picture={<span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 6h14v14H5zM8 4v4m8-4v4M5 10h14m-9 5 1.5 1.5L15 13" />
          </svg></span>} />
      </li>)}</ul>
    </section> : null}
    {recap.memories.length ? <section className={styles.group} aria-labelledby="our-week-memories">
      <h2 id="our-week-memories">Memories</h2>
      <ul role="list">{recap.memories.map(photo => <li key={photo.id}>
        <RecapLink href={ourWeekDetailHref(memoryNoteHref({ kind: "photo", photoId: photo.id }))} title={photo.title} onNavigate={onNavigate}
          detail={<><Day iso={photo.sharedAt} /> · {photo.envelopeTitle ?? "Shared photo"}</>}
          picture={<MemoryThumbnail className={styles.thumbnail} base={memoryPath(relationshipId)} photo={photo} />} />
      </li>)}</ul>
    </section> : null}
    {recap.topic ? <section className={styles.topic} aria-labelledby="our-week-conversation">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 5H4v9h3v3l3-3h4zM17 9h3v9h-3v3l-3-3h-3v-1" />
      </svg>
      <div className={styles.copy}>
        <h2 id="our-week-conversation">{recap.topic.title}</h2>
        <small><Day iso={recap.topic.discussedAt} /> · Marked discussed in Room to Talk</small>
      </div>
    </section> : null}
  </>;
}

export default function OurWeekTogether({ relationshipId, userId, partnerName, revision, onNavigate, onExpired }: {
  relationshipId: string;
  userId: string;
  partnerName: string;
  revision: number;
  onNavigate: (href: string) => void;
  onExpired: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const read = useCallback(async (signal: AbortSignal) => {
    try {
      return await journeyRequest<OurWeek>(`/api/journey/relationships/${encodeURIComponent(relationshipId)}/our-week`, {
        cache: "no-store", signal, headers: { "X-Together-Owner": userId },
      });
    } catch (error) {
      if (!signal.aborted && error instanceof JourneyApiError && error.status === 401) onExpired();
      throw error;
    }
  }, [relationshipId, userId, onExpired]);
  const { value, error, retry } = useDiscoveryResource(userId, "our-week:" + relationshipId, read, revision);

  return <section className={styles.recap} aria-labelledby="our-week-title">
    <header className={styles.heading}>
      <p className={styles.eyebrow}>Together · Weekly recap</p>
      <h1 id="our-week-title" tabIndex={-1} ref={heading}>Our Week Together</h1>
      <div className={styles.context}>
        {value && !error ? <p>{weekSpan.formatRange(utcDay(value.startsOn), utcDay(value.endsOn))}</p> : null}
        <p className={styles.private}>Only you and {partnerName}</p>
      </div>
    </header>

    {error ? <div className={styles.empty}>
      <p role="alert">{error}</p>
      <button type="button" onClick={retry}>Try again</button>
    </div> : value ? <OurWeekHighlights recap={value} relationshipId={relationshipId} onNavigate={onNavigate} />
      : <p className={styles.status} role="status">Opening your recap…</p>}
  </section>;
}
