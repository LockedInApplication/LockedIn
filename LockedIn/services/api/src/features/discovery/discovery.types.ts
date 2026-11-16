export type DiscoveryContext = { userId: string; emailVerified: boolean };
export type DiscoveryCapabilities = { canDiscover: boolean; canModerate: boolean; hasHistory: boolean; canReflect: boolean; currentRelationshipId: string | null };
export type DiscoveryConfig = { enabled: boolean; pilotUserIds: string[]; moderatorUserIds: string[]; areas: { id: string; label: string }[]; admissionConfigured: boolean };
export type DiscoveryResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; retryAfter?: number };
export type PublicDiscoveryProfile = { id: string; publicName: string; avatarPreset: string; bio: string; intention: "LONG_TERM" | "OPEN_TO_LONG_TERM"; interests: string[]; pace: string | null; areaId: string };
export type DiscoveryProfileInput = Omit<PublicDiscoveryProfile, "id">;
