import { z } from "zod";
import type { DiscoveryConfig } from "./discovery.types.js";

const catalogSchema = z.array(z.strictObject({ id: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(120) })).min(1).max(100);
const ids = (value: string | undefined) => [...new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean))];
export function parseDiscoveryConfig(source: Record<string, string | undefined>): DiscoveryConfig {
  const pilotUserIds = ids(source.DISCOVERY_PILOT_USER_IDS);
  const moderatorUserIds = ids(source.DISCOVERY_MODERATOR_USER_IDS);
  let areas: DiscoveryConfig["areas"] = [];
  try {
    const result = catalogSchema.safeParse(JSON.parse(source.DISCOVERY_AREAS_JSON ?? "null"));
    if (result.success && new Set(result.data.map(area => area.id)).size === result.data.length) areas = result.data;
  } catch { /* Bad rollout config closes new admission, not history. */ }
  return { enabled: source.DISCOVERY_ENABLED === "true", pilotUserIds, moderatorUserIds, areas, admissionConfigured: moderatorUserIds.length > 0 && areas.length > 0 };
}
