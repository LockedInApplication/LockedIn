import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { SimplePlan } from "@/features/roadmap/roadmap.types";
import { workspaceViewUrl } from "@/features/journey/journey.navigation";
import BehindThePhoto from "./BehindThePhoto";
import type { MemoryPhoto } from "./memory-api";
import { planMemoryHref, planMemoryTarget, planMemoryTitle } from "./plan-memory";

const plan: SimplePlan = {
  id: "d0e32c54-69cd-4bb5-b460-1c869ea1c593", title: "Museum and a walk", day: "2026-11-15", note: "Private plan note",
  completionOpensAt: "2026-11-15T00:00:00Z", status: "DONE", version: 3, yours: false, proposerName: "Sam", resolvedBy: "You",
};

function render(source: SimplePlan | undefined, photos: MemoryPhoto[] = []) {
  return renderToStaticMarkup(<BehindThePhoto relationshipId="together" userId="alex" partnerName="Sam"
    initialTarget={null} planLink={{ id: plan.id, plan: source, onBack: () => {} }}
    memories={{ gallery: { photos, envelopes: [] }, error: "", invalidate: () => {}, setBlocked: () => {} }}
    onDirty={() => {}} onExpired={() => {}} />);
}

it("uses a plan ID alone in the link, validates it, and clears it when leaving Memories", () => {
  const href = planMemoryHref(plan.id);
  expect(href).not.toContain(plan.title);
  expect(planMemoryTarget(new URL(href, "http://localhost").hash)).toBe(plan.id);
  expect(planMemoryTarget("#memory-plan/%3Cbad%3E")).toBeNull();
  expect(planMemoryTarget(`#memory-plan/${plan.id}/extra`)).toBeNull();
  expect(workspaceViewUrl(href, "roadmap")).toBe("/journey?view=roadmap");
});

it("prefills only the completed plan’s name and date, without copying the note", () => {
  const html = render(plan);
  expect(html).toContain("Save a memory");
  expect(html).toContain('value="Museum and a walk"');
  expect(html).toContain('dateTime="2026-11-15"');
  expect(html).not.toContain("Private plan note");
  expect(render({ ...plan, day: null })).not.toContain("Plan date");
  expect(render({ ...plan, status: "ACCEPTED" })).not.toContain("Share photo");
  expect(render(undefined)).not.toContain("Share photo");
  expect(planMemoryTitle(` ${"x".repeat(79)}🌼`)).toBe("x".repeat(79));
});

it("opens the linked photo instead of offering another upload, even after undo", () => {
  const html = render({ ...plan, hasMemory: true, status: "ACCEPTED" }, [{
    id: "memory", title: "Already shared", day: "2026-11-15", sourcePlanId: plan.id, envelopeId: null,
    width: 300, height: 200, yours: true, createdAt: "2026-11-17T12:00:00Z", pins: [],
  }]);
  expect(html).toContain("Already shared");
  expect(html).toContain('dateTime="2026-11-15"');
  expect(html).not.toContain("Share photo");
});
