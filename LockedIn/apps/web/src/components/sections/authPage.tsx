"use client";

import BrandLogo from "../brandLogo";
import Login from "../forms/Login";
import Signup from "../forms/Signup";
import { ErrorToast } from "../toast";
import styles from "../styles/authPage.module.scss";
import { useEffect, useRef, useState } from "react";

type authPageType = {
  page: "login" | "signup";
};

export default function AuthPage({ page }: authPageType) {
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

  const testimonials = [
    {
      quote:
        "Your answers begin privately. You choose what becomes part of the shared conversation.",
      author: "Reflect privately",
    },
    {
      quote:
        "Different answers are useful context—not a compatibility score or a warning.",
      author: "Reveal by choice",
    },
    {
      quote:
        "A next step becomes shared only when both people accept the same version.",
      author: "Choose together",
    },
  ];

  return (
    <div className={styles.authContainer}>
      <div className={styles.authFormContainer}>
        <div className={styles.formContent}>
          <div className={styles.logoContainer}>
            <div className={styles.logo}>
              <BrandLogo />
            </div>
            <div className={styles.logoName}>LockedIn</div>
          </div>

          <div className={styles.form}>
            <h2>{page === "login" ? "Welcome back." : "Create your space."}</h2>
            <div>
              {page === "login" ? (
                <Login onError={handleFormError} />
              ) : (
                <Signup onError={handleFormError} />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={styles.authTestimonial}>
        <div className={styles.testimonialContent}>
          <p className={styles.testimonialEyebrow}>Built around mutual choice</p>
          <h3 className={styles.testimonialTitle}>
            Two voices. One shared roadmap.
          </h3>

          <div className={styles.quoteList}>
            {testimonials.map((item) => (
              <blockquote key={item.author} className={styles.quoteCard}>
                <p className={styles.quoteText}>&ldquo;{item.quote}&rdquo;</p>
                <footer className={styles.quoteAuthor}>{item.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </div>

      <ErrorToast
        message={message}
        visible={visible}
        onDismiss={handleToastDismiss}
        className={styles.authToast}
      />
    </div>
  );
}
