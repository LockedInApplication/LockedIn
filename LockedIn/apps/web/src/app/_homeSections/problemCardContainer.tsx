"use client"

import styles from "../_components/styles/problemCard.module.scss"
import ProblemCard from "../_components/problemCard"
import { useScrollReveal } from "@/hooks/useScrollReveal"
export default function ProblemCardContainer()
{
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

    return (
        <div ref={ref} className={`${styles.problemCardContainer} ${isVisible ? styles.isVisible : ""}`}>
            <ProblemCard icon="01" title="Private assumptions" description="Two people can want a future together while imagining very different timing, priorities, or next chapters."/>
            <ProblemCard icon="02" title="One-time conversations" description="Important topics are discussed once, then disappear into texts, busy schedules, or an unclear promise to revisit them."/>
            <ProblemCard icon="03" title="No shared next step" description="Conversation can create clarity in the moment without becoming a decision or action that both people genuinely choose."/>
        </div>
    )
}
