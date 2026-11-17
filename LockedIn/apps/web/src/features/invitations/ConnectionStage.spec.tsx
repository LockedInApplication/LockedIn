import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConnectionStage from "./ConnectionStage";

const props = { pendingInvites: [], busy: false, inviteLink: "", onInvite: async () => {}, onReview: () => {} };

it("gives eligible people with no incoming invitations two ways to start", () => {
  const html = renderToStaticMarkup(<ConnectionStage {...props} onExplore={() => {}} />);
  expect(html).toContain("How would you like to start?");
  expect(html).toContain("Invite someone I know");
  expect(html).toContain("Explore Discovery");
  expect(html).not.toContain('id="partner-email"');
});

it("keeps the private invite available when Discovery access is unavailable", () => {
  const html = renderToStaticMarkup(<ConnectionStage {...props} />);
  expect(html).not.toContain("Explore Discovery");
  expect(html).toContain('id="partner-email"');
});

it("preserves invitation review when someone already invited the new member", () => {
  const pendingInvites = [{ id: "invite", token: "test", expiresAt: "2027-01-01", inviter: { name: "Sam", email: "sam@example.test" } }];
  const html = renderToStaticMarkup(<ConnectionStage {...props} pendingInvites={pendingInvites} onExplore={() => {}} />);
  expect(html).toContain("Review invitation");
  expect(html).not.toContain("How would you like to start?");
});
