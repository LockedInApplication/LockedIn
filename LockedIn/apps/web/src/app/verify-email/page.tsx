"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/utils/authCLient";

const ERROR_COPY: Record<string, string> = {
  invalid_token: "This verification link is invalid or expired.",
  INVALID_TOKEN: "This verification link is invalid or expired.",
};

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorCode = searchParams.get("error") ?? "";
  const initialEmail = searchParams.get("email") ?? "";
  const pending = searchParams.get("pending") === "1";

  const [email, setEmail] = useState(initialEmail);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const errorMessage = useMemo(() => {
    if (!errorCode) return "";
    return (
      ERROR_COPY[errorCode] ?? "Verification failed. Please request a new link."
    );
  }, [errorCode]);

  useEffect(() => {
    if (!errorCode && !pending) {
      const timer = setTimeout(() => {
        router.push("/login?verified=1");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [errorCode, pending, router]);

  async function resendVerification() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setStatusMessage("Enter your email to resend verification.");
      return;
    }

    setIsSending(true);
    setStatusMessage("");

    const { error } = await authClient.sendVerificationEmail({
      email: trimmedEmail,
      callbackURL: `${window.location.origin}/login?verified=1`,
    });

    if (error) {
      setStatusMessage(
        "Could not send a new verification email. Please try again.",
      );
      setIsSending(false);
      return;
    }

    setStatusMessage("Verification email sent. Check your inbox.");
    setIsSending(false);
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section style={{ width: "100%", maxWidth: 460 }}>
        <h1>Verify your email</h1>

        {pending ? (
          <>
            <p>Check your inbox for your verification link.</p>
            <p style={{ color: "#666", marginTop: 8 }}>
              You will be able to log in after confirming your email.
            </p>
          </>
        ) : !errorCode ? (
          <>
            <p>✓ Your email has been verified!</p>
            <p style={{ color: "#666", marginTop: 8 }}>
              Redirecting you to login...
            </p>
          </>
        ) : (
          <>
            <p>{errorMessage}</p>

            {statusMessage ? (
              <p style={{ marginTop: 10 }}>{statusMessage}</p>
            ) : null}

            <label htmlFor="email" style={{ display: "block", marginTop: 14 }}>
              Resend verification email:
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%", marginTop: 8, padding: 8 }}
            />

            <button
              type="button"
              onClick={resendVerification}
              disabled={isSending}
              style={{ padding: "8px 12px", marginTop: 12 }}
            >
              {isSending ? "Sending..." : "Resend verification email"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100dvh" }} />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
