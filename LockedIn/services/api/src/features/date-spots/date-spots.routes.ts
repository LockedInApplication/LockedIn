import { Prisma, type ChatConversation, type DateSpotRequest } from "../../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chatParams, emptyChatInput, requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { prisma } from "../../lib/prisma.js";
import { currentDiscoveryLocation, discoveryLocationPolicy } from "../discovery/discovery-location.js";
import { publicDiscoveryProfile } from "../discovery/discovery-profile.view.js";
import { consumeDiscoveryQuota } from "../discovery/discovery-throttle.service.js";
import { chatMissing, openConversation } from "../messaging/messaging-access.service.js";
import { messageScope, sendMessage } from "../messaging/messaging-message.service.js";
import { respondMessaging } from "../messaging/messaging.routes.js";
import { notificationBroker } from "../notifications/notification.broker.js";
import { datePlansEnabled } from "../date-plans/date-plan-config.js";
import { readPlanVenueId } from "../date-plans/date-plan-service.js";
import { dateSpotsAvailable } from "./date-spots-config.js";
import { getPlaceProvider, type PlaceProvider } from "./date-spots-provider.js";
import { mapInterests, meetupAreas, preferencesSchema, rankVenues, searchCategories, searchWindow, type Preferences } from "./date-spots-ranking.js";
import { dateSpotTicket, readDateSpotTicket } from "./date-spots-ticket.js";

const uuid = z.string().uuid(), ticket = z.string().min(16).max(2400);
const setup = { preferences: preferencesSchema, remember: z.boolean().optional() };
const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("solo"), ...setup }),
  z.strictObject({ action: z.literal("start"), ...setup }),
  z.strictObject({ action: z.literal("accept"), id: uuid, ...setup }),
  z.strictObject({ action: z.enum(["cancel", "mutual"]), id: uuid }),
  z.strictObject({ action: z.literal("forget") }),
  z.strictObject({ action: z.literal("share"), ticket, requestId: uuid }),
  z.strictObject({ action: z.literal("details"), ticket }),
  z.strictObject({ action: z.literal("sharedDetails"), messageId: uuid }),
  z.strictObject({ action: z.literal("planDetails"), planId: uuid }),
]);
const invalidArea = { ok: false as const, status: 400, error: "Choose an available meetup area." };
const stale = { ok: false as const, status: 409, error: "This date-spot request changed. Refresh and try again." };
const invalidSpot = { ok: false as const, status: 404, error: "This place is not available. Try searching again." };
const success = <T>(value: T) => ({ ok: true as const, value });
const day = 86_400_000;
function requestView(row: DateSpotRequest | null, owner: string) {
  return row && row.expiresAt > new Date()
    ? { id: row.id, from: row.initiatorId === owner ? "self" : "partner", state: row.joinsWith ? "ready" : "pending", expiresAt: row.expiresAt.toISOString() }
    : null;
}
const notify = (conversation: ChatConversation) => {
  for (const id of [conversation.userLowId, conversation.userHighId]) notificationBroker.publish(id, false, "chat");
};

