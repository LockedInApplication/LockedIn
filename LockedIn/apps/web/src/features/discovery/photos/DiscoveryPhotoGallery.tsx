"use client";
import { useState, type ReactNode } from "react";
import type { PhotoCard } from "./discovery-photo.types";
import styles from "./discovery-photo.module.scss";

export function DiscoveryPhotoImage({ id, kind = "ordinary", alt, className, fallback = null }: { id: string; kind?: "ordinary" | "review"; alt: string; className: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return fallback;
  const src = `/api/discovery/${kind === "review" ? "moderation/" : ""}photos/${id}/media`;
  // Private, cookie-authenticated media must never use the shared image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}

export default function DiscoveryPhotoGallery({ photos, name }: { photos?: PhotoCard[]; name: string }) {
  if (!photos?.length) return null;
  return <ul className={styles.photos} aria-label="Discovery photos">{photos.slice(0, 3).map(({ id }, index) => <li key={id}><DiscoveryPhotoImage id={id} className={styles.photo} alt={`Photo ${index + 1} of ${name}`} fallback={<span>Photo unavailable</span>}/></li>)}</ul>;
}
