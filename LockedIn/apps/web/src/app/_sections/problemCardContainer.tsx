import styles from "../_components/styles/problemCard.module.scss"
import ProblemCard from "../_components/problemCard"
export default function ProblemCardContainer()
{
    return (
        <div className={styles.problemCardContainer}>
            <ProblemCard icon="🌫️" title="Hidden Connections" description="Online networks create invisible webs of interactions that can go unnoticed, creating ambiguity and room for doubt between partners."/>
            <ProblemCard icon="🔍" title="Ambiguous Status" description="Without mutual confirmation, relationship status remains one-sided or undefined — creating unnecessary anxiety and miscommunication."/>
            <ProblemCard icon="🤝" title="Broken Trust" description="Trust takes years to build and seconds to break. Without a gentle system of accountability, small patterns can spiral into major issues."/>
        </div>
    )
}