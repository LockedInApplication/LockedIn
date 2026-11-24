import sharp from "sharp";

export const maxPhotoUploadBytes = 5 * 1024 * 1024;
const maxStoredPhotoBytes = 768 * 1024;
const imageTypes = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]);

export class MemoryError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 413, message: string) { super(message); }
}

export async function normalizeMemoryPhoto(bytes: Buffer, mime: string) {
  try {
    const expected = imageTypes.get(mime);
    if (!expected || bytes.length === 0 || bytes.length > maxPhotoUploadBytes) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning", animated: true }).timeout({ seconds: 8 });
    const meta = await image.metadata();
    if (meta.format !== expected || (meta.pages ?? 1) !== 1 || (meta.width ?? 0) < 80 || (meta.height ?? 0) < 80) throw new Error();
    const { data, info } = await image.rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" }).toColourspace("srgb").jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (data.length > maxStoredPhotoBytes) throw new Error();
    // Only the new JPEG is stored, never the original, its filename, or EXIF/GPS.
    return { jpeg: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    throw new MemoryError(400, "Choose a still JPEG, PNG, or WebP photo under 5 MB, at least 80 pixels on each side.");
  }
}

export function memoryThumbnail(bytes: Uint8Array) {
  // Input is already a bounded, normalized JPEG. Serve small private previews on the shelf.
  return sharp(Buffer.from(bytes), { limitInputPixels: 1400 * 1400 }).timeout({ seconds: 5 })
    .resize({ width: 360, height: 360, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer();
}

const sampleRate = 16_000;
const headerBytes = 44;
const bytesPerSample = 2;
const minVoiceBytes = sampleRate * bytesPerSample / 4;
export const maxVoiceUploadBytes = headerBytes + 10 * sampleRate * bytesPerSample;

/** Accept only the canonical mono PCM WAV written by the browser recorder. No container metadata or claimed duration is trusted. */
export function validateMemoryVoice(bytes: Buffer, mime: string) {
  const invalid = () => new MemoryError(400, "Record a voice note between a quarter second and 10 seconds.");
  if (mime !== "audio/wav" || bytes.length < headerBytes + minVoiceBytes || bytes.length > maxVoiceUploadBytes) throw invalid();
  const tag = (offset: number, value: string) => bytes.subarray(offset, offset + 4).equals(Buffer.from(value));
  const pcmBytes = bytes.length - headerBytes;
  if (!tag(0, "RIFF") || bytes.readUInt32LE(4) !== bytes.length - 8 || !tag(8, "WAVE") || !tag(12, "fmt ") ||
      bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 ||
      bytes.readUInt32LE(24) !== sampleRate || bytes.readUInt32LE(28) !== sampleRate * bytesPerSample ||
      bytes.readUInt16LE(32) !== bytesPerSample || bytes.readUInt16LE(34) !== 16 || !tag(36, "data") ||
      bytes.readUInt32LE(40) !== pcmBytes || pcmBytes % bytesPerSample !== 0) throw invalid();
  return { voice: new Uint8Array(bytes), voiceDurationMs: Math.round(1000 * pcmBytes / (sampleRate * bytesPerSample)) };
}
