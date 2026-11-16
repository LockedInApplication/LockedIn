import type { AvatarPreset } from "@/features/profile/profile.types";
export type DiscoveryProfileInput = { publicName: string; avatarPreset: AvatarPreset; bio: string; intention: "LONG_TERM" | "OPEN_TO_LONG_TERM"; interests: string[]; pace: string | null; areaId: string };
export type PublicDiscoveryProfile = DiscoveryProfileInput & { id: string };
export type DiscoveryMe = { canDiscover: boolean; canModerate: boolean; hasHistory: boolean; canReflect: boolean; currentRelationshipId: string | null; areas: {id:string;label:string}[]; topics: {key:string;text:string}[] };
export type OwnDiscoveryProfile = { draft: DiscoveryProfileInput | null; revision: number; published: PublicDiscoveryProfile | null; publicationVersion: number; paused: boolean; adultAttested: boolean; suspended: boolean };
export type PageOf<T> = {items:T[];nextCursor:string|null};
