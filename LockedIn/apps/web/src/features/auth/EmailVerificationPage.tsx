"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/utils/authCLient";
import { checkEmailVerification, requestEmailVerification } from "./email-verification";
import { authEntryLink, safeMemberReturnTo } from "./member-entry";
import styles from "./email-verification.module.scss";

export default function EmailVerificationPage() {
  const session = authClient.useSession();
  const query = useSearchParams();
  const errorCode = query.get("error");
  if (session.isPending) return <main className={styles.page}><p role="status">Loading your account…</p></main>;
  const user = session.data?.user;
  const signupReceipt = !user && !errorCode && query.get("from") === "signup" && query.get("pending") === "1";
  return <VerificationForm key={user ? `${user.id}:${user.email}` : "signed-out"} ownerId={user?.id ?? null} accountEmail={user?.email ?? ""} returnTo={safeMemberReturnTo(query.get("returnTo"))} signupReceipt={signupReceipt} linkError={errorCode ? "This verification link is invalid or expired. Request a new link below." : ""} />;
}

function VerificationForm({ ownerId, accountEmail, linkError, returnTo, signupReceipt }: { ownerId: string | null; accountEmail: string; linkError: string; returnTo: string; signupReceipt: boolean }) {
  const [email, setEmail] = useState(accountEmail), [verified, setVerified] = useState(false);
  const [operation, setOperation] = useState<"send" | "check" | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const mounted = useRef(false), running = useRef(false), generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const current = ++generation.current;
    if (ownerId) void checkEmailVerification(ownerId).then(account => {
      if (mounted.current && current === generation.current) setVerified(account?.emailVerified === true);
    }).catch(() => {
      if (mounted.current && current === generation.current) setError("Could not check verification. Please try again.");
    });
    return () => { mounted.current = false; };
  }, [ownerId]);

  async function run(kind: "send" | "check") {
    if (running.current) return;
    running.current = true;
    const current = ++generation.current;
    setOperation(kind); setError(""); setMessage("");
    const active = () => mounted.current && current === generation.current;
    try {
      if (kind === "send") {
        const result = await requestEmailVerification(ownerId, email, window.location.origin, returnTo);
        if (!active()) return;
        setVerified(result === "verified");
        if (result === "requested") setMessage("Verification email requested. Check your inbox and spam folder. Sending a request does not verify your email.");
      } else {
        const account = await checkEmailVerification(ownerId);
        if (!active()) return;
        setVerified(account?.emailVerified === true);
        if (!account?.emailVerified) setMessage("Your email is not verified yet. Follow the link in your email, then check again.");
      }
    } catch (failure) {
      if (active()) setError(failure instanceof Error ? failure.message : "Unable to complete this request. Please try again.");
    } finally {
      if (active()) { running.current = false; setOperation(null); }
    }
  }

  return <main className={styles.page}><section className={styles.card} aria-labelledby="verify-heading">
    <header className={styles.intro}>
      <p className={styles.brand}>LockedIn · Account security</p>
      <h1 id="verify-heading">{verified ? "Your email is verified." : signupReceipt ? "Check your inbox." : "Verify your email"}</h1>
      {!verified ? <p>{signupReceipt
        ? "New to LockedIn? Look for a link to verify your email. If you’ve signed up before, look for a note on how to get back in."
        : "Follow the link in your email before using LockedIn."}</p> : null}
    </header>
    {verified ? <a className={styles.primary} href={returnTo}>Continue to LockedIn</a> : <>
      {linkError ? <p role="alert" className={styles.error}>{linkError}</p> : null}
      {signupReceipt ? <div className={styles.returningActions}>
        <a href={authEntryLink("/login", returnTo)}>Log in</a>
        <a href="/forgot-password">Reset your password</a>
      </div> : null}
      <form className={styles.resend} onSubmit={event => { event.preventDefault(); void run("send"); }}>
        <div className={styles.field}>
          <label htmlFor="verification-email">Email address</label>
          <input id="verification-email" type="email" autoComplete="email" required value={email} readOnly={!!ownerId} disabled={operation !== null} onChange={event => setEmail(event.target.value)} />
        </div>
        <button className={styles.primary} type="submit" disabled={operation !== null}>{operation === "send" ? "Sending…" : "Resend verification email"}</button>
      </form>
      <p className={styles.hint}>{signupReceipt
        ? "No email yet? Check your spam folder. Verification links expire after one hour."
        : "The link expires after one hour. You can open it in another tab, then return here to check again."}</p>
      {!signupReceipt ? <div className={styles.checkAgain}>
        {ownerId
          ? <button type="button" disabled={operation !== null} onClick={() => void run("check")}>{operation === "check" ? "Checking…" : "I've verified my email — check again"}</button>
          : <><p>Already followed the link?</p><a href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in to check verification</a></>}
      </div> : null}
    </>}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {!signupReceipt ? <footer className={styles.accountActions}>
      {ownerId ? <button type="button" onClick={async () => { const result = await authClient.signOut(); if (!result.error) window.location.assign("/login"); else setError("Could not sign out. Please try again."); }}>Sign out</button> : <a href="/login">Back to login</a>}
    </footer> : null}
  </section></main>;
}
