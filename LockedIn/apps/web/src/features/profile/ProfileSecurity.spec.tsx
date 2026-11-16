import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ProfileSecurity from "./ProfileSecurity";
import type { Profile } from "./profile.types";
const profile: Profile = { id: "a", displayName: "Ada", email: "a@example.test", emailVerified: false, avatarPreset: "initials", activityEmails: true, inAppActivity: true };
it("offers an unverified account a verification action without restricting password settings", () => {
  const html = renderToStaticMarkup(<ProfileSecurity profile={profile} onDirty={() => {}} onLeave={() => {}} />);
  expect(html).toContain(">Verify email</button>");
  expect(html).toContain("Email not verified");
  expect(html).toContain("Change password");
});
it("does not offer verification for an already verified server profile", () => {
  const html = renderToStaticMarkup(<ProfileSecurity profile={{ ...profile, emailVerified: true }} onDirty={() => {}} onLeave={() => {}} />);
  expect(html).not.toContain(">Verify email</button>");
  expect(html).toContain("Email verified");
});
