import styles from "./profile.module.scss";
export const avatarChoices = [
  { id: "initials", label: "Initials", symbol: "" },
  { id: "spark", label: "Spark", symbol: "✦" },
  { id: "sun", label: "Sun", symbol: "☀" },
  { id: "moon", label: "Moon", symbol: "☾" },
  { id: "leaf", label: "Leaf", symbol: "❧" },
] as const;
export default function ProfileAvatar({
  name,
  preset,
}: {
  name?: string | null;
  preset?: string;
}) {
  const avatar = avatarChoices.find((item) => item.id === preset);
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={styles.avatar}
      data-preset={avatar?.id ?? "initials"}
      aria-hidden="true"
    >
      {avatar?.symbol || initials}
    </span>
  );
}
