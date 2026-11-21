import { expect, it } from "vitest";
import { authEntryLink, isMemberPath, safeMemberReturnTo, verificationPath } from "./member-entry";

it("requires verification for member pages only", () => {
  for (const path of ["/journey", "/messages/chat", "/connections", "/discover/matching", "/discovery/moderation", "/profile", "/your-space"]) expect(isMemberPath(path)).toBe(true);
  for (const path of ["/", "/login", "/signup", "/verify-email", "/forgot-password", "/discover-anywhere"]) expect(isMemberPath(path)).toBe(false);
});

it("keeps an internal destination through verification and rejects external or looping destinations", () => {
  const path = "/journey?view=roadmap#step-id";
  expect(new URL(verificationPath(path), "https://example.test").searchParams.get("returnTo")).toBe(path);
  for (const next of ["//elsewhere.test", "/\\elsewhere.test", "/verify-email", "/journey/../login", "https://elsewhere.test"]) expect(safeMemberReturnTo(next)).toBe("/journey");
});

it("keeps the invitation composer through login, signup and verification", () => {
  const invite = "/connections?compose=invite";
  const origin = "https://example.test";
  for (const path of ["/login", "/signup"] as const) {
    expect(new URL(authEntryLink(path, invite), origin).searchParams.get("returnTo")).toBe(invite);
    expect(authEntryLink(path, "https://other.example")).toBe(path);
    expect(authEntryLink(path, "/journey")).toBe(path);
  }
  expect(new URL(verificationPath(invite), origin).searchParams.get("returnTo")).toBe(invite);
});
