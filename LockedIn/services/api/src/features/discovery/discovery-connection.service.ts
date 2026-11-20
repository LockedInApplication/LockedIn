import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import type { DiscoveryConnection, Prisma } from "../../../generated/prisma/client.js";
import { invitationBlockBetween } from "../invitations/invitation-access.service.js";
import { hasDiscoveryPublication, isDiscoveryAdmitted } from "./discovery-profile.service.js";
import { publicDiscoveryProfile } from "./discovery-profile.view.js";
import { consumeDiscoveryQuota } from "./discovery-throttle.service.js";
import { discoveryInvitationSchema } from "./discovery.schemas.js";
import { discoveryTopics } from "./discovery-topics.js";
import { intentionsMatch, photoPrompts, profilePrompt, profilePromptKey, writtenPrompts } from "./discovery-matching.js";
import { enrichPublishedPhotos } from "./photos/photo-cards.service.js";
import { discoveryLocationRequired, discoverySearchPairEligible } from "./discovery-location.js";
import { connectionAllowsChat, isDiscoveryLockedIn } from './discovery-lock-in.js';
import { lockDiscoveryConnection, lockDiscoveryUsers } from "./discovery-locks.js";
import { discoveryConnectionView, effectiveDiscoveryState } from "./discovery-connection.view.js";
import type { DiscoveryResult } from "./discovery.types.js";
import { persistDiscoveryTask, publishDiscoveryEffects, resolveDiscoveryTasks, type DiscoveryNotify } from "./discovery-notifications.service.js";
import { ensureDiscoveryConversation, samePairRelationshipConflict } from "../messaging/messaging-conversation.service.js";
import { conversationAllowsChat } from "../messaging/messaging-access.service.js";
import { sharedMessagingEnabled } from "../messaging/messaging.config.js";
import { closeDiscoveryConversationUnderLock } from "../messaging/messaging-lifecycle.service.js";
import { dateSpotsAvailable } from "../date-spots/date-spots-config.js";
import { datePlansEnabled } from "../date-plans/date-plan-config.js";
import { requireMutualDiscoveryFit } from "./discovery-match-eligibility.js";
import { discoveryMatchPreferencesRequired } from "./discovery-match-preferences.service.js";

const week = 7 * 86400000;
const missing = { ok: false as const, status: 404, error: "This connection is not available." };
const unavailable = { ok: false as const, status: 409, error: "This action is not available right now." };
const denied = { ok: false as const, status: 403, error: "Discovery is not available for this account." };
const invalid = { ok: false as const, status: 400, error: "Please check your discovery invitation." };
const participants = (id: string): Prisma.DiscoveryConnectionWhereInput => ({ OR: [{ userLowId: id }, { userHighId: id }] });
const member = (row: DiscoveryConnection, id: string) => row.userLowId === id || row.userHighId === id;

