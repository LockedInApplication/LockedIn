import { API_URL, JourneyApiError, journeyRequest } from "@/features/journey/journey.client";

export type PhotoPoint = { x: number; y: number };
export type MemoryNote = { id: string; yours: boolean; text: string | null; voiceDurationMs: number | null; updatedAt: string };
export type MemoryPin = PhotoPoint & { id: string; title: string; notes: MemoryNote[] };
export type MemoryPhoto = { id: string; title: string; width: number; height: number; yours: boolean; createdAt: string; pins: MemoryPin[] };
export type Memories = { photos: MemoryPhoto[] };
export const maxMemoryPhotoBytes = 5 * 1024 * 1024;
export const memoryPhotoTypes = ["image/jpeg", "image/png", "image/webp"];
export const memoryPath = (space: string) => `/api/journey/relationships/${encodeURIComponent(space)}/memories`;
export const memoryPhotoPath = (base: string, photo: string) => `${base}/${encodeURIComponent(photo)}`;
export const memoryNotePath = (photo: string, pin: string) => `${photo}/pins/${encodeURIComponent(pin)}/note`;
export const memoryVoicePath = (photo: string, pin: string, note: string) => `${photo}/pins/${encodeURIComponent(pin)}/notes/${encodeURIComponent(note)}/voice`;

export function changeMemory<T>(path: string, method: "POST" | "PUT" | "DELETE", userId: string, body?: FormData) {
  return journeyRequest<T>(path, { method, headers: { "X-Together-Owner": userId }, ...(body ? { body } : {}) });
}

export async function readPrivateMemoryMedia(path: string, signal: AbortSignal) {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", cache: "no-store", signal });
  if (!response.ok) throw new JourneyApiError("This attachment couldn’t be opened.", response.status);
  return response.blob();
}

export function photoPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): PhotoPoint {
  return { x: axis((clientX - rect.left) / (rect.width || 1)), y: axis((clientY - rect.top) / (rect.height || 1)) };
}

const axis = (position: number) => Math.max(0, Math.min(10_000, Math.round(position * 10_000)));
export function nearestPin(point: PhotoPoint, pins: MemoryPin[], rect: Pick<DOMRect, "width" | "height">) {
  // Reuse an existing pin when its tap area would overlap the new one.
  return pins.find(pin => Math.abs(pin.x - point.x) * rect.width < 440_000 && Math.abs(pin.y - point.y) * rect.height < 440_000);
}
