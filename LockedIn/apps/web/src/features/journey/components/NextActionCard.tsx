"use client";

import type { JourneyOverview } from "../journey.types";
import { getNextAction } from "../journey.next-action";
import actionStyles from "../next-action.module.scss";

export default function NextActionCard({ overview, busy, onNavigate, onFocusCurrent }: {
  overview: JourneyOverview;
  busy: boolean;
  onNavigate: (view: "conversations") => void;
  onFocusCurrent: () => void;
}) {
  const action = getNextAction(overview);
  if (!action) return null;

  return (
    <section className={actionStyles.card} aria-labelledby="next-action-title" data-waiting={action.waiting}>
      <div aria-live="polite">
        <span className={actionStyles.kicker}>
          <span aria-hidden>{action.waiting ? "◌" : "↗"}</span>
          GUIDED CONVERSATION
        </span>
        <h2 id="next-action-title">{action.title}</h2>
        <p>{action.description}</p>
      </div>
      <button type="button" disabled={busy} onClick={() => {
        if (action.target === "current") onFocusCurrent();
        else onNavigate(action.target);
      }}>
        {action.buttonLabel}<span aria-hidden>→</span>
      </button>
    </section>
  );
}
