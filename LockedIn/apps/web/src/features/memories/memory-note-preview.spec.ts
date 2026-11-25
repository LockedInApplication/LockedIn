import { expect, it } from "vitest";
import type { Memories, MemoryNote } from "./memory-api";
import { latestPartnerMemoryNote, memoryNoteHref, memoryNoteTarget } from "./memory-note-preview";

const base: MemoryNote = { id: "note", yours: false, text: "Old thought", voiceDurationMs: null, updatedAt: "2026-03-14T19:00:00Z" };
const gallery = (notes: MemoryNote[]): Memories => ({
  photos: [{ id: "photo/one", title: "Sunday", envelopeId: "weekend", width: 480, height: 360, yours: true,
    createdAt: "2026-03-14T18:00:00Z", pins: [{ id: "pin one", title: "At the museum", x: 3500, y: 4600, notes }] }],
  envelopes: [
    { id: "first", title: "No partner caption", day: null, tone: "LINEN", coverPhotoId: null, captions: [{ text: "My caption", yours: true }] },
    { id: "weekend", title: "Sunday", day: null, tone: "LINEN", coverPhotoId: null, captions: [{ text: "A shared afternoon", yours: false }] },
  ],
});

it("ranks the partner’s dated written notes and ignores your own notes and voice-only entries", () => {
  const latest = latestPartnerMemoryNote(gallery([base,
    { ...base, id: "latest", text: "  Let’s go back.  ", updatedAt: "2026-04-01T18:00:00Z" },
    { ...base, id: "me", text: "Mine", yours: true, updatedAt: "2026-05-01T18:00:00Z" },
    { ...base, id: "voice", text: null, voiceDurationMs: 3_000, updatedAt: "2026-06-01T18:00:00Z" },
  ]));
  expect(latest).toEqual({ text: "Let’s go back.", updatedAt: "2026-04-01T18:00:00Z", target: { kind: "pin", photoId: "photo/one", pinId: "pin one" } });
  const url = new URL(memoryNoteHref(latest!.target), "http://localhost");
  expect(url.search).toBe("?view=memories");
  expect(memoryNoteTarget(url.hash)).toEqual(latest!.target);
});

it("uses an undated caption as the fallback and declines malformed or unrelated fragment links", () => {
  const latest = latestPartnerMemoryNote(gallery([{ ...base, text: "   " }]));
  expect(latest).toEqual({ text: "A shared afternoon", updatedAt: null, target: { kind: "caption", envelopeId: "weekend" } });
  expect(memoryNoteTarget("#memory-envelope/weekend")).toEqual(latest!.target);
  for (const hash of ["#other", "#memory-envelope/%0", "#memory-photo/photo", "#memory-photo/photo/pin/extra"]) expect(memoryNoteTarget(hash)).toBeNull();
  expect(latestPartnerMemoryNote({ photos: [], envelopes: [] })).toBeNull();
});
