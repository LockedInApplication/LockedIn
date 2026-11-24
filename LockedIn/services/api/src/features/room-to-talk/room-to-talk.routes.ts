import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import {
  addRoomMessage, addRoomShelf, addRoomTopic, fileRoomTopic, listRoom, roomConversation,
  RoomTalkError, saveForInPerson, transitionRoomTopic, updateRoomPresence,
} from "./room-to-talk.service.js";

const base = "/api/journey/relationships/:relationshipId/room-to-talk";
const topicPath = `${base}/topics/:topicId`;
const presencePath = `${topicPath}/presence/:viewerId`;
const uuid = z.uuid();
const space = z.strictObject({ relationshipId: uuid });
const topic = space.extend({ topicId: uuid });
const presence = topic.extend({ viewerId: uuid });
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\u0000"));
const shelf = z.union([uuid, z.enum(["marriage", "date-ideas", "unsorted"])]);
const shelfInput = z.strictObject({ id: uuid, name: text(48) });
const topicInput = z.strictObject({ id: uuid, question: text(200), shelf });
const transition = z.union([
  z.strictObject({ action: z.enum(["suggest", "withdraw", "start", "later", "reopen"]) }),
  z.strictObject({ action: z.literal("discuss"), takeaway: text(280).nullable() }),
]);
const messageInput = z.strictObject({ id: uuid, kind: z.enum(["REPLY", "QUESTION"]), body: text(420), replyToId: uuid.nullable() });
const page = z.strictObject({ before: uuid.optional() });
const inPersonInput = z.strictObject({ saved: z.boolean() });
const fileInput = z.strictObject({ shelf });
const small = { bodyLimit: 4096 };

function route<P>(
  params: z.ZodType<P>, write: boolean,
  action: (params: P, actor: string, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "private, no-store");
    const actor = write ? (await requireAccountMutationIdentity(request, reply, "x-together-owner"))?.userId
      : (await requireUser(request, reply))?.id;
    if (!actor) return;
    const parsed = params.safeParse(request.params);
    if (!parsed.success) return sendError(reply, 404, "This Room to Talk item is not available.");
    try {
      return await action(parsed.data, actor, request, reply);
    } catch (error) {
      if (error instanceof RoomTalkError) return sendError(reply, error.status, error.message);
      throw error;
    }
  };
}

function body<T>(schema: z.ZodType<T>, request: FastifyRequest, message = "Check your changes and try again."): T {
  const input = schema.safeParse(request.body);
  if (!input.success) throw new RoomTalkError(400, message);
  return input.data;
}

export async function registerRoomTalkRoutes(server: FastifyInstance) {
  server.get(base, route(space, false, async ({ relationshipId }, actor) => listRoom(relationshipId, actor)));
  server.post(`${base}/shelves`, small, route(space, true, async ({ relationshipId }, actor, request, reply) =>
    reply.code(201).send(await addRoomShelf(relationshipId, actor, body(shelfInput, request, "Give the shelf a name of up to 48 characters.")))));
  server.post(`${base}/topics`, small, route(space, true, async ({ relationshipId }, actor, request, reply) =>
    reply.code(201).send(await addRoomTopic(relationshipId, actor, body(topicInput, request, "Write a topic of up to 200 characters and choose its shelf.")))));
  server.put(`${topicPath}/shelf`, small, route(topic, true, async ({ relationshipId, topicId }, actor, request) =>
    fileRoomTopic(relationshipId, actor, topicId, body(fileInput, request).shelf)));
  server.post(`${topicPath}/state`, small, route(topic, true, async ({ relationshipId, topicId }, actor, request) =>
    transitionRoomTopic(relationshipId, actor, topicId, body(transition, request))));
  server.put(`${topicPath}/in-person`, small, route(topic, true, async ({ relationshipId, topicId }, actor, request) =>
    saveForInPerson(relationshipId, actor, topicId, body(inPersonInput, request).saved)));
  server.get(`${topicPath}/messages`, route(topic, false, async ({ relationshipId, topicId }, actor, request) => {
    const query = page.safeParse(request.query);
    if (!query.success) throw new RoomTalkError(400, "That page of replies could not be opened.");
    return roomConversation(relationshipId, actor, topicId, query.data.before);
  }));
  server.post(`${topicPath}/messages`, small, route(topic, true, async ({ relationshipId, topicId }, actor, request, reply) =>
    reply.code(201).send(await addRoomMessage(relationshipId, actor, topicId, body(messageInput, request, "Write a reply or follow-up of up to 420 characters.")))));
  server.put(presencePath, small, route(presence, true, async ({ relationshipId, topicId, viewerId }, actor) =>
    updateRoomPresence(relationshipId, actor, topicId, viewerId, true)));
  server.delete(presencePath, route(presence, true, async ({ relationshipId, topicId, viewerId }, actor) =>
    updateRoomPresence(relationshipId, actor, topicId, viewerId, false)));
}
