import { v2 as cloudinary } from "cloudinary";
import type { PhotoAsset, PhotoProvider } from "./photo.types.js";
import type { parsePhotoConfig } from "./photo.config.js";
import { MAX_PHOTO_BYTES } from "./photo-image.js";

export const PHOTO_PROVIDER_TIMEOUT = 20_000;
// Cloudinary category configuration is 0–1; result confidences are 0–100.
// Unknown/new categories retain provider defaults AND require local human review.
export const PHOTO_MODERATION = "aws_rek:min_confidence:0.0:explicit_nudity:0.9:violence:0.9:visually_disturbing:0.9:hate_symbols:0.9:suggestive:ignore:alcohol:ignore:tobacco:ignore";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const photoPublicId = (id: string) => { if (!uuid.test(id)) throw new Error("Photo provider unavailable"); return `lockedin-discovery/${id}`; };
function validatePublicId(id: string) { if (photoPublicId(id.split("/")[1] ?? "") !== id) throw new Error("Photo provider unavailable"); }
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
function assetResult(value: unknown, expectedId: string): { asset: PhotoAsset; screening: unknown } {
  if (!object(value) || value.public_id !== expectedId || value.resource_type !== "image" || value.type !== "authenticated" || value.format !== "jpg" || typeof value.asset_id !== "string" || !value.asset_id || !Number.isSafeInteger(value.version) || Number(value.version) <= 0) throw new Error("Photo provider unavailable");
  return { asset: { assetId: value.asset_id, publicId: expectedId, version: Number(value.version), format: "jpg" }, screening: { moderation: value.moderation } };
}
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error()), PHOTO_PROVIDER_TIMEOUT); timer.unref(); })]);
  } catch { throw new Error("Photo provider unavailable"); }
  finally { if (timer) clearTimeout(timer); }
}

/** Only this module imports the SDK. Never return a signed provider URL to a caller. */
export function createCloudinaryPhotoProvider(config: ReturnType<typeof parsePhotoConfig>, dependencies: { fetch?: typeof fetch } = {}): PhotoProvider {
  const options = () => {
    if (!config.configured) throw new Error("Photo provider unavailable");
    return { cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret, upload_prefix: "https://api.cloudinary.com", secure: true, resource_type: "image" as const, type: "authenticated", timeout: PHOTO_PROVIDER_TIMEOUT, oauth_token: "" };
  };
  return {
    upload: input => bounded(async () => {
      const publicId = photoPublicId(input.photoId);
      if (!input.jpeg.length || input.jpeg.length > MAX_PHOTO_BYTES || !uuid.test(input.requestId)) throw new Error();
      const result = await new Promise<unknown>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ ...options(), public_id: publicId, overwrite: false, unique_filename: false, use_filename: false, format: "jpg", moderation: PHOTO_MODERATION, x_unique_upload_id: input.requestId }, (error, value) => error ? reject(error) : resolve(value));
        stream.on("error", reject); stream.end(input.jpeg);
      });
      return assetResult(result, publicId);
    }),
    inspect: input => bounded(async () => {
      validatePublicId(input.publicId);
      let result: unknown;
      try { result = await cloudinary.api.resource(input.publicId, options()); }
      catch (error) { if (object(error) && (error.http_code === 404 || (object(error.error) && error.error.http_code === 404))) return null; throw error; }
      return assetResult(result, input.publicId);
    }),
    read: input => bounded(async () => {
      validatePublicId(input.publicId);
      if (input.format !== "jpg" || !input.assetId || !Number.isSafeInteger(input.version) || input.version < 1) throw new Error();
      const url = new URL(cloudinary.utils.private_download_url(input.publicId, "jpg", { ...options(), expires_at: Math.floor(Date.now() / 1000) + 30, attachment: false }));
      if (url.origin !== "https://api.cloudinary.com" || url.pathname !== `/v1_1/${config.cloudName}/image/download`) throw new Error();
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), PHOTO_PROVIDER_TIMEOUT); timer.unref();
      try {
        const response = await (dependencies.fetch ?? fetch)(url.toString(), { redirect: "error", cache: "no-store", signal: controller.signal });
        if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";")[0]?.trim() !== "image/jpeg" || !response.body || Number(response.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) { await response.body?.cancel(); throw new Error(); }
        const reader = response.body.getReader(); const chunks: Buffer[] = []; let size = 0;
        try {
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.length; if (size > MAX_PHOTO_BYTES) throw new Error();
            chunks.push(Buffer.from(chunk.value));
          }
        } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
        const bytes = Buffer.concat(chunks);
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error();
        return bytes;
      } finally { clearTimeout(timer); controller.abort(); }
    }),
    destroy: input => bounded(async () => {
      validatePublicId(input.publicId);
      const result: unknown = await cloudinary.uploader.destroy(input.publicId, { ...options(), invalidate: true });
      if (!object(result) || (result.result !== "ok" && result.result !== "not found")) throw new Error();
      return result.result === "ok" ? "destroyed" : "missing";
    }),
    override: (input, approved, requestId) => bounded(async () => {
      validatePublicId(input.publicId); if (!uuid.test(requestId)) throw new Error();
      const result = assetResult(await cloudinary.api.update(input.publicId, { ...options(), moderation_status: approved ? "approved" : "rejected" }), input.publicId);
      if (result.asset.assetId !== input.assetId || result.asset.version !== input.version) throw new Error();
    }),
  };
}
