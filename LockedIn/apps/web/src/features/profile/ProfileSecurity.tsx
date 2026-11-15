"use client";
import { useEffect, useState } from "react";
import type { Profile } from "./profile.types";
import { changeProfilePassword } from "./profile.security";
import styles from "./profile.module.scss";
export default function ProfileSecurity({
  profile,
  onDirty,
  onLeave,
}: {
  profile: Profile;
  onDirty: (dirty: boolean) => void;
  onLeave: (path: string) => void;
}) {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirmPassword, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty = Boolean(currentPassword || newPassword || confirmPassword);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return (
    <section className={styles.card} aria-labelledby="profile-security">
      <h2 id="profile-security">Account security</h2>
      <p className={styles.email}>{profile.email}</p>
      <p className={styles.hint}>
        {profile.emailVerified ? "Email verified" : "Email not verified"}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await changeProfilePassword({
              currentPassword,
              newPassword,
              confirmPassword,
              userId: profile.id,
            });
            setCurrent("");
            setNew("");
            setConfirm("");
            setMessage(
              "Password changed. Your other sessions have been signed out.",
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to change password.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className={styles.field}>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              required
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <p className={styles.hint}>
            Use 8–128 characters. Changing your password signs out your other
            sessions.
          </p>
          <button className={styles.primary} disabled={!dirty || busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </fieldset>
      </form>
      <button
        type="button"
        className={styles.textButton}
        onClick={() => onLeave("/forgot-password")}
      >
        Forgot your password?
      </button>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