export function registerDateSpotRoutes(server: FastifyInstance, injected?: PlaceProvider) {
  const path = "/api/messaging/conversations/:id/date-spots";
  server.get(path, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!dateSpotsAvailable()) return sendError(reply,404,chatMissing.error);
    const params = chatParams.safeParse(request.params);
    if (!params.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply,400,"Invalid date-spot request.");
    const areas = meetupAreas();
    const result = await prisma.$transaction(async tx => {
      const c = await openConversation(tx, params.data.id, user.id); if (!c) return chatMissing;
      const saved = await tx.dateSpotPreference.findUnique({ where: { userId: user.id } });
      const profile = await tx.discoveryProfile.findUnique({ where: { ownerId: user.id } });
      const policy = discoveryLocationPolicy();
      const current = profile && policy.mode === "metro" ? await currentDiscoveryLocation(tx, profile.id, new Date(), policy) : null;
      const own = profile && publicDiscoveryProfile(profile.id, profile.publishedSnapshot);
      const row = await tx.dateSpotRequest.findUnique({ where: { conversationId: c.id } });
      if (row && row.expiresAt <= new Date()) await tx.dateSpotRequest.delete({ where: { conversationId: c.id } });
      const area = [saved?.areaId, current?.areaId].find(id => areas.some(item => item.areaId === id)) ?? null;
      return success({
        areas: areas.map(({ areaId, label }) => ({ areaId,label })), areaId: area, remembered: !!saved && area === saved.areaId,
        interests: mapInterests(saved?.interests ?? own?.interests ?? []), request: requestView(row,user.id),
      });
    });
    return respondMessaging(reply,user.id,result);
  });
  server.post(path, { bodyLimit: 4096 }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const actor = await requireAccountMutationIdentity(request,reply,"x-messaging-owner"); if (!actor) return;
    const provider = injected ?? getPlaceProvider(), secret = process.env.BETTER_AUTH_SECRET;
    if (!dateSpotsAvailable() || !provider || !secret) return sendError(reply,404,chatMissing.error);
    const params = chatParams.safeParse(request.params), body = inputSchema.safeParse(request.body);
    if (!params.success || !body.success || !emptyChatInput.safeParse(request.query).success) return sendError(reply,400,"Invalid date-spot request.");
    const owner = actor.userId, id = params.data.id, input = body.data, areas = meetupAreas();
    const planDetails = input.action === "planDetails";
    if (planDetails && !datePlansEnabled()) return sendError(reply,404,chatMissing.error);
    const findArea = (key: string) => areas.find(area => area.areaId === key);
    const remember = (tx: Prisma.TransactionClient, preferences: Preferences) => tx.dateSpotPreference.upsert({ where: { userId: owner }, create: { userId: owner, ...preferences }, update: preferences });
    const resolve = async () => prisma.$transaction(async tx => {
      const c = await openConversation(tx,id,owner,planDetails); if (!c) return chatMissing;
      if (input.action === "forget") {
        await tx.dateSpotPreference.deleteMany({ where: { userId: owner } });
        return success({ status: "forgotten" as const });
      }
      if (input.action === "share") {
        const valid = readDateSpotTicket(input.ticket,id,owner,secret);
        if (!valid) return invalidSpot;
        const result = await sendMessage(tx,c,owner,{ text: `Suggested date spot: ${valid.name}`, dateSpotPlaceId: valid.place, requestId: input.requestId });
        return result.ok ? { ...success({ status: "shared" as const, message: result.value }), ...(result.notify ? { signal: c } : {}) } : result;
      }
      if (input.action === "details" || input.action === "sharedDetails" || input.action === "planDetails") {
        const place = input.action === "details" ? readDateSpotTicket(input.ticket,id,owner,secret)?.place
          : input.action === "planDetails" ? await readPlanVenueId(tx,c,input.planId)
            : (await tx.discoveryMessage.findFirst({ where: { ...messageScope(c), id: input.messageId }, select: { dateSpotPlaceId: true } }))?.dateSpotPlaceId;
        if (!place) return invalidSpot;
        const quota = await consumeDiscoveryQuota(tx,owner,"dateSpots"); if (!quota.ok) return quota;
        return success({ status: "lookup" as const, place });
      }
      if ("preferences" in input && !findArea(input.preferences.areaId)) return invalidArea;
      if (input.action === "solo") {
        const quota = await consumeDiscoveryQuota(tx,owner,"dateSpots"); if (!quota.ok) return quota;
        if (input.remember) await remember(tx,input.preferences);
        return success({ status: "search" as const, a: input.preferences, b: null, mutualId: null });
      }
      const stored = await tx.dateSpotRequest.findUnique({ where: { conversationId: id } });
      const row = stored && stored.expiresAt > new Date() ? stored : null;
      if (input.action === "start") {
        if (row) return success({ status: "request" as const, request: requestView(row,owner) });
        const quota = await consumeDiscoveryQuota(tx,owner,"dateSpotInvite"); if (!quota.ok) return quota;
        if (input.remember) await remember(tx,input.preferences);
        const data = { initiatorId: owner, startsWith: input.preferences, expiresAt: new Date(Date.now() + day) };
        const created = await tx.dateSpotRequest.upsert({ where: { conversationId:id }, create: { conversationId:id,...data }, update: { ...data, id: crypto.randomUUID(), joinsWith: Prisma.DbNull } });
        return { ...success({ status: "request" as const, request: requestView(created,owner) }), signal: c };
      }
      if (!row || row.id !== input.id) return stale;
      if (input.action === "cancel") {
        await tx.dateSpotRequest.delete({ where: { conversationId:id } });
        return { ...success({ status: "request" as const, request:null }), signal: c };
      }
      if (input.action === "accept") {
        if (row.initiatorId === owner) return stale;
        if (row.joinsWith) return success({ status: "request" as const, request: requestView(row,owner) });
        if (input.remember) await remember(tx,input.preferences);
        const updated = await tx.dateSpotRequest.update({ where: { conversationId:id }, data: { joinsWith: input.preferences } });
        return { ...success({ status: "request" as const, request: requestView(updated,owner) }), signal: c };
      }
      const a = preferencesSchema.safeParse(row.startsWith), b = preferencesSchema.safeParse(row.joinsWith);
      if (!a.success || !b.success) return stale;
      if (!findArea(a.data.areaId) || !findArea(b.data.areaId)) return invalidArea;
      const quota = await consumeDiscoveryQuota(tx,owner,"dateSpots"); if (!quota.ok) return quota;
      return success({ status: "search" as const, a:a.data, b:b.data, mutualId:row.id });
    });
    const result = await resolve();
    if (!result.ok) return respondMessaging(reply,owner,result);
    if ("signal" in result && result.signal) notify(result.signal);
    const authorized = (mutualId?: string | null) => prisma.$transaction(async tx => {
      if (!await openConversation(tx,id,owner,planDetails)) return false;
      if (!mutualId) return true;
      const current = await tx.dateSpotRequest.findUnique({ where: { conversationId:id } });
      return current?.id === mutualId && !!current.joinsWith && current.expiresAt > new Date();
    });
    try {
      if (result.value.status === "lookup") {
        const venue = await provider.details(result.value.place);
        if (!await authorized()) return respondMessaging(reply,owner,chatMissing);
        if (!venue) return respondMessaging(reply,owner,invalidSpot);
        return respondMessaging(reply,owner,success({ status:"details", venue }));
      }
      if (result.value.status === "search") {
        const { a,b,mutualId } = result.value, first = findArea(a.areaId)!, second = b ? findArea(b.areaId)! : undefined;
        const window = searchWindow(first,second);
        if (!window) return respondMessaging(reply,owner,success({ status:"suggestions", items: [], reason:"too-far" }));
        const categories = searchCategories(a.interests,b?.interests), common = a.interests.filter(item => b?.interests.includes(item));
        const betterFit = common.length ? searchCategories(common) : [];
        const candidates = await provider.search(window.center,window.radiusKm,categories);
        if (betterFit.length && betterFit.length < categories.length) {
          try { candidates.push(...await provider.search(window.center,window.radiusKm,betterFit)); } catch { /* Main results are still usable. */ }
        }
        if (!await authorized(mutualId)) return respondMessaging(reply,owner,chatMissing);
        const items = rankVenues(candidates,first,a.interests,second,b?.interests).map(({ id:place,name,address,reason }) => ({
          ticket: dateSpotTicket(id,owner,place,name,secret), name,address,reason,
        }));
        return respondMessaging(reply,owner,success({ status:"suggestions", items, reason: items.length ? null : "no-results" }));
      }
      return respondMessaging(reply,owner,success(result.value));
    } catch {
      return sendError(reply,503,"Place suggestions are temporarily unavailable. Try again.");
    }
  });
}
