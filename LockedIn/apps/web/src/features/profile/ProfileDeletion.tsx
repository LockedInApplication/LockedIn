"use client";

import { useId, useRef, useState } from "react";
import { deleteProfileAccount, requestProfileAccountDeletion } from "./profile.client";
import type { AccountDeletionRequest } from "./profile.types";
import styles from "./profile.module.scss";

export default function ProfileDeletion({
  userId,
  onDeleted,
  pendingRequest,
}: {
  userId: string;
  onDeleted: () => void;
  pendingRequest?: AccountDeletionRequest | null;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [sentRequest, setSentRequest] = useState<AccountDeletionRequest>();
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const requesting = useRef(false);
  const requestPanelId = useId();
  const request = pendingRequest ?? sentRequest;

  async function submitRequest() {
    if (requesting.current || request) return;
    requesting.current = true;
    setRequestBusy(true);
    setRequestError("");
    try {
      setSentRequest(await requestProfileAccountDeletion(userId));
      setRequestOpen(false);
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "We couldn’t save your request. Please try again.");
    } finally {
      requesting.current = false;
      setRequestBusy(false);
    }
  }

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
            if (busy || requesting.current || !password) return;
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
          <fieldset disabled={busy || requestBusy}>
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
      <section className={styles.deletionRequest} aria-label="Assisted account deletion">
        {request ? <div role="status">
          <strong>Deletion request received</strong>
          <p>Your request is saved for review. Your account has not been deleted.</p>
          <p className={styles.hint}>Request reference: <code>{request.id}</code></p>
        </div> : <>
          <p>Can’t delete your account here? You can request a manual review.</p>
          <button type="button" className={styles.textButton} disabled={busy || requestBusy}
            aria-expanded={requestOpen} aria-controls={requestPanelId} onClick={() => {
              setRequestError("");
              setRequestOpen(!requestOpen);
            }}>Request account deletion</button>
          <div id={requestPanelId} hidden={!requestOpen}>
            <p>We’ll record this request for your signed-in account. Sending a request does not delete your account or change what others can see.</p>
            <button type="button" className={styles.primary} disabled={busy || requestBusy} onClick={() => void submitRequest()}>
              {requestBusy ? "Sending request…" : "Send deletion request"}
            </button>
            {requestError ? <p role="alert" className={styles.error}>{requestError}</p> : null}
          </div>
        </>}
      </section>
    </section>
  );
}
