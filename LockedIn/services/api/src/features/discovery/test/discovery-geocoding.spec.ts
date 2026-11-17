import { afterEach, expect, it, vi } from "vitest";
import { getDiscoveryGeocoder } from "../discovery-geocoding.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("does not call a provider without a Geoapify key, even if the old Mapbox token is configured", () => {
  vi.stubEnv("DISCOVERY_GEOAPIFY_API_KEY", "   ");
  vi.stubEnv("DISCOVERY_MAPBOX_ACCESS_TOKEN", "old-token");
  expect(getDiscoveryGeocoder()).toBeNull();
});

it("uses worldwide Geoapify search and keeps precise addresses out of saved labels", async () => {
  vi.stubEnv("DISCOVERY_GEOAPIFY_API_KEY", " synthetic ");
  const fetch = vi.fn(async (_url: URL, _options: unknown) => Response.json({ results: [
    { lon: 0.123, lat: 5.654, result_type: "building", formatted: "987 Synthetic Street, Accra, Ghana", city: "Accra", country: "Ghana" },
    { lon: 0.2, lat: 5.6, result_type: "postcode", formatted: "Synthetic postal code, Ghana", country: "Ghana" },
    { lon: 0.3, lat: 5.7, result_type: "district", formatted: "Synthetic district", city: null },
    { lon: 0.123, lat: 999, result_type: "building", formatted: "Invalid" },
    { lon: -1.2, lat: 6.1, result_type: "country", formatted: "Ghana" },
  ] }));
  vi.stubGlobal("fetch", fetch);
  const geocode = getDiscoveryGeocoder()!;
  expect(fetch).not.toHaveBeenCalled();
  expect(await geocode("987 Synthetic St, Ghana")).toEqual([
    { label: "987 Synthetic Street, Accra, Ghana", areaLabel: "Accra, Ghana", latitude: 5.654, longitude: 0.123 },
    { label: "Synthetic postal code, Ghana", areaLabel: "Ghana", latitude: 5.6, longitude: 0.2 },
    { label: "Synthetic district", areaLabel: null, latitude: 5.7, longitude: 0.3 },
  ]);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0]!;
  expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/geocode/search");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    text: "987 Synthetic St, Ghana", apiKey: "synthetic", format: "json", limit: "5", bias: "countrycode:none",
  });
  expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
});

it("turns an upstream quota error into a generic failure without retrying", async () => {
  vi.stubEnv("DISCOVERY_GEOAPIFY_API_KEY", "synthetic");
  const fetch = vi.fn(async () => new Response("Private provider details", { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  await expect(getDiscoveryGeocoder()!("Accra, Ghana")).rejects.toThrow(/^Discovery location lookup failed$/);
  expect(fetch).toHaveBeenCalledOnce();
});
