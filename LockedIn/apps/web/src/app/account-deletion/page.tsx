"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import styles from "../auth-recovery.module.scss";

const subscribe = () => () => {};
function readReceipt() {
  try {
    const value = sessionStorage.getItem("lockedin-deletion-receipt");
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch { return null; }
}

export default function AccountDeletionPage() {
  const reference = useSyncExternalStore(subscribe, readReceipt, () => null);
  return <main className={styles.page}><section className={styles.card} aria-labelledby="deletion-heading">
    <p className={styles.eyebrow}>LockedIn · Account deletion</p>
    <h1 id="deletion-heading">Photo cleanup and account deletion</h1>
    <p className={styles.description}>After you confirm deletion, LockedIn signs you out and hides your Discovery profile. It removes stored photos before deleting your account. A request that can’t finish automatically goes to manual review.</p>
    {reference ? <p className={styles.message}>Deletion started. Save this reference if you need help: <code style={{ overflowWrap: "anywhere" }}>{reference}</code>.</p> : null}
    <Link href="/" className={styles.backLink}>Back to the homepage</Link>
  </section></main>;
}
