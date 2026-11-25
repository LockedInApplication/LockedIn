import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ManageTogether, { leaveTogetherDescription } from "./ManageTogether";

const props = { busy: false, onLeave: () => {}, onNavigate: () => {} };

it("keeps leaving separate from safety, visibility, and reporting navigation", () => {
  const html = renderToStaticMarkup(<ManageTogether {...props} conversationId="shared/chat" />);
  expect(html).toContain("Manage Together</h1>");
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toContain("Leave Together</button>");
  expect(html).toContain('href="/messages/shared%2Fchat?from=manage-together#chat-safety"');
  expect(html).toContain('href="/discover/profile#discovery-visibility"');
  expect(html).toContain('href="/profile#together-reporting"');
  expect(html).not.toMatch(/Need a hand|only change|stay in your chat history/);
});

it("points to Inbox rather than promising controls for a linked chat that is unavailable", () => {
  const html = renderToStaticMarkup(<ManageTogether {...props} conversationId={null} />);
  expect(html).toContain('href="/connections"');
  expect(html).toContain("Open Inbox</strong>");
  expect(html).not.toContain("#chat-safety");
});

it("describes loss of access without claiming deletion or automatic Discovery visibility", () => {
  expect(leaveTogetherDescription).toContain("Leaving ends Together for both of you.");
  expect(leaveTogetherDescription).toContain("lose access to this space, its plans and memories, and any chat linked to it");
  expect(leaveTogetherDescription).toContain("Your other chats stay open.");
  expect(leaveTogetherDescription).toContain("Neither profile becomes visible in Discovery automatically.");
});
