import { cellToLatLng, getResolution, gridDisk, isValidCell, latLngToCell } from "h3-js";

const resolution = 6;
const rangeKm = 50;
// Conservative ring superset; inclusion uses geodesic distance, never hop count.
const searchRings = 24;
type Point = { latitude: number; longitude: number };

export const isWorldwideCell = (id: string) => /^[0-9a-f]{15}$/.test(id) && isValidCell(id) && getResolution(id) === resolution;

export function cellForDevice(location: Point & { accuracyMeters: number }): string {
  return latLngToCell(location.latitude, location.longitude, resolution);
}

export function discoveryDistanceKm(left: Point, right: Point) {
  const radians = Math.PI / 180;
  const a = Math.sin((right.latitude - left.latitude) * radians / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians)
    * Math.sin((right.longitude - left.longitude) * radians / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

function center(cell: string): Point {
  const [latitude, longitude] = cellToLatLng(cell);
  return { latitude, longitude };
}

export function nearbyCells(origin: string): string[] {
  if (!isWorldwideCell(origin)) return [];
  const from = center(origin);
  return gridDisk(origin, searchRings).filter(cell => discoveryDistanceKm(from, center(cell)) <= rangeKm);
}
