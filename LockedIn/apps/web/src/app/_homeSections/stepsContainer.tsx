"use client"

import Step from "../_components/steps"
import styles from "../_components/styles/steps.module.scss"
import { useScrollReveal } from "@/hooks/useScrollReveal"
export default function StepsContainer()
{
    const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

    return(
        <div ref={ref} className={`${styles.stepContainer} ${isVisible ? styles.isVisible : ""}`}>
            <Step icon="01" title="Reflect privately" description="Each person answers independently before seeing the other's perspective. Sharing stays off by default."/>
            <Step icon="02" title="Reveal by choice" description="Compare only the answers both people consent to share. Differences are never turned into a score."/>
            <Step icon="03" title="Choose together" description="Turn the conversation into one small next step that either person can accept, revise, pause, or decline."/>
        </div>
    )
}
