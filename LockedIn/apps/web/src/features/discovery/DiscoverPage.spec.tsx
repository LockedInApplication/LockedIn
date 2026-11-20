import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DiscoverPage from "./DiscoverPage";
import type { DiscoveryLocation } from "./discovery.types";
const state = vi.hoisted(() => ({ emailVerified: false as boolean | null, canDiscover: false, lockedIn: false, nextCursor: null as string | null, location: undefined as DiscoveryLocation | undefined, matching: undefined as {required:true;complete:boolean}|undefined, published: true, paused: false, resourceKeys: [] as string[] }));
vi.mock("./DiscoveryShell", () => ({ default: ({ children }: { children: ReactNode }) => children, useDiscovery: () => ({ userId: "a", emailVerified: state.emailVerified, me: { canDiscover: state.canDiscover, discoveryLockedIn: state.lockedIn, hasHistory: false, location: state.location, matching: state.matching, areas: [{ id: "pilot-city", label: "Pilot city" }, { id: "new-york", label: "New York" }] }, leave: async () => true }) }));
vi.mock("./use-discovery-resource", () => ({ useDiscoveryResource: (_userId: string, key: string) => {
  state.resourceKeys.push(key);
  return {
  value: !state.canDiscover || !key ? undefined : key === "profile" ? { published: state.published ? { areaId: "pilot-city" } : null, paused: state.paused, suspended: false }
    : key === "distance-preferences" ? { configured: true, preference: { maxDistanceMiles: 25, areaLabel: "Pilot city" } }
    : { items: [], nextCursor: state.nextCursor },
  retry: () => {}, error: null,
}; } }));
beforeEach(() => { state.emailVerified = false; state.canDiscover = false; state.lockedIn = false; state.nextCursor = null; state.location = undefined; state.matching = undefined; state.published = true; state.paused = false; state.resourceKeys.length = 0; });
it("explains email verification on unavailable Discovery without promising access or hiding history", () => {
  state.emailVerified = false;
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain(">Verify email</button>");
  expect(html).not.toContain("pilot access");
  expect(html).toContain("Go to Inbox");
});
it("explains lock-in locally and keeps chats and the shared space reachable without a candidate request", () => {
  state.lockedIn = true;
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain("Discovery is paused");
  expect(html).toContain("Go to Inbox");
  expect(html).toContain("Open Together");
  expect(state.resourceKeys.filter(Boolean)).toEqual([]);
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
it("asks for location before starting a candidate search and keeps Connections reachable", () => {
  state.canDiscover = true;
  state.location = { required: true, areaId: null, expiresAt: null };
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain("Confirm my location");
  expect(html).toContain("Go to Inbox");
  expect(html).not.toContain("Explore an area");
  expect(state.resourceKeys.filter(Boolean)).toEqual(["profile"]);
});
it("browses the confirmed metro instead of the account’s selected profile city", () => {
  state.canDiscover = true;
  state.location = { required: true, areaId: "new-york", expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain("Browsing New York");
  expect(html).toContain("Update my location");
  expect(html).not.toContain("Explore an area");
  expect(html).not.toContain(">Distance preferences");
  expect(state.resourceKeys.filter(Boolean)).toEqual(["profile", "areaId=new-york::0"]);
});

it.each([true, false])("offers matching setup without starting a search (published: %s)", published => {
  state.canDiscover = true;
  state.published = published;
  state.matching = { required: true, complete: false };
  state.location = { required: true, areaId: null, expiresAt: null };
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain(">Set up matching</button>");
  expect(html).not.toContain("Confirm my location");
  expect(html).not.toContain("Set up my profile");
  expect(state.resourceKeys.filter(Boolean)).toEqual(["profile"]);
});

it("still requires publication, active visibility, and a current location after completing matching", () => {
  state.canDiscover = true;
  state.matching = { required: true, complete: true };
  state.published = false;
  expect(renderToStaticMarkup(<DiscoverPage />)).toContain("Set up my profile");
  state.published = true;
  state.paused = true;
  expect(renderToStaticMarkup(<DiscoverPage />)).toContain("Your visibility is paused.");
  state.paused = false;
  state.location = { required: true, areaId: "new-york", expiresAt: new Date(Date.now() - 1000).toISOString() };
  const expired = renderToStaticMarkup(<DiscoverPage />);
  expect(expired).toContain("Your location check expired.");
  expect(expired).toContain(">Matching preferences</button>");
});
