import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { activeMemberTab, memberTabs } from "../member-navigation";
import WorkspaceHeader from "./WorkspaceHeader";

it("shows the same four destinations once, with a single active tab and an accessible Inbox badge", () => {
  const html = renderToStaticMarkup(<WorkspaceHeader active="Inbox" unreadCount={2} onNavigate={() => {}} onSignOut={async () => {}}
    notifications={<button aria-label="Notifications">Bell</button>}/>);
  expect(html.match(/aria-label="Main navigation"/g)).toHaveLength(1);
  for (const { label } of memberTabs) expect(html.match(new RegExp(`>${label}</span>`, "g"))).toHaveLength(1);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Inbox, 2 unread conversations"');
  expect(html.match(/aria-label="Notifications"/g)).toHaveLength(1);
  expect(html).toContain('aria-expanded="false"');
});

it("groups legacy routes and direct chat under the same navigation", () => {
  expect(activeMemberTab("/discover")).toBe("Discover");
  expect(activeMemberTab("/connections/someone")).toBe("Inbox");
  expect(activeMemberTab("/messages/someone")).toBe("Inbox");
  expect(activeMemberTab("/journey", true)).toBe("Inbox");
  expect(activeMemberTab("/journey")).toBe("Together");
  for (const path of ["/profile", "/your-space", "/discover/matching", "/discover/profile", "/discovery/moderation"]) {
    expect(activeMemberTab(path)).toBe("Profile");
  }
});
