import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import DiscoverPage from "./DiscoverPage";
const state = vi.hoisted(() => ({ emailVerified: false as boolean | null }));
vi.mock("./DiscoveryShell", () => ({ default: ({ children }: { children: ReactNode }) => children, useDiscovery: () => ({ userId: "a", emailVerified: state.emailVerified, me: { canDiscover: false, hasHistory: false, areas: [] }, leave: async () => true }) }));
it("explains email verification on unavailable Discovery without promising access or hiding history", () => {
  state.emailVerified = false;
  const html = renderToStaticMarkup(<DiscoverPage />);
  expect(html).toContain(">Verify email</button>");
  expect(html).toContain("pilot access");
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
