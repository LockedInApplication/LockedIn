import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ProfileDeletion from "./ProfileDeletion";

it("shows the consequences before exposing the password confirmation form", () => {
  const html = renderToStaticMarkup(<ProfileDeletion userId="test-owner" onDeleted={() => {}} />);
  expect(html).toContain("Delete account");
  expect(html).toContain("signs you out on all devices");
  expect(html).toContain("shared space will close");
  expect(html).not.toContain('type="password"');
  expect(html).not.toContain("Permanently delete account");
  expect(html).toContain("Request account deletion");
});

it("shows a private receipt instead of another request button after a reload", () => {
  const html = renderToStaticMarkup(<ProfileDeletion userId="test-owner" onDeleted={() => {}}
    pendingRequest={{ id: "request-reference", requestedAt: "2026-11-21T20:00:00Z" }} />);
  expect(html).toContain("Deletion request received");
  expect(html).toContain("Your account has not been deleted");
  expect(html).toContain("request-reference");
  expect(html).not.toContain("Send deletion request");
});
