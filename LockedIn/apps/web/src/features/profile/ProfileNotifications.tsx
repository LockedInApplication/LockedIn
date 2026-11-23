"use client";
import { useEffect, useState } from "react";
import type { Profile } from "./profile.types";
import { saveNotificationPreferences } from "./profile.client";
import styles from "./profile.module.scss";
export default function ProfileNotifications({
  profile,
  onSaved,
  onDirty,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [email, setEmail] = useState(profile.activityEmails),
    [inApp, setInApp] = useState(profile.inAppActivity);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty =
    email !== profile.activityEmails || inApp !== profile.inAppActivity;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return (
    <section className={styles.card} aria-labelledby="profile-notifications">
      <h2 id="profile-notifications" tabIndex={-1}>Notifications</h2>
      <p>A little less noise, on your terms.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            onSaved(
              await saveNotificationPreferences(
                { activityEmails: email, inAppActivity: inApp },
                profile.id,
              ),
            );
            setMessage("Notification preferences saved.");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to save preferences.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className={styles.notificationFields}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={email}
              aria-labelledby="activity-email-label"
              aria-describedby="activity-email-description"
              onChange={(e) => setEmail(e.target.checked)}
            />
            <span>
              <strong id="activity-email-label">Relationship activity emails</strong>
              <small id="activity-email-description">Invitations and updates about your shared space.</small>
            </span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={inApp}
              aria-labelledby="activity-in-app-label"
              aria-describedby="activity-in-app-description"
              onChange={(e) => setInApp(e.target.checked)}
            />
            <span>
              <strong id="activity-in-app-label">In-app activity alerts</strong>
              <small id="activity-in-app-description">New alerts in your notification bell.</small>
            </span>
          </label>
          <div className={styles.notificationNote}>
            <p className={styles.hint}>
              Your shared space still updates live when alerts are off. Existing
              alerts stay saved; missed alerts are not replayed.
            </p>
            <p className={styles.hint}>
              Security, verification, and password recovery emails remain enabled.
            </p>
          </div>
          <button className={styles.primary} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save notification preferences"}
          </button>
        </fieldset>
      </form>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
