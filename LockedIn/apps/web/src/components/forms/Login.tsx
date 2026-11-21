"use client";

import Link from "next/link";
import styles from "../styles/authForms.module.scss";
import { authClient } from "@/utils/authCLient";
import { ERROR_MESSAGES } from "./errorCode";
import { useRouter } from "next/navigation";
import { authEntryLink, safeMemberReturnTo, verificationPath } from "@/features/auth/member-entry";

type LoginProps = {
  onError: (message: string) => void;
  returnTo: string;
};

export default function Login({ onError, returnTo }: LoginProps) {
  const router = useRouter();
  function getErrorMessage(code?: string) {
    if (!code) {
      return "An error occurred during sign in /up. Please try again.";
    }

    return (
      ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES] ??
      "Unexpected error occurred. Please try again."
    );
  }
  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result?.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          router.push(verificationPath(returnTo));
          return;
        }

        onError(getErrorMessage(result.error.code));
        return;
      }

      router.push(safeMemberReturnTo(returnTo));
    } catch (error) {
      console.error("Error during sign in:", error);
      onError("Error during sign in");
    }
  }
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>Log in to your account to continue.</p>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="Email"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Password"
            required
          />
        </div>
        <Link href="/forgot-password" className={styles.forgotPassword}>
          Forgot password?
        </Link>
        <button type="submit">Log In</button>
        <div className={`${styles.title} ${styles.highlight}`}>
          Don&apos;t have an account?
          <Link href={authEntryLink("/signup", returnTo)} className={styles.linkText}>
            Sign up
          </Link>
        </div>
      </form>
    </div>
  );
}
