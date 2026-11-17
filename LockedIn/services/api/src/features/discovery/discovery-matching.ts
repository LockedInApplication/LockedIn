import { createHmac } from "node:crypto";
import type { PublicDiscoveryProfile } from "./discovery.types.js";

export const discoveryIntentions = ["LONG_TERM", "OPEN_TO_LONG_TERM"] as const;
export const profilePromptKey = "profile_prompt";
export const profilePrompt = "What does showing up for someone look like to you?";
export const writtenPrompts = {
  showing_up: profilePrompt,
  sunday: "A Sunday I’d happily repeat…",
  cared_for: "What makes you feel cared for?",
  together: "Something I’d love to try together…",
  tradition: "A tradition I’d like to start…",
} as const;
export const photoPrompts = {
  story: "The story behind this photo…",
  happy_place: "My happy place",
  favorite_memory: "A memory I’d relive",
} as const;
export const dayMs = 86_400_000;
export const compatibleIntentions = (intention: string | null) => discoveryIntentions.some(value => value === intention) ? [...discoveryIntentions] : [];
export const intentionsMatch = (left: string | null, right: string | null) => compatibleIntentions(left).some(value => value === right);

export function recommendation(viewer: PublicDiscoveryProfile, person: PublicDiscoveryProfile) {
  const interests = new Set(viewer.interests.map(value => value.toLocaleLowerCase("en-US")));
  return {
    sameArea: viewer.areaId === person.areaId,
    sameIntention: viewer.intention === person.intention,
    sharedInterests: person.interests.filter(value => interests.has(value.toLocaleLowerCase("en-US"))),
  };
}

export type DiscoveryRank = { score: number; rotation: string; id: string };
export function rankCandidate(viewer: PublicDiscoveryProfile, person: PublicDiscoveryProfile, activeOn: Date | null, day: number, secret: string): DiscoveryRank {
  const reasons = recommendation(viewer, person);
  const activeDay = activeOn ? Math.floor(activeOn.getTime() / dayMs) : -1;
  const recent = activeDay >= day - 6 && activeDay <= day;
  return {
    score: reasons.sharedInterests.length * 3 + Number(reasons.sameIntention) * 2 + Number(recent),
    rotation: createHmac("sha256", secret).update(JSON.stringify(["discovery-rotation", viewer.id, person.areaId, day, person.id])).digest("hex").slice(0, 16),
    id: person.id,
  };
}
const asciiOrder = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
export const compareDiscoveryRank = (left: DiscoveryRank, right: DiscoveryRank) =>
  right.score - left.score || asciiOrder(left.rotation, right.rotation) || asciiOrder(left.id, right.id);
