export type DiscoveryContext = { userId: string; emailVerified: boolean };
export type DiscoveryCapabilities = { canDiscover: boolean; canChat: boolean; discoveryLockedIn: boolean; canModerate: boolean; hasHistory: boolean; canReflect: boolean; currentRelationshipId: string | null };
export type DiscoveryConfig = { enabled: boolean; accessMode: "pilot" | "open" | null; pilotUserIds: string[]; moderatorUserIds: string[]; areas: { id: string; label: string }[]; admissionConfigured: boolean };
export type DiscoveryResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; retryAfter?: number };
export type DiscoveryProfileInput = import("zod").output<typeof import("./discovery.schemas.js").discoveryProfileSchema>;
export type PublicDiscoveryProfile = DiscoveryProfileInput & { id: string };
