
import styles from "../styles/baseToast.module.scss";

type BaseToastProps = {
  message: string;
  type: "error" | "warning" | "success";
  className?: string;
  visible?: boolean;
  onDismiss?: () => void;
};

export default function BaseToast({
  message,
  type,
  className,
  visible = false,
  onDismiss,
}: BaseToastProps) {
  const stateClass = visible ? styles.visible : styles.hidden;
  const combinedClassName = `${styles.toast} ${stateClass} ${className ?? ""}`.trim();

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-type={type}
      className={combinedClassName}
    >
      <p>{message}</p>
      {onDismiss ? (
        <button type="button" className={styles.dismissButton} onClick={onDismiss}>
          Close
        </button>
      ) : null}
    </div>
  );
}