export async function discoveryPairEligible(tx: Prisma.TransactionClient, row: DiscoveryConnection) {
  if (await invitationBlockBetween(tx, row.userLowId, row.userHighId)) return false;
  for (const id of [row.userLowId, row.userHighId]) {
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: id } });
    if (!await isDiscoveryAdmitted(tx, id, profile) || !profile || !hasDiscoveryPublication({ ...profile, pausedAt: null })) return false;
  }
  return true;
}
async function pendingDiscoverySearchEligible(tx: Prisma.TransactionClient, row: DiscoveryConnection, now: Date) {
  if (!discoveryMatchPreferencesRequired()) return true;
  if (!await requireMutualDiscoveryFit(tx, row.userLowId, row.userHighId, now)) return false;
  const profiles = await tx.discoveryProfile.findMany({ where: { ownerId: { in: [row.userLowId, row.userHighId] } } });
  const [left, right] = profiles;
  return !!left && !!right && hasDiscoveryPublication(left) && hasDiscoveryPublication(right)
    && intentionsMatch(left.publishedIntention, right.publishedIntention)
    && await discoverySearchPairEligible(tx, left.id, right.id);
}
export async function connectionValue(tx: Prisma.TransactionClient, row: DiscoveryConnection, actorId: string) {
  const stored = await tx.discoveryConnection.findUniqueOrThrow({ where: { id: row.id }, include: { sharedResponses: { orderBy: [{ sharedAt: "asc" }, { id: "asc" }] } } });
  const connection = { ...stored, drafts: [] };
  const partnerId = row.userLowId === actorId ? row.userHighId : row.userLowId;
  const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: partnerId }, select: { id: true, publishedSnapshot: true } });
  const published = profile ? publicDiscoveryProfile(profile.id, profile.publishedSnapshot) : null;
  const partner = row.inviterId !== actorId ? { publicName: row.senderPublicName, avatarPreset: row.senderAvatarPreset } : { publicName: published?.publicName ?? "Your connection", avatarPreset: published?.avatarPreset ?? "leaf" };
  const linkedMembership = !!row.relationshipId && !!await tx.relationshipMember.findFirst({ where: { relationshipId: row.relationshipId, userId: actorId }, select: { id: true } });
  const occupied = await tx.relationship.findFirst({ where: { status: "ACTIVE", members: { some: { userId: { in: [row.userLowId, row.userHighId] } } } }, select: { id: true } });
  const eligible = await discoveryPairEligible(tx, row);
  const lockedIn = await isDiscoveryLockedIn(tx, row.userLowId) || await isDiscoveryLockedIn(tx, row.userHighId);
  const eligibleForAction = eligible && !lockedIn && (row.state !== "PENDING" || row.inviterId === actorId || await pendingDiscoverySearchEligible(tx, row, new Date()));
  const dateSpots = dateSpotsAvailable();
  const datePlans = datePlansEnabled();
  const chat = sharedMessagingEnabled() || dateSpots || datePlans ? await tx.chatConversation.findUnique({ where: { discoveryConnectionId: row.id } }) : null;
  const canChat = chat?.accessMode === "RELATIONSHIP" ? await conversationAllowsChat(tx, chat) : eligible && await connectionAllowsChat(tx, row);
  return { ok: true as const, value: { ...discoveryConnectionView(connection, actorId, partner, eligibleForAction, linkedMembership, !occupied), canChat,
    ...(dateSpots && chat && canChat ? { dateSpotsConversationId: chat.id } : {}),
    ...(datePlans && chat && canChat ? { datePlansConversationId: chat.id } : {}) } };
}
type ConnectionResult = DiscoveryResult<ReturnType<typeof discoveryConnectionView>>;

