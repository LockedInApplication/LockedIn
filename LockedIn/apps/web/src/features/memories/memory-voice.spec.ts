import { describe, expect, it } from "vitest";
import { encodeMemoryVoice } from "./memory-voice";
import { nearestPin, photoPoint } from "./memory-api";

describe("memory notes", () => {
  it("encodes bounded mono PCM without trusting the recording source’s sample rate", async () => {
    const pcm = await encodeMemoryVoice(new Float32Array(48_000 * 11).fill(.5), 48_000).arrayBuffer();
    const view = new DataView(pcm);
    expect(pcm.byteLength).toBe(320_044);
    expect(view.getUint32(4, true)).toBe(320_036);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(320_000);
    expect(view.getInt16(44, true)).toBe(16384);
    expect(() => encodeMemoryVoice(new Float32Array(100), 48000)).toThrow(/longer/);
  });

  it("stores image-relative points and lets a nearby pin be reopened", () => {
    const point = photoPoint(150, 90, { width: 250, height: 150, left: 25, top: 15 });
    expect(point).toEqual({ x: 5000, y: 5000 });
    expect(photoPoint(500, -1, { width: 250, height: 150, left: 25, top: 15 })).toEqual({ x: 10000, y: 0 });
    const pins = [{ id: "heart", title: "The foam heart", x: 5100, y: 5100, notes: [] }];
    expect(nearestPin(point, pins, { width: 250, height: 150 })?.id).toBe("heart");
    expect(nearestPin({ x: 9000, y: 9000 }, pins, { width: 250, height: 150 })).toBeUndefined();
  });
});
