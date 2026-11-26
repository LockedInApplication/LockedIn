"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../styles/authForms.module.scss";
import { authClient } from "@/utils/authCLient";
import { ERROR_MESSAGES } from "./errorCode";
import { SIGNUP_PASSWORD_HINT, validateSignupFields } from "./signup-fields";
import { authEntryLink, safeMemberReturnTo, signupReceiptPath, verificationPath } from "@/features/auth/member-entry";
import { takeSignupEmail } from "@/features/auth/signup-email";

type SignupProps = {
  onError: (message: string) => void;
  returnTo?: string;
};

type FieldError = Extract<ReturnType<typeof validateSignupFields>, { ok: false }>;

export default function Signup({ onError, returnTo = "/journey" }: SignupProps) {
  const router = useRouter();
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const email = takeSignupEmail();
    if (email && emailInput.current && !emailInput.current.value) emailInput.current.value = email;
  }, []);
  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  async function handleSignUp(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fields = validateSignupFields({
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      password,
      confirmPassword: formData.get("confirmPassword") as string,
    });
    if (!fields.ok) {
      setFieldError(fields);
      const input = form.elements.namedItem(fields.field);
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    setFieldError(null);

    if (!validateEmail(email)) {
      onError("Email is Invalid");
      return;
    }

    try {
      const destination = safeMemberReturnTo(returnTo);
      const verification = destination === "/journey" ? "/verify-email" : verificationPath(destination);
      const result = await authClient.signUp.email({
        email: email,
        password: password,
        name: fields.name,
        callbackURL: new URL(verification, window.location.origin).href,
      });

      if (result.error) {
        const message =
          ERROR_MESSAGES[result.error.code as keyof typeof ERROR_MESSAGES] ??
          result.error.message ??
          "We could not create your account. Please try again.";
        onError(message);
        return;
      }

      router.push(signupReceiptPath(destination));
    } catch (error) {
      console.error("Error during sign up:", error);
      onError("An error occurred during sign up. Please try again.");
    }
  }

  function errorProps(field: FieldError["field"], hintId?: string) {
    const invalid = fieldError?.field === field;
    return {
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${field}-error` : hintId,
    };
  }

  function renderFieldError(field: FieldError["field"]) {
    if (fieldError?.field !== field) return null;
    return (
      <p id={`${field}-error`} role="alert" className={styles.fieldError}>
        {fieldError.message}
      </p>
    );
  }

  function handleFieldChange(event: React.FormEvent<HTMLFormElement>) {
    if (!fieldError || !(event.target instanceof HTMLInputElement)) return;
    const field = event.target.name;
    if (field === fieldError.field || (field === "password" && fieldError.field === "confirmPassword")) {
      setFieldError(null);
    }
  }

  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>
        Start relationships built on honesty, clarity, and shared understanding.
      </p>
      <form method="post" onSubmit={handleSignUp} onChange={handleFieldChange}>
        <div className={styles.formGroup}>
          <label htmlFor="firstName">First name</label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            {...errorProps("firstName")}
            required
          />
          {renderFieldError("firstName")}
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="lastName">Last name</label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            {...errorProps("lastName")}
            required
          />
          {renderFieldError("lastName")}
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            ref={emailInput}
            type="email"
            id="email"
            name="email"
            autoComplete="email"
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
            autoComplete="new-password"
            {...errorProps("password", "signup-password-hint")}
            required
          />
          {renderFieldError("password") ?? (
            <p id="signup-password-hint" className={styles.fieldHint}>{SIGNUP_PASSWORD_HINT}</p>
          )}
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            {...errorProps("confirmPassword")}
            required
          />
          {renderFieldError("confirmPassword")}
        </div>
        <button type="submit">Sign Up</button>
        <div className={`${styles.title} ${styles.highlight}`}>
          Already have an account?
          <Link href={authEntryLink("/login", returnTo)} className={styles.linkText}>
            Log in
          </Link>
        </div>
      </form>
    </div>
  );
}
