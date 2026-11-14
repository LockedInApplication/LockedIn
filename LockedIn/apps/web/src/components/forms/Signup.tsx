"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../styles/authForms.module.scss";
import { authClient } from "@/utils/authCLient";
import { ERROR_MESSAGES } from "./errorCode";

type SignupProps = {
  onError: (message: string) => void;
};

export default function Signup({ onError }: SignupProps) {
  const router = useRouter();
  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validatePassword = (password: string) => {
    return password.trim().length >= 6;
  };

  const validateName = (name: string) => {
    return name.trim().length >= 2;
  };
  async function handleSignUp(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;

    if (!validatePassword(password)) {
      onError("Password is Invalid");
      return;
    }

    if (!validateName(name)) {
      onError("Name is Invalid");
      return;
    }

    if (!validateEmail(email)) {
      onError("Email is Invalid");
      return;
    }

    try {
      const result = await authClient.signUp.email({
        email: email,
        password: password,
        name: name,
        callbackURL: `${window.location.origin}/verify-email`,
      });

      if (result.error) {
        const message =
          ERROR_MESSAGES[result.error.code as keyof typeof ERROR_MESSAGES] ??
          result.error.message ??
          "We could not create your account. Please try again.";
        onError(message);
        return;
      }

      const session = await authClient.getSession();
      if (session.data) {
        router.push("/journey");
        return;
      }

      router.push(`/verify-email?pending=1&email=${encodeURIComponent(email)}`);
    } catch (error) {
      console.error("Error during sign up:", error);
      onError("An error occurred during sign up. Please try again.");
    }
  }
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>
        Start relationships built on honesty, clarity, and shared understanding.
      </p>
      <form onSubmit={handleSignUp}>
        <div className={styles.formGroup}>
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="Name"
            required
          />
        </div>
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
        <button type="submit">Sign Up</button>
        <div className={`${styles.title} ${styles.highlight}`}>
          Already have an account?
          <Link href="/login" className={styles.linkText}>
            Log in
          </Link>
        </div>
      </form>
    </div>
  );
}
