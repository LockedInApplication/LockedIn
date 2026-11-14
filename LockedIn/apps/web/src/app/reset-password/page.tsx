"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/utils/authCLient";
import styles from "../auth-recovery.module.scss";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const invalidToken = searchParams.get("error") === "INVALID_TOKEN" || !token;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    const result = await authClient.resetPassword({ newPassword, token });

    if (result.error) {
      setError(result.error.message ?? "This reset link is invalid or expired.");
      setBusy(false);
      return;
    }

    router.push("/login?reset=1");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>LockedIn account recovery</p>
        <h1>{invalidToken ? "Reset link unavailable" : "Choose a new password"}</h1>

        {invalidToken ? (
          <>
            <p className={styles.error}>This reset link is missing, invalid, or expired.</p>
            <Link className={styles.backLink} href="/forgot-password">Request a new link</Link>
          </>
        ) : (
          <form className={styles.form} onSubmit={resetPassword}>
            <label htmlFor="password">New password</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required />
            <label htmlFor="confirmation">Confirm new password</label>
            <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save new password"}
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
          </form>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className={styles.page} />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