export async function sendDiscoveryInvitation(actorId: string, input: z.infer<typeof discoveryInvitationSchema>): Promise<ConnectionResult> {
  const parsed = discoveryInvitationSchema.safeParse(input); if (!parsed.success) return invalid;
  const data = parsed.data;
  const effects = new Map<string, boolean>();
  const result = await prisma.$transaction(async tx => {
    const target = await tx.discoveryProfile.findUnique({ where: { id: data.targetProfileId }, select: { ownerId: true } });
    if (!target || target.ownerId === actorId) return missing;
    const ordered = await lockDiscoveryUsers(tx, [actorId, target.ownerId]);
    if (ordered.length !== 2) return missing;
    const replay = await tx.discoveryConnection.findUnique({ where: { inviterId_requestId: { inviterId: actorId, requestId: data.requestId } } });
    if (replay) {
      if (!member(replay, target.ownerId) || replay.questionKey !== data.topicKey || replay.hello !== data.hello) return unavailable;
      return connectionValue(tx, replay, actorId);
    }
    const actor = await tx.discoveryProfile.findUnique({ where: { ownerId: actorId } });
    if (!await isDiscoveryAdmitted(tx, actorId, actor)) return denied;
    if (await isDiscoveryLockedIn(tx, actorId)) return unavailable;
    if (!hasDiscoveryPublication(actor)) return denied;
    // A hidden target must not reveal why it is unavailable, even to stale
    // tabs, blocked callers or callers holding a previously public profile ID.
    if (await isDiscoveryLockedIn(tx, target.ownerId)) return missing;
    const partner = await tx.discoveryProfile.findUnique({ where: { id: data.targetProfileId } });
    if (!partner || !await isDiscoveryAdmitted(tx, target.ownerId, partner) || !hasDiscoveryPublication(partner) || !intentionsMatch(actor.publishedIntention, partner.publishedIntention) || await invitationBlockBetween(tx, actorId, target.ownerId) || !await discoverySearchPairEligible(tx, actor.id, partner.id)) return missing;
    const now = new Date();
    if (!await requireMutualDiscoveryFit(tx, actorId, target.ownerId, now)) return missing;
    const overlap = await samePairRelationshipConflict(tx, actorId, target.ownerId); if (overlap) return overlap;
    let replyQuestion = profilePrompt;
    if (data.topicKey === profilePromptKey) {
      const published = publicDiscoveryProfile(partner.id, partner.publishedSnapshot);
      if (data.replyPhotoId) {
        if (!published?.photoIds?.includes(data.replyPhotoId)) return missing;
        const [visible] = await enrichPublishedPhotos(tx, [published]);
        if (!visible?.photos?.some(photo => photo.id === data.replyPhotoId)) return missing;
        const prompt = visible.photoPrompts?.find(item => item.photoId === data.replyPhotoId);
        const position = published.photoIds.indexOf(data.replyPhotoId) + 1;
        replyQuestion = `About photo ${position}${prompt ? `: ${photoPrompts[prompt.key]}` : ""}`;
      } else {
        const answer = data.replyPromptKey
          ? published?.prompts?.find(item => item.key === data.replyPromptKey)?.answer ?? (data.replyPromptKey === "showing_up" && !published?.prompts ? published?.promptAnswer : undefined)
          : published?.promptAnswer;
        if (answer !== data.expectedPromptAnswer) return { ok: false as const, status: 409, error: "This profile answer changed. Reopen their profile before replying." };
        if (data.replyPromptKey) replyQuestion = writtenPrompts[data.replyPromptKey];
      }
    }
    const userLowId = ordered[0]!.id, userHighId = ordered[1]!.id;
    // Expire only this locked pair. Other expired rows are excluded from capacity
    // without acquiring third-account locks or mutating their history.
    await tx.discoveryConnection.updateMany({ where: { userLowId, userHighId, state: "PENDING", expiresAt: { lte: now } }, data: { state: "EXPIRED", lowReadinessVersion: null, highReadinessVersion: null } });
    if (await tx.discoveryConnection.findFirst({ where: { userLowId, userHighId, OR: [{ state: { in: ["PENDING", "ACCEPTED"] } }, { state: "PROMOTED", relationship: { status: "ACTIVE" } }] }, select: { id: true } })) return unavailable;
    if (await tx.discoveryConnection.findFirst({ where: { userLowId, userHighId, inviterId: actorId, state: "DECLINED", declinedAt: { gt: new Date(now.getTime() - week) } }, select: { id: true } })) return unavailable;
    for (const id of [actorId, target.ownerId]) {
      const count = await tx.discoveryConnection.count({ where: { AND: [participants(id), { OR: [{ state: "ACCEPTED" }, { state: "PENDING", expiresAt: { gt: now } }] }] } });
      if (count >= 3) return unavailable;
    }
    const quota = await consumeDiscoveryQuota(tx, actorId, "invite", now); if (!quota.ok) return quota;
    const sender = publicDiscoveryProfile(actor.id, actor.publishedSnapshot)!;
    const topic = data.topicKey === profilePromptKey ? { key: profilePromptKey, text: replyQuestion } : discoveryTopics.find(topic => topic.key === data.topicKey)!;
    const row = await tx.discoveryConnection.create({ data: { userLowId, userHighId, inviterId: actorId, requestId: data.requestId, questionKey: topic.key, questionText: topic.text, hello: data.hello, senderPublicName: sender.publicName, senderAvatarPreset: sender.avatarPreset, expiresAt: new Date(now.getTime() + week) } });
    effects.set(actorId, false);
    effects.set(target.ownerId, await persistDiscoveryTask(tx, row.id, target.ownerId, "DISCOVERY_INVITED", "sent"));
    return connectionValue(tx, row, actorId);
  });
  await publishDiscoveryEffects(effects);
  return result;
}

