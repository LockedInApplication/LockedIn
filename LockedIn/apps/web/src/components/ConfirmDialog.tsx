"use client";
import { useEffect, useId, useRef } from "react";
import styles from "./styles/confirmDialog.module.scss";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  variant?: "together";
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};
export default function ConfirmDialog({
  open,
  title,
  description,
  variant,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null),
    safeAction = useRef<HTMLButtonElement>(null),
    leaveAction = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    element.showModal();
    safeAction.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      className={styles.dialog}
      data-variant={variant}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && document.activeElement === safeAction.current) {
          event.preventDefault();
          leaveAction.current?.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === leaveAction.current
        ) {
          event.preventDefault();
          safeAction.current?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {variant !== "together" ? <>
        <span className={styles.mark} aria-hidden="true">↶</span>
        <p className={styles.eyebrow}>YOUR SPACE · YOUR CHOICE</p>
      </> : null}
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`} className={styles.description}>
        {description}
      </p>
      <div className={styles.actions}>
        <button
          ref={safeAction}
          type="button"
          className={styles.keep}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          ref={leaveAction}
          type="button"
          className={styles.leave}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
