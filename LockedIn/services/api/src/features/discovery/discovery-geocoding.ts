import { z } from "zod";

export type DiscoveryPlace = { label: string; areaLabel: string | null; latitude: number; longitude: number };
export type DiscoveryGeocoder = (query: string) => Promise<DiscoveryPlace[]>;
const placeName = z.string().trim().min(1).max(120).nullish();
const resultSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  result_type: z.enum(["building", "street", "postcode", "suburb", "district", "city"]),
  formatted: z.string().trim().min(1).max(300),
  city: placeName,
  state: placeName,
  country: placeName,
});

export function getDiscoveryGeocoder(): DiscoveryGeocoder | null {
  const apiKey = process.env.DISCOVERY_GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return null;
  return async query => {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    // Don't let the API's default IP-based bias favor the server's country.
    url.search = new URLSearchParams({ text: query, apiKey, format: "json", limit: "5", bias: "countrycode:none" }).toString();
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Discovery location lookup failed");
    const { results } = z.object({ results: z.array(z.unknown()).max(5) }).parse(await response.json());
    return results.flatMap(item => {
      const parsed = resultSchema.safeParse(item);
      if (!parsed.success) return [];
      const { lat: latitude, lon: longitude, formatted: label, city, state, country } = parsed.data;
      // The formatted result can contain a street address. Only broad components may be saved.
      const areaLabel = [...new Set([city, state, country].filter(Boolean))].join(", ").slice(0, 160) || null;
      return [{ label, areaLabel, latitude, longitude }];
    });
  };
}