export async function withDiscoveryConnection(actorId: string, id: string, action: (tx: Prisma.TransactionClient, row: DiscoveryConnection, notify: DiscoveryNotify) => Promise<ConnectionResult>): Promise<ConnectionResult> {
  if (!z.string().uuid().safeParse(id).success) return invalid;
  const effects = new Map<string, boolean>();
  const notify: DiscoveryNotify = (recipient, activity) => effects.set(recipient, !!effects.get(recipient) || activity);
  const result = await prisma.$transaction(async tx => {
    const found = await tx.discoveryConnection.findUnique({ where: { id } });
    if (!found || !member(found, actorId)) return missing;
    await lockDiscoveryUsers(tx, [found.userLowId, found.userHighId]);
    await lockDiscoveryConnection(tx, id);
    let row = await tx.discoveryConnection.findUniqueOrThrow({ where: { id } });
    if (effectiveDiscoveryState(row) === "EXPIRED" && row.state === "PENDING") {
      row = await tx.discoveryConnection.update({ where: { id }, data: { state: "EXPIRED", lowReadinessVersion: null, highReadinessVersion: null } });
      await resolveDiscoveryTasks(tx, id);
    }
    const value = await action(tx, row, notify);
    const after = await tx.discoveryConnection.findUniqueOrThrow({ where: { id } });
    if (found.updatedAt.getTime() !== after.updatedAt.getTime() || found.state !== after.state) { notify(row.userLowId, false); notify(row.userHighId, false); }
    return value;
  });
  await publishDiscoveryEffects(effects);
  return result;
}
async function transition(actorId: string, id: string, action: "accept" | "decline" | "withdraw" | "close"): Promise<ConnectionResult> {
  return withDiscoveryConnection(actorId, id, async (tx, row, notify) => {
    const now = new Date();
    if (action === "close" && row.state === "PROMOTED" && row.lockedInAt) {
      if (!row.closedAt) await tx.discoveryConnection.update({ where: { id }, data: { closedAt: new Date() } });
      await closeDiscoveryConversationUnderLock(tx,id);
      return connectionValue(tx,await tx.discoveryConnection.findUniqueOrThrow({ where: { id } }),actorId);
    }
    if (action === "accept") {
      const overlap = await samePairRelationshipConflict(tx, row.userLowId, row.userHighId); if (overlap && row.state === "PENDING") return overlap;
    }
    // Terminal retries never reopen consent or extend decline dates.
    if (!["PENDING", "ACCEPTED"].includes(row.state)) return connectionValue(tx, row, actorId);
    if (action === "accept" || action === "decline") {
      if (row.inviterId === actorId || row.state !== "PENDING") {
        if (action === "accept" && row.state === "ACCEPTED" && row.inviterId !== actorId) return connectionValue(tx, row, actorId);
        return unavailable;
      }
      if (action === "accept" && (!await discoveryPairEligible(tx, row) || await isDiscoveryLockedIn(tx, row.userLowId) || await isDiscoveryLockedIn(tx, row.userHighId))) return unavailable;
      if (action === "accept" && discoveryLocationRequired() && !discoveryMatchPreferencesRequired()) {
        const profiles = await tx.discoveryProfile.findMany({ where: { ownerId: { in: [row.userLowId, row.userHighId] } }, select: { id: true } });
        if (profiles.length !== 2 || !await discoverySearchPairEligible(tx, profiles[0]!.id, profiles[1]!.id)) return { ok: false as const, status: 403, error: "This invitation is not available for local Discovery right now." };
      }
      if (action === "accept" && !await pendingDiscoverySearchEligible(tx, row, now)) return unavailable;
    }
    if (action === "withdraw" && (row.inviterId !== actorId || row.state !== "PENDING")) return unavailable;
    const quota = await consumeDiscoveryQuota(tx, actorId, "mutation"); if (!quota.ok) return quota;
    const updated = await tx.discoveryConnection.update({ where: { id }, data: action === "accept" ? { state: "ACCEPTED", acceptedAt: now } : { state: action === "decline" ? "DECLINED" : action === "withdraw" ? "WITHDRAWN" : "CLOSED", ...(action === "decline" ? { declinedAt: now } : { closedAt: now }), lowReadinessVersion: null, highReadinessVersion: null, consentVersion: { increment: 1 } } });
    if (action === "accept") await ensureDiscoveryConversation(tx, id);
    if (action === "close") await closeDiscoveryConversationUnderLock(tx,id);
    await resolveDiscoveryTasks(tx, id);
    if (action === "accept") notify(row.inviterId, await persistDiscoveryTask(tx, id, row.inviterId, "DISCOVERY_ACCEPTED", "accepted"));
    return connectionValue(tx, updated, actorId);
  });
}
export const respondDiscoveryInvitation = (actorId: string, id: string, action: "accept" | "decline") => transition(actorId, id, action);
export const withdrawDiscoveryInvitation = (actorId: string, id: string) => transition(actorId, id, "withdraw");
export const closeDiscoveryConnection = (actorId: string, id: string) => transition(actorId, id, "close");
export const getDiscoveryConnection = (actorId: string, id: string) => withDiscoveryConnection(actorId, id, (tx, row) => connectionValue(tx, row, actorId));
export async function listDiscoveryConnections(actorId: string, before?: string) {
  if (before && !z.string().uuid().safeParse(before).success) return invalid;
  return prisma.$transaction(async tx => {
    const rows = await tx.discoveryConnection.findMany({ where: { ...participants(actorId), ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: "desc" }, take: 21 });
    const items = await Promise.all(rows.slice(0, 20).map(async row => (await connectionValue(tx, row, actorId)).value));
    return { ok: true as const, value: { items, nextCursor: rows.length > 20 ? rows[19]!.id : null } };
  });
}
