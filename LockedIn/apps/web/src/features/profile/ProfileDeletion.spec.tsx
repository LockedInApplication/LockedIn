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
});
