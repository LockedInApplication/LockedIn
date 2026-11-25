import { expect, it } from "vitest";
import type { ConversationMetadata } from "@/features/messaging/messaging.types";
import type { DiscoveryConnectionView } from "./discovery.types";
import { inboxEntries } from "./inbox-entries";

const partner = { publicName: "Sam", avatarPreset: "leaf" };
const linked: ConversationMetadata = { id: "shared", partner, canChat: true, unavailableReason: null };
const connection = (id: string, state: DiscoveryConnectionView["state"], canChat?: boolean): DiscoveryConnectionView => ({
  id, state, canChat, partner, inviter: "partner", topic: { key: "support", text: "Support" }, hello: "Hello", senderSnapshot: partner,
  ownDraft: null, sharedResponses: [], readiness: { mine: false, theirs: false, consentVersion: 1 },
  promotedRelationshipId: null, canAccept: false, canClose: false, canShare: false, canChooseBuild: false,
});

it("lists active Discovery and direct chats together, puts unread first, and separates invitations and history", () => {
  const inbox = inboxEntries([
    connection("active", "ACCEPTED"), connection("request", "PENDING"), connection("older", "ACCEPTED"),
    connection("closed", "CLOSED"), connection("disabled", "ACCEPTED", false),
  ], linked, [{ conversationId: "neutral", discoveryConnectionId: "older" }], true);
  expect(inbox.chats.map(({ href, unread }) => [href, unread])).toEqual([
    ["/connections/older", true], ["/messages/shared", false], ["/connections/active", false],
  ]);
  expect(inbox.invitations.map(row => row.href)).toEqual(["/connections/request"]);
  expect(inbox.history.map(row => row.href)).toEqual(["/connections/closed", "/connections/disabled"]);
});

it("deduplicates the locked-in conversation even when unread notifications use the neutral ID", () => {
  const inbox = inboxEntries([connection("original", "PROMOTED", true)], {
    ...linked, opening: { connectionId: "original", author: "self", questionText: "Support", hello: "Hi", ...partner },
  }, [{ conversationId: "shared", discoveryConnectionId: null }], true);
  expect(inbox.chats.map(({ href, unread }) => [href, unread])).toEqual([["/connections/original", true]]);
  expect(inbox.offPageUnread).toBeUndefined();
});

it("keeps an unread chat outside the current page reachable", () => {
  const inbox = inboxEntries([], linked, [{ conversationId: "shared", discoveryConnectionId: null },
    { conversationId: "older-chat", discoveryConnectionId: "older" }], false);
  expect(inbox.chats[0].unread).toBe(true);
  expect(inbox.offPageUnread).toBe("/connections/older");
});

it("keeps direct chat independent of Discovery but omits a blocked or closed shared chat", () => {
  const inbox = inboxEntries([connection("legacy", "ACCEPTED", true)], linked, [], false);
  expect(inbox.chats.map(row => row.href)).toEqual(["/messages/shared"]);
  expect(inboxEntries([], { ...linked, canChat: false, unavailableReason: "UNAVAILABLE" }, [], false).chats).toEqual([]);
});

it("uses the partner name and Lock In status without labeling unverified or ordinary chats as locked", () => {
  const placeholder = { ...linked, partner: { publicName: "Your partner", avatarPreset: "initials" } };
  const pair = { lockedIn: true, partnerName: "Cindy" };
  expect(inboxEntries([], placeholder, [], false, [], pair).chats[0]).toMatchObject({
    partner: { publicName: "Cindy" }, status: "Locked in", detail: "Your private chat",
  });
  expect(inboxEntries([], linked, [], false, [], pair).chats[0].partner.publicName).toBe("Sam");
  expect(inboxEntries([], linked, [], false, [], { lockedIn: false }).chats[0].status).toBe("Shared space");
  const unverified = { ...placeholder, canChat: false, unavailableReason: "VERIFY_EMAIL" as const };
  expect(inboxEntries([], unverified, [], false, [], pair).chats[0]).toMatchObject({ partner: placeholder.partner, status: "Verify email to chat" });
});

it("shows an accepted direct invite without Together and does not duplicate a reused Discovery chat", () => {
  const inbox = inboxEntries([connection("reused", "ACCEPTED", true)], null,
    [{ conversationId: "reused", discoveryConnectionId: null }], true,
    [{ conversationId: "reused", discoveryConnectionId: "reused", partner }]);
  expect(inbox.chats.map(({ href, unread }) => [href, unread])).toEqual([["/messages/reused", true]]);
  expect(inbox.offPageUnread).toBeUndefined();
});
