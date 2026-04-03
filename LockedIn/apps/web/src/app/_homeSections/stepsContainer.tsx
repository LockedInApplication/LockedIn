import Step from "../_components/steps"
import styles from "../_components/styles/steps.module.scss"
export default function StepsContainer()
{
    return(
        <div className={styles.stepContainer}>
            <Step icon="✉️" title="Invite" description="Send your partner a relationship confirmation invite through LockedIn. It takes less than 30 seconds and starts with mutual inten"/>
            <Step icon="🔒" title="Confirm" description="Both people independently confirm. Only when both agree is the relationship made official — symmetry by design, no one-sided status."/>
            <Step icon="🔗" title="Transparency" description="LockedIn quietly monitors connection patterns and sends gentle, non-accusatory alerts if something unusual emerges — giving you peace of mind.."/>
        </div>
    )
}