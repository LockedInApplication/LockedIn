"use client";

import { useEffect, useRef, useState } from "react";
import { beginMemoryCapture, voiceSeconds } from "./memory-voice";
import { DraftVoicePlayer } from "./PrivateMemoryMedia";
import styles from "./memories.module.scss";

type Phase = "idle" | "starting" | "recording" | "finishing";
type Capture = { abort: AbortController; stop?: () => void };

export function MemoryVoiceDraft({ clip, onClip, onActive, disabled }: {
  clip: Blob | null;
  onClip: (clip: Blob | null) => void;
  onActive: (active: boolean) => void;
  disabled: boolean;
}) {
  const capture = useRef<Capture | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => () => capture.current?.abort.abort(), []);
  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const tick = window.setInterval(() => setSeconds(Math.min(voiceSeconds, Math.floor((Date.now() - started) / 1000))), 250);
    const pauseIfHidden = () => {
      if (document.visibilityState === "hidden") capture.current?.stop?.();
    };
    document.addEventListener("visibilitychange", pauseIfHidden);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", pauseIfHidden);
    };
  }, [phase]);

  function record() {
    if (capture.current || disabled) return;
    const current: Capture = { abort: new AbortController() };
    capture.current = current;
    setError("");
    setSeconds(0);
    setPhase("starting");
    onActive(true);
    const finish = (next: Blob | null, reason?: string) => {
      if (capture.current !== current || current.abort.signal.aborted) return;
      capture.current = null;
      setPhase("idle");
      onActive(false);
      if (next) onClip(next);
      if (reason) setError(reason);
    };
    void beginMemoryCapture(current.abort.signal, next => finish(next), message => finish(null, message)).then(({ stop }) => {
      if (capture.current !== current || current.abort.signal.aborted) return;
      current.stop = stop;
      setPhase("recording");
    }).catch((reason: unknown) => {
      const message = reason instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(reason.name)
        ? "Microphone access wasn’t granted. Allow it in your browser or leave a written note."
        : reason instanceof DOMException ? "Couldn’t open the microphone. Try again or leave a written note."
        : reason instanceof Error ? reason.message : "Couldn’t record audio.";
      finish(null, message);
    });
  }

  return <div className={styles.recorder} aria-label="Voice note draft">
    <p className={styles.small}>Up to {voiceSeconds} seconds. Listen before you share.</p>
    {phase === "starting" ? <p className={styles.small} role="status">Waiting for microphone access…</p> : null}
    {phase === "recording" ? <p className={styles.recording}><span aria-hidden="true" /> Recording · {seconds}s / {voiceSeconds}s</p> : null}
    {phase === "finishing" ? <p className={styles.small} role="status">Preparing your recording…</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {clip && phase === "idle" ? <DraftVoicePlayer clip={clip} /> : null}
    <div className={styles.actions}>
      {phase === "recording" ? <button type="button" className={styles.primary} onClick={() => {
        setPhase("finishing");
        capture.current?.stop?.();
      }}>Stop recording</button> : null}
      {phase === "idle" ? <>
        <button type="button" className={styles.secondary} onClick={record} disabled={disabled}>{clip ? "Record again" : "Record voice note"}</button>
        {clip ? <button type="button" className={styles.link} disabled={disabled} onClick={() => onClip(null)}>Discard recording</button> : null}
      </> : null}
    </div>
  </div>;
}
