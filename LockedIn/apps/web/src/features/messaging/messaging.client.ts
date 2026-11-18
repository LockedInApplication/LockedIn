import { journeyRequest, JourneyApiError } from "@/lib/journey";
export type ChatRequest = <T>(ownerId: string, path: string, options?: RequestInit) => Promise<T>;
export async function messagingRequest<T>(ownerId: string, path: string, options?: RequestInit): Promise<T> {
  if (!ownerId || !path.startsWith("/api/messaging/") || path.includes("\\")) throw Error("Invalid messaging request");
  const headers = new Headers(options?.headers);
  if (options?.method && options.method.toUpperCase() !== "GET") headers.set("X-Messaging-Owner",ownerId);
  const result = await journeyRequest<{ownerId: string; value: T}>(path,{ ...options, headers, cache: "no-store" });
  if (result?.ownerId !== ownerId || !("value" in result)) throw new JourneyApiError("Your account changed. Reload before continuing.",409);
  return result.value;
}
