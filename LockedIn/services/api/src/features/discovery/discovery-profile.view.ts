import type { DiscoveryProfile } from "../../../generated/prisma/client.js";
import { discoveryProfileSchema } from "./discovery.schemas.js";
import type { DiscoveryProfileInput, PublicDiscoveryProfile } from "./discovery.types.js";

// Never spread a database row or untrusted JSON into a public response.
export function publicDiscoveryProfile(id: string, value: unknown): PublicDiscoveryProfile | null {
  const parsed = discoveryProfileSchema.safeParse(value);
  if (!parsed.success) return null;
  const { publicName, avatarPreset, bio, intention, interests, pace, areaId } = parsed.data;
  return { id, publicName, avatarPreset, bio, intention, interests, pace, areaId };
}
export function discoveryDraft(profile: DiscoveryProfile | null): { profile: DiscoveryProfileInput | null; revision: number } {
  const wrapper = profile?.draft;
  if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper)) return { profile: null, revision: 0 };
  const revision = "revision" in wrapper && typeof wrapper.revision === "number" && Number.isSafeInteger(wrapper.revision) && wrapper.revision >= 0 ? wrapper.revision : 0;
  const parsed = discoveryProfileSchema.safeParse("profile" in wrapper ? wrapper.profile : null);
  return { profile: parsed.success ? parsed.data : null, revision };
}
export function ownDiscoveryProfile(profile: DiscoveryProfile | null) {
  const draft = discoveryDraft(profile);
  return { draft: draft.profile, revision: draft.revision, published: profile ? publicDiscoveryProfile(profile.id, profile.publishedSnapshot) : null, publicationVersion: profile?.publicationVersion ?? 0, paused: !!profile?.pausedAt, adultAttested: !!profile?.adultAttestedAt, suspended: !!profile?.suspendedAt };
}
