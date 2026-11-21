import { useId } from "react";
import styles from "./profile.module.scss";

export default function ProfileSettingRow({ title, description, onOpen }: {
  title: string;
  description: string;
  onOpen: () => void;
}) {
  const id = useId();
  return (
    <li>
      <button type="button" className={styles.settingRow} onClick={onOpen}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <span className={styles.settingCopy}>
          <span className={styles.settingTitle} id={`${id}-title`}>{title}</span>
          <span className={styles.settingDescription} id={`${id}-description`}>{description}</span>
        </span>
        <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="20" height="20">
          <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    </li>
  );
}
