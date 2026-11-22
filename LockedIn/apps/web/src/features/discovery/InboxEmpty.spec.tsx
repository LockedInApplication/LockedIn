import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InboxEmpty } from "./InboxList";

it("explains that Lock In is optional for chat and keeps real Inbox actions available", () => {
  const onOpen = async () => true;
  const html = renderToStaticMarkup(<InboxEmpty canInvite onOpen={onOpen} />);
  expect(html).toContain("No conversations yet.");
  expect(html).toContain("You don’t have to lock in to start talking.");
  expect(html).toContain("Back to Together");
  expect(html).toContain("Invite someone");
  expect(html).toContain("Go to Discover");
  expect(html).toContain("Sent invitations");
  expect(renderToStaticMarkup(<InboxEmpty canInvite={false} onOpen={onOpen} />)).not.toContain("Invite someone");
});
