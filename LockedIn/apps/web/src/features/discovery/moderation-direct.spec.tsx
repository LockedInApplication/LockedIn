import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./DiscoveryShell", () => ({ default: ({ children }: { children: ReactNode }) => children, useDiscovery: () => ({ userId: "moderator", me: { canModerate: true }, busy: false }) }));
vi.mock("./use-discovery-resource", () => ({ useDiscoveryResource: () => ({ value: { items: [{ id: "direct-report", reason: "SPAM", detail: null, evidence: {}, profileId: null, suspended: true, resolvedAt: "2026-11-17", audits: [] }], nextCursor: null } }) }));
import DiscoveryModerationPage from "./DiscoveryModerationPage";
describe("direct account moderation", () => {
  it("offers restoration for suspended reported accounts without requiring a Discovery profile", () => {
    expect(renderToStaticMarkup(<DiscoveryModerationPage/>)).toContain("Restore account access");
  });
});
