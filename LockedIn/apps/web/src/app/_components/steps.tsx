import styles from "./styles/steps.module.scss"

type stepsCardProps = {
    icon: string;
    title: string
    description: string
}
export default function Step({icon, title, description}: stepsCardProps) {
    return (
        <div className={styles.step}>
            <div className={styles.stepIcon}>
                {icon}
            </div>
            <h3 className={styles.stepTitle}>
             {title}
            </h3>
            <p className={styles.stepDescription}>
                {description}
            </p>
        </div>
    )
}