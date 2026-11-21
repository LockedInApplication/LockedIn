"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { WorkspaceHeaderProps } from "./WorkspaceHeader";
import styles from "../workspace-header.module.scss";
export default function MobileAccountMenu({
  user,
  onNavigate,
  onSignOut,
}: Pick<
  WorkspaceHeaderProps,
  "user" | "onNavigate" | "onSignOut"
>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const select = (action: () => unknown) => {
    setOpen(false);
    trigger.current?.focus();
    void action();
  };
  const profileHref = "/profile";
  return (
    <div className={styles.account} ref={root}>
      <button
        type="button"
        ref={trigger}
        className={styles.avatarButton}
        aria-label="Account options"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <ProfileAvatar name={user?.name ?? "You"} preset={user?.avatarPreset} />
        <span aria-hidden className={styles.chevron}>
          ⌄
        </span>
      </button>
      {open ? (
        <div
          id={id}
          className={styles.panel}
          role="group"
          aria-label="Account options"
        >
          <p>{user?.name ?? "Your account"}</p>
          <Link href={profileHref} onNavigate={(event) => {
            event.preventDefault();
            select(() => onNavigate(profileHref));
          }}>
            Profile &amp; settings
          </Link>
          <button type="button" onClick={() => select(onSignOut)}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
