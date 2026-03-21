import Button from "@/components/button"
import styles from "./styles/prodReviewCardContainer.module.scss"

export default function prodReviewCardContainer() {
    return (
        <div className={styles.prodReviewContainer}>
            <div className={styles.prodReviewcards}>
                <div className={styles.relationConfirmationCard}>
                    <div className={styles.prodCardHeader}>
                        <div className={styles.relControlCards}>
                            <div className={styles.mockDotX}></div>
                            <div className={styles.mockDotY}></div>
                            <div className={styles.mockDotZ}></div>
                            <div className={styles.relationTitle}>Relationship Confirmation</div>
                        </div>
                    </div>
                    <div className={styles.confirmationScreen}>
                        <div className={styles.confirmAvatars}>
                            <div className={styles.confirmAvatar}>👤</div>
                            <div className={styles.confirmLinkIcon}>🔗</div>
                            <div className={styles.confirmAvatar}>👤</div>
                        </div>
                        <div className={styles.confirmHeader}>
                            Akwasi & Abena
                        </div>
                        <div className={styles.confirmSub}>
                            Mutually confirmed relationship
                        </div>
                        <div className={styles.confirmBadge}>
                            ✓ Both parties confirmed
                        </div>
                        <div className={styles.confirmUsers}>
                            <div className={styles.confUserName}>Alex M.</div>
                            <div className={styles.userConfirmed}>✓ Confirmed</div>
                        </div>
                        <div className={styles.confirmUsers}>
                            <div className={styles.confUserName}>Alex M.</div>
                            <div className={styles.userConfirmed}>✓ Confirmed</div>
                        </div>
                        <Button className={styles.confirmButton}>Relationship Active</Button>
                    </div>
                </div>
                <div className={styles.relationshipMapCard}>

                </div>
                <div className={styles.softAlertCard}>
                    Are you
                </div>
            </div>
        </div>
    )
}