import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import WorkspaceHeader from "./WorkspaceHeader";
describe("responsive workspace account header", () => {
  it("provides a labeled closed mobile disclosure without duplicating notifications", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceHeader, {
        user: { name: "Alexandra Montgomery" },
        onSignOut: async () => {},
        onProfile: () => {},
        onInvitations: () => {},
        notifications: createElement(
          "button",
          { "aria-label": "Notifications" },
          "Bell",
        ),
      }),
    );
    expect(html).toContain('aria-label="Account options"');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/aria-label="Notifications"/g)).toHaveLength(1);
    expect(html).toContain("Profile &amp; settings");
    expect(html).toContain("Invitations");
  });
});
