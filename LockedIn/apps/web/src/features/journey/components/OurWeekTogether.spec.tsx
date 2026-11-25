import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OurWeekHighlights, type OurWeek } from "./OurWeekTogether";

const week: OurWeek = {
  startsOn: "2026-11-16", endsOn: "2026-11-22",
  plans: [{ id: "plan-id", title: "Go to the museum", completedAt: "2026-11-21T12:00:00Z" }],
  memories: [{ id: "photo-id", title: "The light room", sharedAt: "2026-11-22T12:00:00Z", envelopeTitle: "Museum day" }],
  topic: { title: "Weekend ideas", discussedAt: "2026-11-20T12:00:00Z" },
};

it("links the two highlight types to the existing plan and photo and retains the recap context", () => {
  const page = renderToStaticMarkup(<OurWeekHighlights recap={week} relationshipId="space" onNavigate={() => {}} />);
  expect(page).toContain("Go to the museum");
  expect(page).toContain("The light room");
  expect(page).toContain("Museum day");
  expect(page).toContain("Weekend ideas");
  expect(page).toContain("Marked discussed in Room to Talk");
  expect(page).toContain('href="/journey?view=roadmap&amp;from=our-week#step-plan-id"');
  expect(page).toContain('href="/journey?view=memories&amp;from=our-week#memory-photo/photo-id"');
  expect(page.match(/<a\b/g)).toHaveLength(2);
});

it("keeps an empty week quiet, without an action or prompt to fill it", () => {
  const page = renderToStaticMarkup(<OurWeekHighlights recap={{ ...week, plans: [], memories: [], topic: null }}
    relationshipId="space" onNavigate={() => {}} />);
  expect(page).toContain("Nothing to revisit from last week yet.");
  expect(page).not.toMatch(/<(a|button|form)\b/);
});
