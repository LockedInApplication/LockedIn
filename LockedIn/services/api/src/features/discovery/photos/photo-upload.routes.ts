import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireUser, sendError } from "../../../lib/journey-http.js";
import { requireDiscoveryIdentity, requireDiscoveryMutation } from "../discovery.http.js";
import { emptyDiscoverySchema } from "../discovery.schemas.js";
import { MAX_PHOTO_BYTES } from "./photo-image.js";
import { deletePhoto, listOwnPhotos, retryPhoto, uploadPhoto } from "./photo-lifecycle.service.js";
import { photoDecisionRequestSchema, photoDeleteSchema, photoParamsSchema, photoUploadFieldsSchema } from "./photo.schemas.js";
import type { PhotoProvider, PhotoResult } from "./photo.types.js";

export function respondPhoto<T>(reply: FastifyReply, ownerId: string, result: PhotoResult<T>) {
  if (result.ok) return { ownerId, value: result.value };
  if (result.retryAfter) reply.header("Retry-After", result.retryAfter);
  return sendError(reply, result.status, result.error);
}

export async function registerPhotoUploadRoutes(server: FastifyInstance, provider: PhotoProvider) {
  await server.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES + 1, files: 1, fields: 3, parts: 5, fieldSize: 100, fieldNameSize: 30, headerPairs: 20 } });
  server.get("/api/discovery/photos", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const user = await requireUser(request, reply); if (!user) return;
    if (!emptyDiscoverySchema.safeParse(request.query).success) return sendError(reply, 400, "Invalid photo request.");
    return respondPhoto(reply, user.id, await listOwnPhotos(user.id));
  });
  server.post("/api/discovery/photos", async (request, reply) => {
    const identity = await requireDiscoveryIdentity(request, reply); if (!identity) return;
    const invalid = () => sendError(reply, 400, "Choose one JPEG, PNG or WebP photo.");
    const oversized = () => sendError(reply, 413, "Photo must be no more than 5 MiB.");
    if (!request.isMultipart()) return invalid();
    const fields: Record<string, string> = Object.create(null);
    let file: { bytes: Buffer; mime: string } | undefined;
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "file" || file) { part.file.resume(); return invalid(); }
          const bytes = await part.toBuffer();
          if (bytes.length > MAX_PHOTO_BYTES || part.file.truncated) return oversized();
          file = { bytes, mime: part.mimetype };
        } else {
          if (!["requestId", "draftRevision", "replacePhotoId"].includes(part.fieldname) || part.fieldname in fields || part.fieldnameTruncated || part.valueTruncated || typeof part.value !== "string" || !part.value) return invalid();
          fields[part.fieldname] = part.value;
        }
      }
    } catch (error) {
      return error instanceof server.multipartErrors.RequestFileTooLargeError ? oversized() : invalid();
    }
    const parsed = photoUploadFieldsSchema.safeParse(fields);
    if (!file || !parsed.success) return invalid();
    return respondPhoto(reply, identity.userId, await uploadPhoto(identity.userId, parsed.data, file.bytes, file.mime, provider));
  });
  server.delete("/api/discovery/photos/:id", { config: { discoveryValidation: { body: photoDeleteSchema, params: photoParamsSchema } } }, async (request, reply) => {
    const identity = await requireDiscoveryMutation(request, reply); if (!identity) return;
    const { id } = photoParamsSchema.parse(request.params);
    const { requestId, draftRevision } = photoDeleteSchema.parse(request.body);
    return respondPhoto(reply, identity.userId, await deletePhoto(identity.userId, id, requestId, draftRevision));
  });
  server.post("/api/discovery/photos/:id/retry", { config: { discoveryValidation: { body: photoDecisionRequestSchema, params: photoParamsSchema } } }, async (request, reply) => {
    const identity = await requireDiscoveryMutation(request, reply); if (!identity) return;
    const { id } = photoParamsSchema.parse(request.params);
    const { requestId, decisionRevision } = photoDecisionRequestSchema.parse(request.body);
    return respondPhoto(reply, identity.userId, await retryPhoto(identity.userId, id, requestId, decisionRevision));
  });
}
