import { useId, useRef, useState, type ReactNode } from "react";
import DateSpots from "./DateSpots";
import type { DatePlanView } from "./date-plans.types";
import styles from "./chat.module.scss";

export default function ChatDateTools({ userId, dateSpotsConversationId, activePlan, onCurrentPlan, sharedPlace, clearSharedPlace, children }: {
  userId: string; dateSpotsConversationId?: string; activePlan: DatePlanView | null; onCurrentPlan: () => void;
  sharedPlace: { id: string } | null; clearSharedPlace: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const tools = useId();
  const available = !!(dateSpotsConversationId || activePlan);
  return <div className={available ? styles.composerTools : undefined}>
    {available ? <div className={styles.toolToggle}>
      <button ref={toggle} data-date-toggle type="button" aria-expanded={open} aria-controls={tools}
        aria-label={dateSpotsConversationId && incoming ? "Plan a date: shared search requested" : undefined} onClick={() => {
          if (open) clearSharedPlace();
          setOpen(!open);
        }}>Plan a date{dateSpotsConversationId && incoming ? <span className={styles.inviteDot} aria-hidden="true"/> : null}</button>
    </div> : null}
    {children}
    <div className={styles.toolPanel} id={tools} hidden={!open && !sharedPlace} onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault(); setOpen(false); clearSharedPlace(); toggle.current?.focus();
      }
    }}>
      {open && activePlan && !sharedPlace ? <button type="button" onClick={onCurrentPlan}>View current date plan</button> : null}
      {dateSpotsConversationId ? <DateSpots key={dateSpotsConversationId} userId={userId} conversationId={dateSpotsConversationId}
        open={open} shared={sharedPlace} clearShared={clearSharedPlace} onIncoming={setIncoming}/> : null}
    </div>
  </div>;
}
