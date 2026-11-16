import sharp from "sharp";
import { expect, it } from "vitest";
import { normalizePhoto } from "../photo-image.js";

const pixels = (width = 120, height = 80) => sharp({ create: { width, height, channels: 3, background: "#74a989" } });
it.each(["jpeg", "png", "webp"] as const)("decodes real %s and produces a bounded metadata-free JPEG", async format => {
  const input = await pixels(2400, 1200).toFormat(format).toBuffer();
  const output = await normalizePhoto(input, `image/${format}`);
  expect(output.width).toBe(1600); expect(output.height).toBe(800);
  const meta = await sharp(output.jpeg).metadata();
  expect(meta.format).toBe("jpeg"); expect(meta.exif).toBeUndefined(); expect(meta.icc).toBeUndefined();
});
it("applies orientation before removing EXIF and embedded identity/location metadata", async () => {
  const input = await pixels().jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Artist: "SYNTHETIC EXIF MARKER" } } }).toBuffer();
  expect((await sharp(input).metadata()).exif).toBeDefined();
  const output = await normalizePhoto(input, "image/jpeg");
  expect([output.width, output.height]).toEqual([80, 120]);
  const meta = await sharp(output.jpeg).metadata();
  expect(meta.orientation).toBeUndefined(); expect(meta.exif).toBeUndefined(); expect(meta.xmp).toBeUndefined();
  expect(output.jpeg.includes(Buffer.from("SYNTHETIC EXIF MARKER"))).toBe(false);
});
it("pads extremely narrow valid images to preserve the minimum screening dimensions", async () => {
  const output = await normalizePhoto(await pixels(80, 5000).png().toBuffer(), "image/png");
  expect([output.width, output.height]).toEqual([80, 1600]);
});
it("rejects oversized files, excessive pixels and too-small input before publication", async () => {
  await expect(normalizePhoto(Buffer.alloc(5 * 1024 * 1024 + 1), "image/jpeg")).rejects.toThrow();
  await expect(normalizePhoto(await pixels(6000, 4001).png().toBuffer(), "image/png")).rejects.toThrow();
  await expect(normalizePhoto(await pixels(79, 100).jpeg().toBuffer(), "image/jpeg")).rejects.toThrow();
});
it("rejects malformed, mislabeled, truncated, vector and animated input", async () => {
  const png = await pixels().png().toBuffer();
  const animated = await sharp(Buffer.concat([Buffer.alloc(80 * 80 * 3, 40), Buffer.alloc(80 * 80 * 3, 200)]), { raw: { width: 80, height: 160, pageHeight: 80, channels: 3 } }).webp({ loop: 0 }).toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  for (const [bytes, mime] of [[png, "image/jpeg"], [png.subarray(0, 50), "image/png"], [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"], [animated, "image/webp"], [Buffer.from("not an image"), "image/png"]] as const) {
    await expect(normalizePhoto(bytes, mime)).rejects.toThrow();
  }
});
