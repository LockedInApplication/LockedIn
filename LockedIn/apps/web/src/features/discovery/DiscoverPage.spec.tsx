import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DiscoverPage from "./DiscoverPage";
const state = vi.hoisted(() => ({ emailVerified: false as boolean | null, canDiscover: false, nextCursor: null as string | null }));
vi.mock("./DiscoveryShell", () => ({ default: ({ children }: { children: ReactNode }) => children, useDiscovery: () => ({ userId: "a", emailVerified: state.emailVerified, me: { canDiscover: state.canDiscover, hasHistory: false, areas: [{ id: "pilot-city", label: "Pilot city" }] }, leave: async () => true }) }));
vi.mock("./use-discovery-resource", () => ({ useDiscoveryResource: (_userId: string, key: string) => ({
  value: !state.canDiscover ? undefined : key === "profile" ? { published: { areaId: "pilot-city" }, paused: false, suspended: false }
    : key === "distance-preferences" ? { configured: true, preference: { maxDistanceMiles: 25, areaLabel: "Pilot city" } }
    : { items: [], nextCursor: state.nextCursor },
  retry: () => {}, error: null,
}) }));
beforeEach(() => { state.emailVerified = false; state.canDiscover = false; state.nextCursor = null; });
it("explains email verification on unavailable Discovery without promising access or hiding history", () => {
  state.emailVerified = false;
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain(">Verify email</button>");
  expect(html).not.toContain("pilot access");
  expect(html).toContain("Starter history");
});
it("does not prompt verified or unknown accounts to verify again", () => {
  for (const value of [true, null]) {
    state.emailVerified = value;
    const html = renderToStaticMarkup(<DiscoverPage />);
    expect(html).not.toContain(">Verify email</button>");
    expect(html).toContain("Discovery is not available.");
  }
});
it("offers continuation rather than claiming an empty bounded distance page exhausts the search", () => {
  state.canDiscover = true;
  state.nextCursor = "opaque-scan-continuation";
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain(">More people</button>");
  expect(html).not.toContain("No profiles fit your distance preferences");
  expect(html).not.toContain(">Change distance</button>");
});
it("explains a genuinely exhausted empty distance search", () => {
  state.canDiscover = true;
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain("No profiles fit your distance preferences");
  expect(html).toContain(">Change distance</button>");
  expect(html).not.toContain(">More people</button>");
});
