import sharp from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const mimeFormats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

/** Decode pixels, not filenames. Originals and embedded metadata never leave this process. */
export async function normalizePhoto(bytes: Buffer, declaredMime: string): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const format = mimeFormats[declaredMime];
    if (!format || !bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning", animated: true }).timeout({ seconds: 10 });
    const meta = await image.metadata();
    if (meta.format !== format || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || Math.min(meta.width, meta.height) < 80) throw new Error();
    const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#eeeae2" }).toColourspace("srgb").jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    // Extreme aspect ratios need padding, not an image smaller than the screening minimum.
    const output = Math.min(info.width, info.height) < 80
      ? await sharp(data).extend({ left: Math.floor(Math.max(0, 80 - info.width) / 2), right: Math.ceil(Math.max(0, 80 - info.width) / 2), top: Math.floor(Math.max(0, 80 - info.height) / 2), bottom: Math.ceil(Math.max(0, 80 - info.height) / 2), background: "#eeeae2" }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
      : { data, info };
    if (output.data.length > MAX_PHOTO_BYTES) throw new Error();
    return { jpeg: output.data, width: output.info.width, height: output.info.height };
  } catch {
    throw new Error("Use a still JPEG, PNG or WebP photo, at least 80px per side and no more than 5 MiB or 24 megapixels.");
  }
}
