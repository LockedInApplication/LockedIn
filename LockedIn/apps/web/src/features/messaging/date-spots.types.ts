export const dateInterests = [
  ["art","Art"], ["coffee","Coffee"], ["food","Food"], ["outdoors","Outdoors"],
  ["books","Books"], ["music","Music & shows"], ["games","Games"],
] as const;
export type DateInterest = typeof dateInterests[number][0];
export type DatePreferences = { areaId: string; interests: DateInterest[] };
export type DateRequest = { id: string; from: "self" | "partner"; state: "pending" | "ready"; expiresAt: string };
export type DateSpotState = { areas: { areaId: string; label: string }[]; areaId: string | null; interests: DateInterest[]; remembered: boolean; request: DateRequest | null };
export type Spot = { ticket: string; name: string; address: string | null; reason: string };
export type VenueDetails = { name: string; address: string | null; mapsUrl: string; website: string | null; hours: string[];
  photos: { url: string; source: string; author: string; license: string; licenseUrl: string | null }[] };
export type Suggestions = { status: "suggestions"; items: Spot[]; reason: "too-far" | "no-results" | null };
export type DateAction =
  | { action: "solo" | "start" | "accept"; preferences: DatePreferences; remember?: boolean; id?: string }
  | { action: "mutual" | "cancel"; id: string } | { action: "details"; ticket: string } | { action: "sharedDetails"; messageId: string }
  | { action: "share"; ticket: string; requestId: string } | { action: "forget" };
