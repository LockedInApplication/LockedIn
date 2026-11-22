"use client";
import { useState, type FormEvent } from "react";
import { useDiscovery } from "@/features/discovery/DiscoveryShell";
import { journeyRequest } from "@/lib/journey";
import styles from "@/features/discovery/discovery.module.scss";

export default function DirectInvite({ chatFirst = false }: { chatFirst?: boolean }) {
  const { setDirty, busy, setBusy } = useDiscovery();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { token } = await journeyRequest<{ token: string }>("/api/journey/invites", {
        method: "POST", body: JSON.stringify({ email: email.trim() }),
      });
      const url = new URL("/journey", window.location.origin);
      url.searchParams.set("invite", token);
      setLink(url.href);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The invitation couldn’t be sent.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopyNotice("Link copied.");
    } catch {
      setCopyNotice("Copy the link from the field above.");
    }
  };
  return link ? <section className={styles.card}>
    <h2>Invitation ready</h2>
    <p>You can also share this private link directly with the person you invited.</p>
    <label>Private invitation link<input className={styles.field} value={link} readOnly onFocus={event => event.currentTarget.select()}/></label>
    <div className={styles.actions}><button type="button" onClick={() => void copy()}>Copy link</button></div>
    {copyNotice ? <p role="status">{copyNotice}</p> : null}
  </section> : <form className={`${styles.card} ${styles.form}`} onSubmit={event => void submit(event)}>
    <p>{chatFirst ? "Send a private invite to chat. Accepting won’t lock either of you in." : "Send a private invitation. If they accept, you can chat in Inbox and use your shared space in Together."}</p>
    <label>Their email<input className={styles.field} type="email" autoComplete="off" value={email} required disabled={busy}
      onChange={event => { setEmail(event.target.value); setDirty(event.target.value.length > 0); }}/></label>
    <button className={styles.primary} disabled={busy || !email.trim()} type="submit">{busy ? "Sending…" : "Send private invite"}</button>
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
