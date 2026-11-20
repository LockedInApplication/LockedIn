import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatTranscript } from "./Chat";
import ChatDateTools from "./ChatDateTools";
import DatePlanCard from "./DatePlanCard";
import MessageSafetyActions from "./MessageSafetyActions";
import { datePlanTimeInput } from "./date-plan-time";
import type { DatePlanEvent, DatePlanView } from "./date-plans.types";

const startsAt = "2026-11-21T23:00:00.000Z";
const plan = { id: "plan", sourceMessageId: "spot", venueName: "Test Gallery", startsAt, timeZone: "America/New_York", revision: 2, state: "pending", proposer: "partner" } satisfies DatePlanView;
const event = { id: plan.id, sourceMessageId: plan.sourceMessageId, venueName: plan.venueName, startsAt, timeZone: plan.timeZone, revision: 2, state: "pending", action: "counter" } satisfies DatePlanEvent;
const noop = () => {};
const card = (event: DatePlanEvent, activePlan: DatePlanView | null) => renderToStaticMarkup(<DatePlanCard
  event={event} activePlan={activePlan} busy={false} onAction={noop} onCounter={noop} onCalendar={noop}/>);

describe("date planning in chat", () => {
  it("offers confirmation only to the counterpart of the current proposal", () => {
    const prior = card({ ...event, revision: 1, startsAt: "2026-11-20T22:00:00.000Z", action: "propose" }, plan);
    expect(prior).toContain("2026-11-20T22:00:00.000Z");
    expect(prior).not.toContain(">Confirm</button>");
    const counterpart = card(event, plan);
    expect(counterpart).toContain(">Confirm</button>");
    expect(counterpart).toContain(">Suggest another time</button>");
    const own = card(event, { ...plan, proposer: "self" });
    expect(own).toContain("Waiting for their reply");
    expect(own).toContain(">Withdraw</button>");
    expect(own).not.toContain(">Confirm</button>");
    const confirmed = { ...event, action: "confirm", state: "confirmed" } as const;
    expect(card(confirmed, { ...plan, state: "confirmed" })).toContain(">Add to calendar</button>");
    expect(card(confirmed, null)).not.toContain(">Add to calendar</button>");
  });

  it("keeps planning available without search and consolidates the composer tools", () => {
    const items = [
      { id: "spot", sequence: "1", author: "partner" as const, text: "Suggested date spot: Test Gallery", createdAt: startsAt, dateSpot: true as const },
      { id: "text", sequence: "2", author: "partner" as const, text: "Suggested date spot: Test Gallery", createdAt: startsAt },
    ];
    const html = renderToStaticMarkup(<ChatTranscript items={items} partnerName="Sam" busy={false} onReport={noop} onSuggestTime={noop}/>);
    expect(html.match(/>Suggest a time<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain("View place");
    const composer = renderToStaticMarkup(<ChatDateTools userId="a" dateSpotsConversationId="c" activePlan={null} onCurrentPlan={noop} sharedPlace={null} clearSharedPlace={noop}><textarea aria-label="Message"/></ChatDateTools>);
    expect(composer.match(/Plan a date/g)).toHaveLength(1);
    expect(composer).not.toMatch(/Find a date spot|Best spot for us|See our date spots/);
  });

  it("converts using the chosen zone and rejects daylight-saving overlaps", async () => {
    const now = new Date("2026-10-25T00:00:00Z");
    expect(await datePlanTimeInput("2026-11-12T19:30", "America/New_York", now)).toEqual({
      localTime: "2026-11-12T19:30", startsAt: "2026-11-13T00:30:00.000Z", timeZone: "America/New_York",
    });
    expect(await datePlanTimeInput("2026-11-01T01:30", "America/New_York", now)).toBeNull();
    expect(await datePlanTimeInput("2026-11-12T19:30", "-05:00", now)).toBeNull();
    expect(await datePlanTimeInput("2026-10-24T00:00", "UTC", now)).toBeNull();
  });

  it("keeps the date readable when the viewer's browser does not know the proposed time zone", () => {
    const html = card({ ...event, timeZone: "Example/Unavailable" }, plan);
    expect(html).toContain(startsAt);
    expect(html).toContain("Original time zone: Example/Unavailable");
    expect(html).toContain(">Confirm</button>");
  });

  it("identifies the selected date plan in the report preview", () => {
    const html = renderToStaticMarkup(<MessageSafetyActions userId="a" conversationId="conversation" onBlocked={noop}
      message={{ id: "proposal", author: "partner", createdAt: startsAt, sequence: "1", text: "Suggested a date time.", datePlanEvent: event }}/>);
    expect(html).toContain("Test Gallery");
    expect(html).toContain("2026");
    expect(html).not.toContain(">Confirm</button>");
  });
});
