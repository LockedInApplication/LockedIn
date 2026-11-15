import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ProfileDetails from "./ProfileDetails";
import ProfileAvatar from "./ProfileAvatar";
it("provides an editable name, accessible avatar choices and privacy explanation", () => {
  const html = renderToStaticMarkup(
    <ProfileDetails
      profile={{
        id: "a",
        displayName: "Ada",
        email: "a@example.test",
        emailVerified: false,
        avatarPreset: "initials",
        activityEmails: true,
        inAppActivity: true,
      }}
      onSaved={() => {}}
      onDirty={() => {}}
    />,
  );
  expect(html).toContain('value="Ada"');
  expect(html.match(/type="radio"/g)).toHaveLength(5);
  expect(html).toContain("Save details");
  expect(html).toContain("appear to your partner");
  expect(html).not.toContain('type="file"');
});
it("renders initials as fallback without fetching an external image", () => {
  const html = renderToStaticMarkup(
    <ProfileAvatar name="Ada Lovelace" preset="unknown" />,
  );
  expect(html).toContain("AL");
  expect(html).not.toContain("<img");
});
it("renders a nameless legacy account safely", () => {
  expect(
    renderToStaticMarkup(<ProfileAvatar name={null as unknown as string} />),
  ).toContain("?");
});
