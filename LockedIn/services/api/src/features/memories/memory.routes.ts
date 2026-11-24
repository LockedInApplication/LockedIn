import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAccountMutationIdentity } from "../../lib/account-mutation-http.js";
import { requireUser, sendError } from "../../lib/journey-http.js";
import { MemoryError, maxPhotoUploadBytes, maxVoiceUploadBytes, normalizeMemoryPhoto, validateMemoryVoice } from "./memory-media.js";
import { addMemoryPhoto, addMemoryPin, assertMemoryAccess, deleteMemoryPhoto, listMemories, readMemoryPhoto, readMemoryVoice, removeMemoryNotePart, shareMemoryNote } from "./memory.service.js";

const base = "/api/journey/relationships/:relationshipId/memories";
const id = z.uuid();
const relationship = z.strictObject({ relationshipId: id });
const photo = relationship.extend({ photoId: id });
const pin = photo.extend({ pinId: id });
const voice = pin.extend({ noteId: id });
const part = pin.extend({ part: z.enum(["text", "voice"]) });
const plain = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\u0000"));
const position = z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.int().min(0).max(10000));
const photoFields = z.strictObject({ id, title: plain(80) });
const noteFields = z.strictObject({ text: plain(220).optional() });
const pinFields = noteFields.extend({ id, title: plain(48), x: position, y: position });

function route<P extends { relationshipId: string }>(
  schema: z.ZodType<P>, mutation: boolean,
  action: (p: P, actor: string, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
    const actor = mutation ? (await requireAccountMutationIdentity(request, reply, "x-together-owner"))?.userId
      : (await requireUser(request, reply))?.id;
    if (!actor) return;
    const params = schema.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, "This memory is not available.");
    try {
      return await action(params.data, actor, request, reply);
    } catch (error) {
      if (error instanceof MemoryError) return sendError(reply, error.status, error.message);
      throw error;
    }
  };
}

export async function registerMemoryRoutes(server: FastifyInstance) {
  await server.register(multipart, { limits: { files: 1, fields: 5, parts: 7, fileSize: maxPhotoUploadBytes + 1, fieldSize: 1024, fieldNameSize: 20, headerPairs: 20 } });

  async function upload(request: FastifyRequest, field: "file" | "voice", max: number) {
    const invalid = () => new MemoryError(400, "This attachment could not be read.");
    const oversize = () => new MemoryError(413, field === "file" ? "Photos must be 5 MB or smaller." : "Voice notes can’t exceed 10 seconds.");
    if (!request.isMultipart()) throw invalid();
    const fields: Record<string, string> = Object.create(null);
    let file: { bytes: Buffer; mime: string } | undefined;
    let bad = false;
    try {
      for await (const part of request.parts({ limits: { fileSize: max + 1 } })) {
        if (part.type === "file") {
          if (part.fieldname !== field || file) { bad = true; part.file.resume(); continue; }
          const bytes = await part.toBuffer();
          if (part.file.truncated || bytes.length > max) throw oversize();
          file = { bytes, mime: part.mimetype };
        } else if (Object.hasOwn(fields, part.fieldname) || part.fieldnameTruncated || part.valueTruncated || typeof part.value !== "string") {
          bad = true;
        } else fields[part.fieldname] = part.value;
      }
    } catch (error) {
      if (error instanceof MemoryError) throw error;
      if (error instanceof server.multipartErrors.RequestFileTooLargeError) throw oversize();
      throw invalid();
    }
    if (bad) throw invalid();
    return { fields, file };
  }

  server.get(base, route(relationship, false, async ({ relationshipId }, actor) => listMemories(relationshipId, actor)));
  server.post(base, route(relationship, true, async ({ relationshipId }, actor, request, reply) => {
    await assertMemoryAccess(relationshipId, actor);
    const { fields, file } = await upload(request, "file", maxPhotoUploadBytes);
    const parsed = photoFields.safeParse(fields);
    if (!parsed.success || !file) return sendError(reply, 400, "Give the photo a short name and choose an image.");
    const image = await normalizeMemoryPhoto(file.bytes, file.mime);
    return reply.code(201).send(await addMemoryPhoto(relationshipId, actor, parsed.data, image));
  }));
  server.get(`${base}/:photoId/media`, route(photo, false, async ({ relationshipId, photoId }, actor, _request, reply) => {
    const bytes = await readMemoryPhoto(relationshipId, actor, photoId);
    return reply.type("image/jpeg").send(Buffer.from(bytes));
  }));
  server.delete(`${base}/:photoId`, route(photo, true, async ({ relationshipId, photoId }, actor) => deleteMemoryPhoto(relationshipId, actor, photoId)));
  server.post(`${base}/:photoId/pins`, route(photo, true, async ({ relationshipId, photoId }, actor, request, reply) => {
    await assertMemoryAccess(relationshipId, actor);
    const { fields, file } = await upload(request, "voice", maxVoiceUploadBytes);
    const parsed = pinFields.safeParse(fields);
    if (!parsed.success || (!parsed.data.text && !file)) return sendError(reply, 400, "Name the detail and add a voice or written note.");
    const { text, ...spot } = parsed.data;
    return reply.code(201).send(await addMemoryPin(relationshipId, actor, photoId, spot, {
      ...(text ? { text } : {}), ...(file ? { audio: validateMemoryVoice(file.bytes, file.mime) } : {}),
    }));
  }));
  server.put(`${base}/:photoId/pins/:pinId/note`, route(pin, true, async ({ relationshipId, photoId, pinId }, actor, request, reply) => {
    await assertMemoryAccess(relationshipId, actor);
    const { fields, file } = await upload(request, "voice", maxVoiceUploadBytes);
    const parsed = noteFields.safeParse(fields);
    if (!parsed.success || (!parsed.data.text && !file)) return sendError(reply, 400, "Add a voice or written note before sharing.");
    return shareMemoryNote(relationshipId, actor, photoId, pinId, {
      ...(parsed.data.text ? { text: parsed.data.text } : {}), ...(file ? { audio: validateMemoryVoice(file.bytes, file.mime) } : {}),
    });
  }));
  server.get(`${base}/:photoId/pins/:pinId/notes/:noteId/voice`, route(voice, false, async ({ relationshipId, photoId, pinId, noteId }, actor, _request, reply) => {
    const bytes = await readMemoryVoice(relationshipId, actor, photoId, pinId, noteId);
    return reply.type("audio/wav").send(Buffer.from(bytes));
  }));
  server.delete(`${base}/:photoId/pins/:pinId/note/:part`, route(part, true,
    async ({ relationshipId, photoId, pinId, part }, actor) => removeMemoryNotePart(relationshipId, actor, photoId, pinId, part)));
}
