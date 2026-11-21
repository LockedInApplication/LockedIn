"use client";

import Link from "next/link";
import BrandLogo from "../brandLogo";
import Login from "../forms/Login";
import Signup from "../forms/Signup";
import { ErrorToast } from "../toast";
import styles from "../styles/authPage.module.scss";
import { useEffect, useRef, useState } from "react";

type authPageType = {
  page: "login" | "signup";
  returnTo: string;
};

export default function AuthPage({ page, returnTo }: authPageType) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const clearMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  function hideToast() {
    setVisible(false);
  }

  function handleFormError(errorMessage: string) {
    setMessage(errorMessage);
    setVisible(true);

    if (clearMessageTimeoutRef.current) {
      clearTimeout(clearMessageTimeoutRef.current);
    }

    clearMessageTimeoutRef.current = setTimeout(() => {
      hideToast();
    }, 3500);
  }

  function handleToastDismiss() {
    if (clearMessageTimeoutRef.current) {
      clearTimeout(clearMessageTimeoutRef.current);
    }

    hideToast();
  }

  useEffect(() => {
    return () => {
      if (clearMessageTimeoutRef.current) {
        clearTimeout(clearMessageTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.authContainer}>
      <main className={styles.authFormContainer}>
        <div className={styles.formContent}>
          <Link href="/" className={styles.logoContainer} aria-label="LockedIn home">
            <div className={styles.logo}>
              <BrandLogo />
            </div>
            <div className={styles.logoName}>LockedIn</div>
          </Link>

          <div className={styles.form}>
            <h1>{page === "login" ? "Welcome back." : "Create your space."}</h1>
            <div>
              {page === "login" ? (
                <Login onError={handleFormError} returnTo={returnTo} />
              ) : (
                <Signup onError={handleFormError} returnTo={returnTo} />
              )}
            </div>
          </div>
        </div>
      </main>
      <aside className={styles.editorial}>
        <p>You decide what to share and when.</p>
      </aside>

      <ErrorToast
        message={message}
        visible={visible}
        onDismiss={handleToastDismiss}
        className={styles.authToast}
      />
    </div>
  );
}
