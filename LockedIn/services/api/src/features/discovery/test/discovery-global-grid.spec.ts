import { expect, it } from "vitest";
import { cellToLatLng, getPentagons, gridDisk, greatCircleDistance, UNITS } from "h3-js";
import { parseDiscoveryConfig, readDiscoveryLocationPolicy } from "../discovery.config.js";
import { cellForDevice, nearbyCells, isWorldwideCell } from "../discovery-global-grid.js";

const worldwide = { DISCOVERY_ENABLED: "true", DISCOVERY_ACCESS_MODE: "open", DISCOVERY_MODERATOR_USER_IDS: "moderator", DISCOVERY_LOCATION_MODE: "worldwide", DISCOVERY_LOCATION_GENERATION: "w1" };
it("admits worldwide location policy without a city catalog, but never without a generation or moderator", () => {
  expect(parseDiscoveryConfig(worldwide).admissionConfigured).toBe(true);
  expect(parseDiscoveryConfig({ ...worldwide, DISCOVERY_LOCATION_GENERATION: "" }).admissionConfigured).toBe(false);
  expect(parseDiscoveryConfig({ ...worldwide, DISCOVERY_MODERATOR_USER_IDS: "" }).admissionConfigured).toBe(false);
  expect(readDiscoveryLocationPolicy({ DISCOVERY_LOCATION_GENERATION: "partial" })).toEqual({ mode:"unavailable" });
  expect(readDiscoveryLocationPolicy({ DISCOVERY_LOCATION_REQUIRED: "true" })).toEqual({ mode:"metro",generation:null });
  expect(readDiscoveryLocationPolicy({})).toEqual({ mode:"legacy" });
});

it("uses the same bounded nearby region in both directions across grid and longitude boundaries", () => {
  const cell = (latitude:number, longitude:number) => cellForDevice({latitude, longitude, accuracyMeters:80});
  for (const [a, b] of [[cell(5.56,-0.20), cell(5.56,-0.40)], [cell(0,179.9),cell(0,-179.9)], [cell(85,1),cell(85,3)]] as const) {
    expect(a).not.toBe(b);
    expect(nearbyCells(a)).toContain(b);
    expect(nearbyCells(b)).toContain(a);
    expect(nearbyCells(a).length).toBeLessThan(1200);
  }
  const accra = cell(5.56,-0.20);
  expect(nearbyCells(accra)).not.toContain(cell(40.75,-73.99));
  expect(nearbyCells(accra)).not.toContain(cell(5.56,-0.82));
  expect(nearbyCells("invalid")).toEqual([]);
  expect(isWorldwideCell(accra.toUpperCase())).toBe(false);
});

it("includes all cells within 50 km across every resolution-six pentagon and its immediate neighbors", () => {
  for (const pentagon of getPentagons(6)) {
    for (const origin of gridDisk(pentagon, 1)) {
      const center = cellToLatLng(origin);
      const reference = gridDisk(origin, 30).filter(cell => greatCircleDistance(center, cellToLatLng(cell), UNITS.km) <= 50);
      const actual = new Set(nearbyCells(origin));
      expect(actual.size).toBe(reference.length);
      expect(reference.every(cell => actual.has(cell))).toBe(true);
    }
  }
}, 15_000);
