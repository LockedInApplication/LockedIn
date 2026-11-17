"use client";

import styles from "@/app/journey/journey.module.scss";
import choiceStyles from "./connection-stage.module.scss";
import { useEffect, useRef, useState } from "react";
import type { JourneyOverview } from "@/features/journey/journey.types";
import { initials } from "@/features/journey/journey.utils";

export default function ConnectionStage({
  pendingInvites,
  inviteLink,
  busy,
  onInvite,
  onReview,
  onExplore,
}: {
  pendingInvites: JourneyOverview["pendingInvites"];
  inviteLink: string;
  busy: boolean;
  onInvite: (email: string) => Promise<void>;
  onReview: (id: string) => void;
  onExplore?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [inviteSelected, setInviteSelected] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const showChoice = !!onExplore && !pendingInvites.length && !inviteSelected && !inviteLink && !email;
  useEffect(() => { if (inviteSelected) emailInput.current?.focus(); }, [inviteSelected]);

  return (
    <section className={styles.stageGrid}>
      <article className={styles.primaryCard}>
        <span className={styles.cardNumber}>01</span>
        <span className={styles.eyebrow}>CONNECT BY CHOICE</span>
        <h2>{showChoice ? "How would you like to start?" : "Create a private space for two."}</h2>
        {showChoice ? <>
          <p>Already have someone you’d like to start the journey with? Send them a private invitation. If not, you can explore and meet someone new.</p>
          <div className={choiceStyles.actions}>
            <button type="button" disabled={busy} onClick={() => setInviteSelected(true)}>Invite someone I know</button>
            <button type="button" disabled={busy} onClick={onExplore}>Explore Discovery</button>
          </div>
          <p>Exploring is optional. Your profile stays private until you choose to publish it.</p>
        </> : <><p>
          Invite the person you want to build with. Nothing is shared until they
          independently accept and decide what they want to reveal.
        </p>
        <form
          className={styles.inviteForm}
          onSubmit={(event) => {
            event.preventDefault();
            onInvite(email);
          }}
        >
          <label htmlFor="partner-email">Partner&apos;s email</label>
          <div>
            <input
              id="partner-email"
              ref={emailInput}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="partner@example.com"
              required
            />
            <button disabled={busy}>{busy ? "Creating..." : "Create private invite"}</button>
          </div>
        </form>
        {inviteSelected && onExplore && !pendingInvites.length && !inviteLink && (
          <div className={choiceStyles.actions}><button className={choiceStyles.secondary} type="button" disabled={busy} onClick={onExplore}>Explore Discovery instead</button></div>
        )}
        </>}
        {inviteLink ? (
          <div className={styles.inviteLink}>
            <span>Private invitation link</span>
            <code>{inviteLink}</code>
            <button onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copy link</button>
          </div>
        ) : null}
      </article>

      <aside className={styles.sideCard}>
        <span className={styles.eyebrow}>INVITATIONS FOR YOU</span>
        {pendingInvites.length ? (
          pendingInvites.map((invite) => (
            <div className={styles.pendingInvite} key={invite.id}>
              <span className={styles.avatar}>{initials(invite.inviter.name)}</span>
              <div>
                <strong>{invite.inviter.name}</strong>
                <p>invited you to build a shared roadmap.</p>
              </div>
              <button type="button" disabled={busy} onClick={() => onReview(invite.id)}>Review invitation</button>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <span>✦</span>
            <p>No pending invitations yet.</p>
          </div>
        )}
      </aside>
    </section>
  );
}
