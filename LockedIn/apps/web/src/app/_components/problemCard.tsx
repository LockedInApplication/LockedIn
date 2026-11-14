import styles from "./styles/problemCard.module.scss"

type problemCardProps = {
    icon: string;
    title: string
    description: string
}
export default function ProblemCard({icon, title, description}: problemCardProps)
{
    return(

        <div className={styles.problemCard}>
            <div className={styles.problemIcon}>
                {icon}
            </div>
            <h3 className={styles.problemTitle}>
                {title}
            </h3>
            <div className={styles.problemDescription}>
                {description}
            </div>
        </div>
    )
}