"use client";

import { useEffect, useRef, useState } from "react";
import { discoveryRequest } from "./discovery.client";
import type { DiscoveryLocation } from "./discovery.types";
import styles from "./discovery.module.scss";

export default function DiscoveryLocationCheck({ userId, confirmed, currentExpiresAt, onChecked, buttonClassName }: {
  userId: string; confirmed: boolean; currentExpiresAt?: string | null; onChecked: (location: DiscoveryLocation) => void; buttonClassName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function check() {
    if (active.current) return;
    setError("");
    if (!navigator.geolocation) {
      setError("This browser can’t check your location. Try opening LockedIn in a browser with location permission enabled.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    const finish = () => {
      if (controller.signal.aborted) return;
      active.current = null;
      setBusy(false);
    };
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (controller.signal.aborted) return;
      try {
        if (!Number.isFinite(coords.accuracy) || coords.accuracy > 5000) throw Error("Your location wasn’t precise enough to check your area. Try again where your device has a clearer signal.");
        const result = await discoveryRequest<DiscoveryLocation>(userId, "/api/discovery/location-check", {
          method: "POST", signal: controller.signal,
          body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, accuracyMeters: coords.accuracy }),
        });
        if (!controller.signal.aborted) onChecked(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "We couldn’t confirm your location. Try again.");
      } finally { finish(); }
    }, failure => {
      if (controller.signal.aborted) return;
      setError(failure.code === 1 ? "Location permission is off. Enable it for LockedIn in your browser settings to use local Discovery." : "We couldn’t get your current location. Try again when your device has a clearer signal.");
      finish();
    }, { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 });
  }

  return <>
    <button type="button" className={buttonClassName ?? (confirmed ? undefined : styles.primary)} disabled={busy} onClick={check}>
      {busy ? "Checking location…" : confirmed ? "Update my location" : "Confirm my location"}
    </button>
    {error ? <p role="alert" className={styles.error}>{error}{currentExpiresAt ? <> Your previous check stays active until <time dateTime={currentExpiresAt}>{new Date(currentExpiresAt).toLocaleString()}</time>. You can pause Discovery in your profile.</> : null}</p> : null}
  </>;
}
