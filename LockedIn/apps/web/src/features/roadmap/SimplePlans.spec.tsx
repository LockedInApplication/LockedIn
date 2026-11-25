import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import SimplePlans from "./SimplePlans";
import type { SimplePlan } from "./roadmap.types";

const plan: SimplePlan = {
  id: "dessert", title: "Get dessert", note: null, day: "2026-11-24", completionOpensAt: "2026-11-24T08:00:00.000Z",
  status: "ACCEPTED", version: 2, yours: true, proposerName: "Sam", resolvedBy: null,
};

function renderPlans(plans: SimplePlan[], lockedIn = false) {
  return renderToStaticMarkup(<SimplePlans relationshipId="together" userId="sam" plans={plans} busy={false}
    onConflict={() => {}} onDiscard={() => {}} onEditing={() => {}} runAction={async () => {}}
    onOpenPlanMemory={lockedIn ? () => {} : undefined} />);
}
const render = (...plans: SimplePlan[]) => renderPlans(plans);

afterEach(() => vi.useRealTimers());

it("disables only completion before the plan's scheduled day starts and explains why", () => {
  vi.setSystemTime(new Date("2026-11-24T07:59:59.999Z"));
  const html = render(plan);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark done<\/button>/);
  expect(html).toContain('aria-describedby="step-dessert-completion"');
  expect(html).toContain(`dateTime="${plan.completionOpensAt}"`);
  expect(html).toContain('<button type="button">Cancel plan</button>');
});

it("enables completion at the start of the day and keeps undated plans flexible", () => {
  vi.setSystemTime(new Date(plan.completionOpensAt!));
  expect(render(plan)).toContain('<button type="button">Mark done</button>');
  expect(render({ ...plan, day: null, completionOpensAt: null })).toContain('<button type="button">Mark done</button>');
});

it("offers undo in Past plans only for completed plans", () => {
  const done = render({ ...plan, status: "DONE", resolvedBy: "Your partner" });
  expect(done).toContain("Past plans");
  expect(done).toContain('<button type="button">Undo done</button>');
  expect(render({ ...plan, status: "CANCELED" })).not.toContain("Undo done");
});

it("starts a memory only after completion in a locked-in space; a saved one can still be opened after undo", () => {
  const done = { ...plan, status: "DONE" } as const;
  expect(render(done)).not.toContain("Save a memory");
  expect(renderPlans([plan], true)).not.toContain("Save a memory");
  expect(renderPlans([{ ...plan, status: "CANCELED" }], true)).not.toContain("Save a memory");
  expect(renderPlans([done], true)).toContain("Save a memory");
  expect(renderPlans([{ ...done, hasMemory: true }], true)).toContain("Open memory");
  const reopened = renderPlans([{ ...plan, hasMemory: true }], true);
  expect(reopened).toContain("Open memory");
  expect(reopened).not.toContain("Save a memory");
});
