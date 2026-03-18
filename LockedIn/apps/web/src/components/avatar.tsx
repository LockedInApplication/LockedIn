import styles from "./styles/avatar.module.scss"
type AvatarProps = {
    name: string;
    src?: string;
}

const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);      
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts[1]?.charAt(0) ?? "";
    return `${first}${last}`.toUpperCase();
  };

export default function Avatar({ name, src }: AvatarProps) {
    const initials = getInitials(name)

    return (
        <div className={styles.avatar}>
            {src ? (
                <img src={src} alt={name} className={styles.avatar_img}></img>
            ) : (
                <span className={styles.avatar_initials}>
                    {initials}
                </span>
            )}
        </div>
    )
}