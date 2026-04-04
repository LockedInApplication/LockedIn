"use client"

import Step from "../_components/steps"
import styles from "../_components/styles/steps.module.scss"
import { useScrollReveal } from "@/hooks/useScrollReveal"
export default function StepsContainer()
{
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

    return(
        <div ref={ref} className={`${styles.stepContainer} ${isVisible ? styles.isVisible : ""}`}>
            <Step icon="✉️" title="Invite" description="Send your partner a relationship confirmation invite through LockedIn. It takes less than 30 seconds and starts with mutual inten"/>
            <Step icon="🔒" title="Confirm" description="Both people independently confirm. Only when both agree is the relationship made official — symmetry by design, no one-sided status."/>
            <Step icon="🔗" title="Transparency" description="LockedIn quietly monitors connection patterns and sends gentle, non-accusatory alerts if something unusual emerges — giving you peace of mind.."/>
        </div>
    )
}