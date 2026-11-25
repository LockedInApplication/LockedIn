"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useDiscoveryResource } from "@/features/discovery/use-discovery-resource";
import { togetherReportingProfileAnchor } from "@/features/journey/journey.navigation";
import { loadTogetherReportingPreference, optOutOfTogetherReporting } from "./profile.client";
import styles from "./profile.module.scss";

export default function ProfileTogetherReporting({ userId, onOpenNotice }: {
  userId: string;
  onOpenNotice: () => void;
}) {
  const load = useCallback((signal: AbortSignal) => loadTogetherReportingPreference(userId, signal), [userId]);
  const { value, error, retry, install } = useDiscoveryResource(userId, "together-reporting", load);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  async function optOut() {
    if (!value || value.optedOut || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await optOutOfTogetherReporting(userId);
      if (result?.optedOut !== true) throw new Error();
      install(result);
      heading.current?.focus({ preventScroll: true });
    } catch {
      setSaveError("We couldn’t save your opt-out. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.reportingPreference} aria-labelledby={togetherReportingProfileAnchor}>
    <h3 id={togetherReportingProfileAnchor} tabIndex={-1} ref={heading}>Together reporting</h3>
    <p>Only couples who both agreed to the pilot are counted. Either partner can keep the pair out of reports without leaving Together. We don’t notify your partner.</p>
    <Link href="/privacy" onNavigate={event => { event.preventDefault(); onOpenNotice(); }}>Read the Together privacy notice</Link>
    {!value && !error ? <p role="status">Checking your reporting choice…</p> : null}
    {error ? <div>
      <p role="alert">We couldn’t load your reporting choice.</p>
      <button type="button" className={styles.textButton} onClick={retry}>Try again</button>
    </div> : null}
    {value?.optedOut === true ? <p role="status">You’ve opted out of Together reporting. Your plans and memories haven’t changed.</p> : null}
    {value?.optedOut === false ? <div className={styles.reportingActions}>
      <button type="button" className={styles.primary} disabled={saving} onClick={() => void optOut()}>
        {saving ? "Saving your choice…" : "Opt out of Together reporting"}
      </button>
      {saveError ? <p role="alert">{saveError}</p> : null}
    </div> : null}
  </section>;
}
