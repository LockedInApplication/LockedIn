"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { readPrivateMemoryMedia } from "./memory-api";
import styles from "./memories.module.scss";

export function usePrivateAsset(path: string, version = "") {
  const [attempt, retry] = useState(0);
  const key = JSON.stringify([path, version, attempt]);
  const [result, setResult] = useState<{ key: string; url?: string; failed?: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void readPrivateMemoryMedia(path, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ key, url });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, failed: true });
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, path]);
  return { ...(result?.key === key ? result : {}), retry: () => retry(value => value + 1) };
}

export function MemoryVoicePlayer({ path, version, label }: { path: string; version: string; label: string }) {
  const media = usePrivateAsset(path, version);
  if (media.failed) return <p className={styles.small}>Couldn’t load the voice note. <button type="button" className={styles.link} onClick={media.retry}>Try again</button></p>;
  if (!media.url) return <p className={styles.small} role="status">Loading voice note…</p>;
  return <VoicePlayer source={media.url} label={label} />;
}

export function DraftVoicePlayer({ clip }: { clip: Blob }) {
  return <VoicePlayer source={clip} label="your recording" />;
}

const shape = [6, 10, 15, 9, 19, 13, 7, 12, 20, 13, 16, 8, 19, 12, 8, 14, 11, 6];
const time = (seconds: number) => "0:" + String(seconds).padStart(2, "0");

function VoicePlayer({ source, label }: { source: Blob | string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playback, setPlayback] = useState({ current: 0, duration: 0, playing: false });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const local = typeof source !== "string";
    const url = local ? URL.createObjectURL(source) : source;
    audio.src = url;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      if (local) URL.revokeObjectURL(url);
    };
  }, [source]);
  const update = (audio: HTMLAudioElement) => setPlayback({
    current: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0, playing: !audio.paused && !audio.ended,
  });
  const total = playback.duration > 0 ? Math.max(1, Math.round(playback.duration)) : 0;
  const played = playback.duration > 0 ? shape.length * playback.current / playback.duration : 0;
  return <div className={styles.voicePlayer}>
    <audio ref={audioRef} preload="metadata" data-voice-player={label} aria-hidden="true"
      onLoadedMetadata={event => update(event.currentTarget)} onTimeUpdate={event => update(event.currentTarget)}
      onPlay={event => update(event.currentTarget)} onPause={event => update(event.currentTarget)}
      onEnded={event => { event.currentTarget.currentTime = 0; update(event.currentTarget); }}
      onError={() => setFailed(true)} />
    <button type="button" className={styles.play} aria-label={`${playback.playing ? "Pause" : "Play"} ${label}`} onClick={() => {
      const audio = audioRef.current;
      if (!audio) return;
      setFailed(false);
      if (audio.paused) void audio.play().catch(() => setFailed(true));
      else audio.pause();
    }}>
      <span className={styles.playIcon} aria-hidden="true">{playback.playing ? "Ⅱ" : "▶"}</span>
      <span className={styles.wave} aria-hidden="true">{shape.map((height, index) => (
        <i key={index} data-played={index < played || undefined} style={{ "--bar-height": height + "px" } as CSSProperties} />
      ))}</span>
      <span className={styles.time} aria-hidden="true">{playback.playing || playback.current ? `${time(Math.min(total, Math.floor(playback.current)))} / ` : ""}{total ? time(total) : "–"}</span>
    </button>
    {failed ? <p className={styles.error} role="status">Couldn’t play this recording.</p> : null}
  </div>;
}
