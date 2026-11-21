import { z } from "zod";
import type { DiscoveryConfig } from "./discovery.types.js";

const catalogSchema = z.array(z.strictObject({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(120) })).min(1).max(100);
const ids = (value: string | undefined) => [...new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean))];
export const worldwidePublicArea = "nearby";
export type DiscoveryLocationPolicy =
  | { mode: "legacy" | "unavailable" }
  | { mode: "metro"; generation: string | null }
  | { mode: "worldwide"; generation: string };

export function readDiscoveryLocationPolicy(source: Record<string, string | undefined>): DiscoveryLocationPolicy {
  const mode = source.DISCOVERY_LOCATION_MODE;
  const generation = source.DISCOVERY_LOCATION_GENERATION;
  if (mode === undefined && generation === undefined) return source.DISCOVERY_LOCATION_REQUIRED === "true" ? { mode: "metro", generation: null } : { mode: "legacy" };
  if ((mode !== "worldwide" && mode !== "metro") || !generation || !/^[a-zA-Z0-9_-]{1,32}$/.test(generation)) return { mode: "unavailable" };
  return { mode, generation };
}

export function parseDiscoveryConfig(source: Record<string, string | undefined>): DiscoveryConfig {
  const pilotUserIds = ids(source.DISCOVERY_PILOT_USER_IDS);
  const moderatorUserIds = ids(source.DISCOVERY_MODERATOR_USER_IDS);
  const mode = source.DISCOVERY_ACCESS_MODE ?? "pilot";
  const accessMode = mode === "pilot" || mode === "open" ? mode : null;
  let areas: DiscoveryConfig["areas"] = [];
  try {
    const result = catalogSchema.safeParse(JSON.parse(source.DISCOVERY_AREAS_JSON ?? "null"));
    if (result.success && new Set(result.data.map(area => area.id)).size === result.data.length &&
        result.data.every(area => area.id !== worldwidePublicArea && !area.id.startsWith("v1:"))) areas = result.data;
  } catch { /* Bad rollout config closes new admission, not history. */ }
  const locationMode = readDiscoveryLocationPolicy(source).mode;
  return { enabled: source.DISCOVERY_ENABLED === "true", accessMode, pilotUserIds, moderatorUserIds, areas, admissionConfigured: accessMode !== null && moderatorUserIds.length > 0 && locationMode !== "unavailable" && (locationMode === "worldwide" || areas.length > 0) };
}

// Existing connections retain the account gate without depending on a live search policy.
export function isDiscoveryHistoryAllowed(config: DiscoveryConfig, userId: string) {
  return config.enabled && config.moderatorUserIds.length > 0
    && (config.accessMode === "open" || (config.accessMode === "pilot" && config.pilotUserIds.includes(userId)));
}

// Callers also check verification, suspension, and deliberate publication.
export function isDiscoveryAccountAllowed(config: DiscoveryConfig, userId: string) {
  return config.admissionConfigured && isDiscoveryHistoryAllowed(config, userId);
}
