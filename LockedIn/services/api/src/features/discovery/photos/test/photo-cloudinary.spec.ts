import https from "node:https";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { createCloudinaryPhotoProvider } from "../photo-cloudinary.js";
import { parsePhotoConfig } from "../photo.config.js";
import type { PhotoAsset } from "../photo.types.js";

const photoId = "f311d338-0d11-44ef-a070-ab7f418fa5c5";
const publicId = `lockedin-discovery/${photoId}`;
const asset: PhotoAsset = { assetId: "synthetic-asset", publicId, version: 3, format: "jpg" };
const config = parsePhotoConfig({ DISCOVERY_PHOTOS_ENABLED: "true", CLOUDINARY_CLOUD_NAME: "synthetic-cloud", CLOUDINARY_API_KEY: "synthetic-key", CLOUDINARY_API_SECRET: "synthetic-secret" });
const response = (extra = {}) => ({ asset_id: asset.assetId, public_id: publicId, version: 3, resource_type: "image", type: "authenticated", format: "jpg", moderation: [{ kind: "aws_rek", status: "approved", response: { moderation_labels: [] } }], ...extra });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** Intercept HTTP only: the real SDK still signs and serializes every request. */
function transport(body: unknown, status = 200) {
  const calls: { options: Record<string, unknown>; bytes: Buffer; timeout: number }[] = [];
  vi.spyOn(https, "request").mockImplementation(((options: Record<string, unknown>, callback: (response: unknown) => void) => {
    const request = new PassThrough(); const chunks: Buffer[] = [];
    const call = { options, bytes: Buffer.alloc(0), timeout: 0 }; calls.push(call);
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    Object.assign(request, { setTimeout: (timeout: number) => { call.timeout = timeout; return request; }, abort: () => request.destroy() });
    request.on("finish", () => {
      call.bytes = Buffer.concat(chunks);
      const incoming = Object.assign(new PassThrough(), { statusCode: status, headers: {} });
      callback(incoming); incoming.end(JSON.stringify(body));
    });
    return request;
  }) as unknown as typeof https.request);
  return calls;
}

it("uses real SDK signed authenticated immutable upload and explicit category policy, never a public URL", async () => {
  const calls = transport(response({ secure_url: "https://do-not-expose.invalid/private" }));
  const result = await createCloudinaryPhotoProvider(config).upload({ photoId, requestId: photoId, jpeg: Buffer.from("SYNTHETIC NORMALIZED PIXELS") });
  expect(result.asset).toEqual(asset); expect(JSON.stringify(result)).not.toContain("secure_url");
  expect(calls).toHaveLength(1); const call = calls[0]!;
  expect(call.options).toMatchObject({ hostname: "api.cloudinary.com", path: "/v1_1/synthetic-cloud/image/upload", method: "POST" });
  expect(call.timeout).toBe(20_000);
  const bytes = call.bytes.toString();
  for (const [key, value] of [["public_id", publicId], ["type", "authenticated"], ["overwrite", "0"], ["unique_filename", "0"], ["use_filename", "0"], ["format", "jpg"]]) expect(bytes).toContain(`name="${key}"\r\n\r\n${value}\r\n`);
  expect(bytes).toContain('name="signature"'); expect(bytes).toContain('name="timestamp"');
  expect(bytes).toContain("aws_rek:min_confidence:0.0"); expect(bytes).toContain("explicit_nudity:0.9");
  expect(bytes).toContain("suggestive:ignore"); expect(bytes).toContain("alcohol:ignore"); expect(bytes).toContain("tobacco:ignore");
  expect(bytes).not.toContain("synthetic-secret"); expect(bytes).not.toContain('name="eager"');
});
it("looks up a deterministic asset after ambiguous outcomes and treats missing resources as absent", async () => {
  const calls = transport(response());
  expect(await createCloudinaryPhotoProvider(config).inspect({ publicId })).toMatchObject({ asset });
  expect(calls[0]!.options).toMatchObject({ method: "GET", hostname: "api.cloudinary.com" });
  expect(String(calls[0]!.options.path)).toContain("/image/authenticated/lockedin-discovery%2F");
  expect(calls[0]!.timeout).toBe(20_000);
  vi.restoreAllMocks(); transport({ error: { message: "not found" } }, 404);
  expect(await createCloudinaryPhotoProvider(config).inspect({ publicId })).toBeNull();
});
it("rejects substituted/public/incomplete asset responses with safe errors", async () => {
  for (const extra of [{ type: "upload" }, { public_id: "another-photo" }, { asset_id: null }, { version: 0 }, { format: "svg" }, { resource_type: "video" }]) {
    transport(response(extra));
    await expect(createCloudinaryPhotoProvider(config).upload({ photoId, requestId: photoId, jpeg: Buffer.from("pixels") })).rejects.toThrow("Photo provider");
    vi.restoreAllMocks();
  }
  transport({ error: { message: "secret provider failure synthetic-secret" } }, 500);
  await expect(createCloudinaryPhotoProvider(config).inspect({ publicId })).rejects.toThrow(/^Photo provider unavailable$/);
});
it("performs idempotent authenticated destruction and explicit moderation overrides", async () => {
  const destroyed = transport({ result: "not found" });
  await createCloudinaryPhotoProvider(config).destroy({ publicId });
  expect(destroyed[0]!.bytes.toString()).toContain('name="type"\r\n\r\nauthenticated');
  vi.restoreAllMocks(); const reviewed = transport(response());
  await createCloudinaryPhotoProvider(config).override(asset, true, photoId);
  expect(reviewed[0]!.options.method).toBe("POST"); expect(reviewed[0]!.bytes.toString()).toContain("moderation_status=approved");
});
it("fetches short-lived private originals server-side with no redirects or caching", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(Buffer.from([255, 216, 255, 217]), { headers: { "content-type": "image/jpeg" } }));
  const result = await createCloudinaryPhotoProvider(config, { fetch: fetcher }).read(asset);
  expect(result).toEqual(Buffer.from([255, 216, 255, 217]));
  const [input, init] = fetcher.mock.calls[0]!; const url = new URL(String(input));
  expect(url.origin).toBe("https://api.cloudinary.com"); expect(url.pathname).toBe("/v1_1/synthetic-cloud/image/download");
  expect(url.searchParams.get("public_id")).toBe(publicId); expect(url.searchParams.get("type")).toBe("authenticated");
  expect(url.searchParams.has("signature")).toBe(true);
  expect(Number(url.searchParams.get("expires_at"))).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 31);
  expect(init).toMatchObject({ redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) });
});
it("fails closed on redirects, wrong content, large bodies, credential errors and unexpected asset IDs", async () => {
  for (const result of [new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }), new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }), new Response(Buffer.alloc(5 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } }), new Response(null, { status: 403 })]) {
    await expect(createCloudinaryPhotoProvider(config, { fetch: async () => result }).read(asset)).rejects.toThrow(/^Photo provider unavailable$/);
  }
  const fetcher = vi.fn<typeof fetch>();
  await expect(createCloudinaryPhotoProvider(config, { fetch: fetcher }).read({ ...asset, publicId: "../../other" })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds the entire read, including a stalled body, to twenty seconds", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream(), { headers: { "content-type": "image/jpeg" } }));
  const result = createCloudinaryPhotoProvider(config, { fetch: fetcher }).read(asset);
  const assertion = expect(result).rejects.toThrow(/^Photo provider unavailable$/);
  await vi.advanceTimersByTimeAsync(20_000); await assertion;
});
