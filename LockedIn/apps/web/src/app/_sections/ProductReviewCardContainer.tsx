import Button from "@/components/button"
import ChromeCard from "../_components/chromeCard"
import styles from "../_components/styles/prodReviewCardContainer.module.scss"
import NetworkMap from "@/components/icons/NetworkMap"

export default function ProductReviewCardContainer() {
    return (
        <div className={styles.prodReviewContainer}>
            <div className={styles.prodReviewcards}>
                <ChromeCard title="Relationship Confirmation">
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
                        <div className={styles.confUserName}>Akwesi V.</div>
                        <div className={styles.userConfirmed}>✓ Confirmed</div>
                    </div>
                    <div className={styles.confirmUsers}>
                        <div className={styles.confUserName}>Abena L.</div>
                        <div className={styles.userConfirmed}>✓ Confirmed</div>
                    </div>
                    <Button className={styles.confirmButton}>Relationship Active</Button>
                </ChromeCard>
                <div className={styles.relationshipMapCard}>
                    <ChromeCard title="Network Map">
                        <div className={styles.relationshipMapCardContent}>
                            <NetworkMap />
                        </div>
                    </ChromeCard>
                    <ChromeCard title="Send Invite" bodyTightBottom>
                        <div className={styles.inviteCardContent}>
                            <div className={styles.inviteEmailCard}>
                                <p className={styles.inviteEmailLabel}>
                                    Partner's email or username
                                </p>
                                <div className={styles.inviteEmailInput}>
                                    [email protected]
                                </div>
                                <div className={styles.inviteEmailInput2}>
                                    Send Relationship Invite →
                                </div>
                            </div>
                            <div className={styles.invitePrivateMessage}>
                            They'll receive a private, respectful invite.
                            </div>
                        </div>
                    </ChromeCard>
                </div>
                <div className={styles.softAlertCard}>
                    <ChromeCard title="Soft Alert" bodyTightBottom>
                        <div className={styles.softAlertCardContent}>
                            <div className={styles.softAlertDate}>
                                Today · 2:14 PM
                            </div>
                            <div className={styles.softPatternDetected}>
                                <div className={styles.softAlertTop}>
                                    <span className={styles.softLightningIcon}>⚡</span>
                                    <span>Unusual pattern detected</span>
                                </div>
                                <span> We noticed an increase in connection activity with someone outside your confirmed
                                    network. This is a gentle, non-accusatory observation for your awareness.</span>
                                <div className={styles.softAlertButtons}>
                                    <Button className={styles.softAlertButton}>Review</Button>
                                    <Button className={styles.softAlertButton}>Dismiss</Button>
                                </div>

                            </div>
                            <div className={styles.softAlertPurpose}>
                                <div>
                                    What it means
                                </div>
                                <p>LockedIn never accuses. Alerts are patterns — not proof. You're always in control of how you respond.</p>
                            </div>
                            <div className={styles.softPrivacy}>
                                <span>🔒</span>
                                <span>Your data stays private. Always.</span>
                            </div>

                        </div>
                    </ChromeCard>
                </div>
            </div>
        </div>
    )
}