"use client"

import Button from "@/components/button"
import ChromeCard from "../_components/chromeCard"
import styles from "../_components/styles/prodReviewCardContainer.module.scss"
import { useScrollReveal } from "@/hooks/useScrollReveal"

export default function ProductReviewCardContainer() {
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

    return (
        <div className={styles.prodReviewContainer}>
            <div ref={ref} className={`${styles.prodReviewcards} ${isVisible ? styles.isVisible : ""}`}>
                <ChromeCard title="My Intentions">
                    <div className={styles.confirmAvatars}>
                        <div className={styles.confirmAvatar}>A</div>
                        <div className={styles.confirmLinkIcon}>↔</div>
                        <div className={styles.confirmAvatar}>B</div>
                    </div>
                    <div className={styles.confirmHeader}>
                        Our next 12 months
                    </div>
                    <div className={styles.confirmSub}>
                        Your answers begin privately
                    </div>
                    <div className={styles.confirmBadge}>
                        Private · only you can see this draft
                    </div>
                    <div className={styles.confirmUsers}>
                        <div className={styles.confUserName}>Long-term future</div>
                        <div className={styles.userConfirmed}>Ready</div>
                    </div>
                    <div className={styles.confirmUsers}>
                        <div className={styles.confUserName}>Timing and priorities</div>
                        <div className={styles.userConfirmed}>Private</div>
                    </div>
                    <Button className={styles.confirmButton}>Choose what to reveal</Button>
                </ChromeCard>
                <div className={styles.relationshipMapCard}>
                    <ChromeCard title="Shared Ground">
                        <div className={styles.relationshipMapCardContent}>
                            <div className={styles.confirmUsers}>
                                <div className={styles.confUserName}>Build something long-term</div>
                                <div className={styles.userConfirmed}>Shared</div>
                            </div>
                            <div className={styles.confirmUsers}>
                                <div className={styles.confUserName}>When to revisit the future</div>
                                <div className={styles.userConfirmed}>Discuss</div>
                            </div>
                        </div>
                    </ChromeCard>
                    <ChromeCard title="Reveal by Choice" bodyTightBottom>
                        <div className={styles.inviteCardContent}>
                            <div className={styles.inviteEmailCard}>
                                <p className={styles.inviteEmailLabel}>
                                    Selected for comparison
                                </p>
                                <div className={styles.inviteEmailInput}>
                                    3 of 4 answers
                                </div>
                                <div className={styles.inviteEmailInput2}>
                                    Both people consented ✓
                                </div>
                            </div>
                            <div className={styles.invitePrivateMessage}>
                            Unselected answers remain private.
                            </div>
                        </div>
                    </ChromeCard>
                </div>
                <div className={styles.softAlertCard}>
                    <ChromeCard title="Our Next Step" bodyTightBottom>
                        <div className={styles.softAlertCardContent}>
                            <div className={styles.softAlertDate}>
                                Mutually chosen · Today
                            </div>
                            <div className={styles.softPatternDetected}>
                                <div className={styles.softAlertTop}>
                                    <span className={styles.softLightningIcon}>✓</span>
                                    <span>Compare our priorities over coffee</span>
                                </div>
                                <span> Each person will bring two priorities for the next year. We will choose one topic to revisit together.</span>
                                <div className={styles.softAlertButtons}>
                                    <Button className={styles.softAlertButton}>Reflect later</Button>
                                    <Button className={styles.softAlertButton}>Pause</Button>
                                </div>

                            </div>
                            <div className={styles.softAlertPurpose}>
                                <div>
                                    Progress without pressure
                                </div>
                                <p>Completing, changing, or pausing a next step can all be intentional choices.</p>
                            </div>
                            <div className={styles.softPrivacy}>
                                <span>◇</span>
                                <span>No compatibility score. No forced timeline.</span>
                            </div>

                        </div>
                    </ChromeCard>
                </div>
            </div>
        </div>
    )
}
