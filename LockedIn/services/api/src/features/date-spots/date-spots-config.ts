import { meetupAreas } from "./date-spots-ranking.js";

export function dateSpotsAvailable() {
  return process.env.DATE_SPOTS_ENABLED === "true" &&
    !!(process.env.DATE_SPOTS_GEOAPIFY_API_KEY?.trim() || process.env.DISCOVERY_GEOAPIFY_API_KEY?.trim()) &&
    !!process.env.BETTER_AUTH_SECRET && meetupAreas().length > 0;
}
