import type { ReactNode } from "react"
import styles from "./styles/chromeCard.module.scss"

export type ChromeCardProps = {
    title: string
    children: ReactNode
    /** Drop bottom padding on the body so the last line isn’t followed by the default 28px gap */
    bodyTightBottom?: boolean
}

export default function ChromeCard({ title, children, bodyTightBottom }: ChromeCardProps) {
    return (
        <div
            className={`${styles.chromeCard}${bodyTightBottom ? ` ${styles.chromeCardTightBottom}` : ""}`}
        >
            <div className={styles.chromeHeader}>
                <div className={styles.chromeControls}>
                    <div className={styles.chromeDotRed} aria-hidden />
                    <div className={styles.chromeDotYellow} aria-hidden />
                    <div className={styles.chromeDotGreen} aria-hidden />
                    <div className={styles.chromeTitle}>{title}</div>
                </div>
            </div>
            <div
                className={`${styles.chromeBody}${bodyTightBottom ? ` ${styles.chromeBodyTight}` : ""}`}
            >
                {children}
            </div>
        </div>
    )
}
