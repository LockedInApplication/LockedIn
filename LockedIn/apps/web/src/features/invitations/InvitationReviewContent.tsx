import type { InvitationReviewData,InvitationDecision } from "./invitation-review.types";
import reviewStyles from "./invitation-review.module.scss";
export type InvitationReviewContentProps = {
    data: InvitationReviewData | null;
    loading: boolean;
    busy: boolean;
    error: string | null;
    onDecision: (decision: InvitationDecision) => void;
    onClose: () => void;
    onRetry: () => void;
};
export default function InvitationReviewContent({ data, loading, busy, error, onDecision, onClose, onRetry }: InvitationReviewContentProps) {
    const statusMessage = data?.status === "EXPIRED" ? "This invitation has expired. Ask for a new link if you would like to connect." : data?.status === "ACCEPTED" ? "This invitation has already been accepted." : data?.status === "DECLINED" ? "This invitation was declined. No shared space was created from it." : "This invitation is no longer available.";
    return <section className={reviewStyles.card} aria-labelledby="invitation-review-title" tabIndex={-1} id="invitation-review">
    <div className={reviewStyles.seal} aria-hidden>✉</div>
    <span className={reviewStyles.kicker}>AN INVITATION · YOUR CHOICE</span>
    <h2 id="invitation-review-title">A shared space starts with your yes.</h2>
    {loading ? <p role="status">Checking your invitation…</p> : null}
    {error ? <div role="alert" className={reviewStyles.message}><p>{error}</p><button type="button" onClick={onRetry} disabled={busy}>Try again</button></div> : null}
    {data && !loading ? <>
      <p><strong>{data.inviterName}</strong> invited you to build a private shared space.</p>
      {data.status === "PENDING" ? <>
        <p className={reviewStyles.privacy}>Opening this invitation has not connected you. Accepting does not reveal any answers or approve future suggestions.</p>
        {data.expiresAt ? <p className={reviewStyles.expiry}>Available until {new Date(data.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p> : null}
        {data.blockedReason ? <p className={reviewStyles.message}>{data.blockedReason}</p> : null}
        <p className={reviewStyles.expiry}>The sender can see “Invitation not accepted” if you decline. New invitations from them pause for 7 days.</p>
        <div className={reviewStyles.actions}>
          <button type="button" className={reviewStyles.accept} disabled={busy || !data.canRespond} onClick={() => onDecision("accept")}>{busy ? "Saving…" : "Accept invitation"}</button>
          <button type="button" className={reviewStyles.decline} disabled={busy} onClick={() => onDecision("decline")}>Decline</button>
        </div>
      </> : <p role="status" className={reviewStyles.message}>{statusMessage}</p>}
      {data.canBlock?<details className={reviewStyles.boundaries}><summary>More privacy options</summary>
        <p className={reviewStyles.expiry}>Block further invitations until you choose to unblock. They won’t be told you blocked them. This does not end any existing shared space.</p>
        <button type="button" className={reviewStyles.block} disabled={busy} onClick={()=>onDecision("block")}>Block invitation sender</button>
      </details>:null}
    </> : null}
    <button type="button" className={reviewStyles.close} disabled={busy} onClick={onClose}>Back to my space</button>
  </section>;
}
