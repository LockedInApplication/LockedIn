import { workspaceHref } from "@/features/journey/journey.navigation";
import type { Memories } from "./memory-api";

export type MemoryNoteTarget = { kind: "caption"; envelopeId: string }
  | { kind: "pin"; photoId: string; pinId: string };
export type PartnerMemoryNote = { text: string; updatedAt: string | null; target: MemoryNoteTarget };

export function latestPartnerMemoryNote(memories: Memories): PartnerMemoryNote | null {
  let latest: PartnerMemoryNote | null = null;
  let latestTime = -Infinity;
  for (const { id: photoId, pins } of memories.photos) {
    for (const { id: pinId, notes } of pins) {
      for (const note of notes) {
        const text = note.text?.trim();
        const time = Date.parse(note.updatedAt);
        if (!note.yours && text && time > latestTime) {
          latestTime = time;
          latest = { text, updatedAt: note.updatedAt, target: { kind: "pin", photoId, pinId } };
        }
      }
    }
  }
  if (latest) return latest;

  // Captions have no timestamp. Use the shelf's newest-envelope-first order
  // as a fallback, without claiming when its partner caption was written.
  for (const envelope of memories.envelopes) {
    const text = envelope.captions.find(caption => !caption.yours && caption.text.trim())?.text.trim();
    if (text) return { text, updatedAt: null, target: { kind: "caption", envelopeId: envelope.id } };
  }
  return null;
}

export function memoryNoteHref(target: MemoryNoteTarget): string {
  const fragment = target.kind === "caption" ? `memory-envelope/${encodeURIComponent(target.envelopeId)}`
    : `memory-photo/${encodeURIComponent(target.photoId)}/${encodeURIComponent(target.pinId)}`;
  return `${workspaceHref("memories")}#${fragment}`;
}

export function memoryNoteTarget(hash: string): MemoryNoteTarget | null {
  try {
    const [kind, id, pin, extra] = hash.replace(/^#/, "").split("/");
    if (kind === "memory-envelope" && id && pin === undefined) return { kind: "caption", envelopeId: decodeURIComponent(id) };
    if (kind === "memory-photo" && id && pin && extra === undefined) return { kind: "pin", photoId: decodeURIComponent(id), pinId: decodeURIComponent(pin) };
  } catch {
    // A malformed or outdated link can still open the Memories shelf.
  }
  return null;
}
