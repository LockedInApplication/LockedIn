"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/utils/authCLient";
import styles from "../auth-recovery.module.scss";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    setBusy(true);
    setMessage("");
    setError("");

    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (result.error) {
      setError(result.error.message ?? "We could not send the reset email. Please try again.");
    } else {
      setMessage("If an account exists for that email, a password-reset link is on its way.");
    }

    setBusy(false);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>LockedIn account recovery</p>
        <h1>Reset your password</h1>
        <p className={styles.description}>
          Enter the email you originally used. We will send a secure one-time reset link.
        </p>

        <form className={styles.form} onSubmit={requestReset}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <button type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {message ? <p className={styles.message}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <Link className={styles.backLink} href="/login">Back to login</Link>
      </section>
    </main>
  );
}
