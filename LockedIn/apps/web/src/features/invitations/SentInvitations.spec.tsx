import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SentInvitationsContent } from "./SentInvitations";
import type { SentInvitation } from "./invitation-management.types";

const items: SentInvitation[] = ["newest", "second", "third", "older"].map(id => ({
  id, toEmail: `${id}@example.test`, status: "PENDING", canWithdraw: true,
  createdAt: "2026-11-15T12:00:00Z", expiresAt: null,
}));
const list = {
  items, nextCursor: "older", loading: false, busy: false, error: null,
  reload: () => undefined, more: () => undefined, mutate: async () => {},
};

describe("invitation history preview", () => {
  it("keeps Home to the three most recent invitations and offers full history instead of appending", () => {
    const html = renderToStaticMarkup(<SentInvitationsContent list={list} onViewAll={() => {}} />);
    expect(html).toContain("newest@example.test");
    expect(html).toContain("second@example.test");
    expect(html).toContain("third@example.test");
    expect(html).not.toContain("older@example.test");
    expect(html).toContain("View all invitations");
    expect(html).not.toContain("Earlier invitations");
    expect(html.match(/Withdraw invitation/g)).toHaveLength(3);
  });

  it("preserves all loaded invitations and pagination in the dedicated manager", () => {
    const html = renderToStaticMarkup(<SentInvitationsContent list={list} />);
    expect(html).toContain("older@example.test");
    expect(html).toContain("Earlier invitations");
    expect(html).not.toContain("View all invitations");
  });

  it("shows counts for real loaded statuses without excluding other history from All", () => {
    const html = renderToStaticMarkup(<SentInvitationsContent list={{
      ...list, items: [items[0], { ...items[1], status: "ACCEPTED" }, { ...items[2], status: "EXPIRED" }],
    }} />);
    expect(html).toContain('aria-pressed="true">All <span>3</span>');
    expect(html).toContain('aria-pressed="false">Pending <span>1</span>');
    expect(html).toContain('aria-pressed="false">Accepted <span>1</span>');
    expect(html).toContain("Invitation expired");
    expect(html).toContain("Filters and counts apply to loaded invitations.");
    expect(html).toContain("not that an email was delivered or opened");
    expect(html).not.toContain("Preview data");
  });

  it("keeps the empty state without an unnecessary history control", () => {
    const html = renderToStaticMarkup(<SentInvitationsContent list={{ ...list, items: [], nextCursor: null }} onViewAll={() => {}} />);
    expect(html).toContain("No invitations sent yet.");
    expect(html).not.toContain("View all invitations");
  });
});
