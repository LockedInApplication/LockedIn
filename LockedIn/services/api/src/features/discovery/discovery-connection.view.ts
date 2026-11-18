import type { DiscoveryConnection, DiscoveryDraft, DiscoverySharedResponse } from "../../../generated/prisma/client.js";

export function effectiveDiscoveryState(connection: DiscoveryConnection, now = new Date()) {
  return connection.state === "PENDING" && connection.expiresAt <= now ? "EXPIRED" as const : connection.state;
}
export function discoveryConnectionView(
  connection: DiscoveryConnection & { drafts: DiscoveryDraft[]; sharedResponses: DiscoverySharedResponse[] },
  actorId: string, partner: { publicName: string; avatarPreset: string }, eligible: boolean, linkedMembership: boolean, buildAvailable: boolean,
) {
  const state = effectiveDiscoveryState(connection);
  const mine = actorId === connection.userLowId ? connection.lowLockInVersion : connection.highLockInVersion;
  const theirs = actorId === connection.userLowId ? connection.highLockInVersion : connection.lowLockInVersion;
  return {
    id: connection.id, state, topic: { key: connection.questionKey, text: connection.questionText }, hello: connection.hello,
    inviter: connection.inviterId === actorId ? "self" as const : "partner" as const,
    senderSnapshot: { publicName: connection.senderPublicName, avatarPreset: connection.senderAvatarPreset }, partner,
    // Compatibility field for older clients; retired private drafts are never returned.
    ownDraft: null,
    sharedResponses: connection.sharedResponses.map(response => ({ id: response.id, author: response.ownerId === actorId ? "self" as const : "partner" as const, text: response.text, version: response.version, sharedAt: response.sharedAt.toISOString() })),
    readiness: { mine: state === "ACCEPTED" && mine === connection.consentVersion, theirs: state === "ACCEPTED" && theirs === connection.consentVersion, consentVersion: connection.consentVersion },
    promotedRelationshipId: linkedMembership ? connection.relationshipId : null,
    lockedIn: connection.lockedInAt !== null,
    canAccept: state === "PENDING" && connection.inviterId !== actorId && eligible,
    canShare: false,
    canClose: state === "PENDING" || state === "ACCEPTED",
    canChooseBuild: state === "ACCEPTED" && eligible && buildAvailable,
  };
}
