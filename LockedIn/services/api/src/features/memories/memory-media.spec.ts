import sharp from "sharp";
import { expect, it } from "vitest";
import { maxVoiceUploadBytes, normalizeMemoryPhoto, validateMemoryVoice } from "./memory-media.js";

export function fixtureVoice(frames: number) {
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  return bytes;
}

it("rotates uploaded pixels, strips metadata, and checks the decoded format", async () => {
  const jpeg = await sharp({ create: { width: 210, height: 110, channels: 3, background: "#c5a887" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const output = await normalizeMemoryPhoto(jpeg, "image/jpeg");
  expect(output).toMatchObject({ width: 110, height: 210 });
  expect((await sharp(output.jpeg).metadata()).exif).toBeUndefined();
  await expect(normalizeMemoryPhoto(jpeg, "image/png")).rejects.toThrow(/JPEG/);
  await expect(normalizeMemoryPhoto(Buffer.from("<svg></svg>"), "image/svg+xml")).rejects.toThrow(/JPEG/);
});

it("derives the voice duration from the canonical WAV and rejects invalid frames", () => {
  const tenSeconds = fixtureVoice(160_000);
  expect(tenSeconds.length).toBe(maxVoiceUploadBytes);
  expect(validateMemoryVoice(tenSeconds, "audio/wav").voiceDurationMs).toBe(10_000);
  expect(validateMemoryVoice(fixtureVoice(4_000), "audio/wav").voiceDurationMs).toBe(250);
  expect(() => validateMemoryVoice(fixtureVoice(160_001), "audio/wav")).toThrow(/10 seconds/);
  expect(() => validateMemoryVoice(fixtureVoice(3_999), "audio/wav")).toThrow(/quarter second/);
  expect(() => validateMemoryVoice(tenSeconds, "audio/webm")).toThrow();
  tenSeconds.writeUInt32LE(2, 40);
  expect(() => validateMemoryVoice(tenSeconds, "audio/wav")).toThrow();
});
