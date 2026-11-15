"use client";
import { useEffect, useId, useRef, useState } from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { WorkspaceHeaderProps } from "./WorkspaceHeader";
import styles from "../workspace-header.module.scss";
export default function MobileAccountMenu({
  user,
  onProfile,
  onInvitations,
  onSignOut,
}: Pick<
  WorkspaceHeaderProps,
  "user" | "onProfile" | "onInvitations" | "onSignOut"
>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    // CSS can hide the focused trigger before the media-query event fires.
    let ownedFocus = false;
    const focused = (event: FocusEvent) => {
      ownedFocus = !!root.current?.contains(event.target as Node);
    };
    const desktop = window.matchMedia("(min-width: 701px)");
    const resized = () => {
      if (!desktop.matches) return;
      if (ownedFocus || root.current?.contains(document.activeElement)) {
        root.current?.closest("header")?.querySelector<HTMLElement>("a")?.focus();
      }
      setOpen(false);
    };
    desktop.addEventListener("change", resized);
    document.addEventListener("focusin", focused);
    return () => {
      desktop.removeEventListener("change", resized);
      document.removeEventListener("focusin", focused);
    };
  }, []);
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
  return (
    <div className={styles.mobile} ref={root}>
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
          {onProfile ? (
            <button type="button" onClick={() => select(onProfile)}>
              Profile &amp; settings
            </button>
          ) : null}
          {onInvitations ? (
            <button type="button" onClick={() => select(onInvitations)}>
              Invitations
            </button>
          ) : null}
          <button type="button" onClick={() => select(onSignOut)}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
