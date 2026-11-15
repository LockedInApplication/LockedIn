"use client";

import styles from "@/app/journey/journey.module.scss";
import { useState, type FormEvent } from "react";
import type { JourneySession } from "@/features/journey/journey.types";
import { journeyRequest } from "@/features/journey/journey.client";

export default function NextStepForm({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    runAction(
      () =>
        journeyRequest(`/api/journey/sessions/${session.id}/next-steps`, {
          method: "POST",
          body: JSON.stringify({ title, details: details || undefined, targetDate: targetDate || undefined }),
        }),
      "Your proposed next step is ready for your partner to review.",
    );
  }

  return (
    <section className={styles.nextStepCard}>
      <div>
        <span className={styles.eyebrow}>
          {session.nextSteps.length || session.proposals.length ? "ADD TO YOUR ROADMAP" : "CHOOSE WHAT COMES NEXT"}
        </span>
        <h2>
          {session.nextSteps.length || session.proposals.length
            ? "Suggest another next step."
            : "Turn the conversation into practical next steps."}
        </h2>
        <p>Each accepted step gets its own revisit date and reflection. One idea does not replace another.</p>
      </div>
      <form onSubmit={submit}>
        <label>
          Next step
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Compare our priorities over coffee" minLength={3} required />
        </label>
        <label>
          A little context <span>optional</span>
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What would make this conversation feel useful?" />
        </label>
        <label>
          Revisit on <span>optional</span>
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        <button className={styles.primaryAction} disabled={busy || title.trim().length < 3}>
          {busy ? "Sending proposal..." : "Propose this next step"}
        </button>
      </form>
    </section>
  );
}
