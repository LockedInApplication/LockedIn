"use client";

import { useState } from "react";
import { deleteProfileAccount } from "./profile.client";
import styles from "./profile.module.scss";

export default function ProfileDeletion({
  userId,
  onDeleted,
}: {
  userId: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <section className={styles.card} aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading">Delete account</h2>
      <p>
        This permanently deletes your LockedIn account and signs you out on all devices.
        Your shared space will close, and some shared content may be removed.
        You can’t undo this.
      </p>
      {!open ? (
        <button type="button" className={styles.textButton} onClick={() => setOpen(true)}>
          Delete account
        </button>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !password) return;
            setBusy(true);
            setError("");
            try {
              await deleteProfileAccount(password, userId);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Unable to delete your account.");
              setPassword("");
              setBusy(false);
              return;
            }
            setPassword("");
            onDeleted();
          }}
        >
          <fieldset disabled={busy}>
            <label className={styles.field}>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                required
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className={styles.deletionActions}>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setOpen(false);
                  setPassword("");
                  setError("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className={styles.danger} disabled={!password || busy}>
                {busy ? "Deleting account…" : "Permanently delete account"}
              </button>
            </div>
          </fieldset>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </form>
      )}
    </section>
  );
}
