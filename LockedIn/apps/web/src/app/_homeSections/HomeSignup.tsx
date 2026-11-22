"use client";

import { useRef } from "react";
import { storeSignupEmail } from "@/features/auth/signup-email";
import styles from "../page.module.scss";

export default function HomeSignup() {
  const input = useRef<HTMLInputElement>(null);

  function continueToSignup() {
    if (input.current?.value) storeSignupEmail(input.current.value);
  }

  return <form className={styles.joinForm} action="/signup" onSubmit={continueToSignup}>
    <label className={styles.srOnly} htmlFor="home-signup-email">Email address</label>
    <input ref={input} id="home-signup-email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required />
    <button type="submit" className={styles.lightButton}>Continue to sign up</button>
  </form>;
}
