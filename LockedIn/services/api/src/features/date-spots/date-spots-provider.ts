import { z } from "zod";
import { pointSchema, type Point, type Venue } from "./date-spots-ranking.js";

export const placeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,240}$/);
export type VenuePhoto = { url: string; source: string; author: string; license: string; licenseUrl: string | null };
export type VenueDetails = { name: string; address: string | null; mapsUrl: string; website: string | null; hours: string[]; photos: VenuePhoto[] };
export type PlaceProvider = { search(center: Point, radiusKm: number, categories: string[]): Promise<Venue[]>; details(id: string): Promise<VenueDetails | null> };
const short = z.string().trim().min(1).max(300);
const featureCollection = z.object({ features: z.array(z.object({ properties: z.unknown() })).max(200) });
const feature = z.object({
  place_id: placeIdSchema, name: short, formatted: short.nullish(),
  lat: pointSchema.shape.latitude, lon: pointSchema.shape.longitude,
  categories: z.array(z.string().max(120)).max(100).default([]),
  website: z.string().max(600).nullish(), opening_hours: short.nullish(),
  wiki_and_media: z.object({ image: z.string().max(650).nullish(), wikimedia_commons: z.string().max(650).nullish(), wikidata: z.string().max(30).nullish() }).nullish(),
  datasource: z.object({ raw: z.object({ access: z.string().optional(), disused: z.string().optional(), abandoned: z.string().optional() }).optional() }).optional(),
});
const restricted = (raw: { access?: string; disused?: string; abandoned?: string } | undefined) =>
  /^(private|no|staff|residents|permit)$/i.test(raw?.access ?? "") || raw?.disused === "yes" || raw?.abandoned === "yes";

const clientHeader = { "User-Agent": "LockedIn/1.0 venue suggestions (+https://lockedin-web-76oy.onrender.com)" };
function parseHttps(value: string | undefined | null) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url : null; } catch { return null; }
}
function fileTitle(input: string | undefined | null): string | null {
  if (!input) return null;
  const url = parseHttps(input);
  try {
    let name = input;
    if (url?.hostname === "commons.wikimedia.org") name = decodeURIComponent(url.pathname.replace(/^\/wiki\/(?:Special:FilePath\/)?/, ""));
    if (url?.hostname === "upload.wikimedia.org" && url.pathname.startsWith("/wikipedia/commons/")) {
      const parts = url.pathname.split("/");
      name = "File:" + decodeURIComponent((parts.includes("thumb") ? parts.at(-2) : parts.at(-1)) ?? "");
    }
    if (!/^File:/i.test(name) && url?.hostname === "commons.wikimedia.org") name = "File:" + name;
    return /^File:[^/<>|\r\n]{1,235}\.(?:jpe?g|png|webp)$/i.test(name) ? name : null;
  } catch { return null; }
}
async function json(url: URL, timeout = 4500, headers?: Record<string,string>): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout), headers });
  if (!response.ok) throw new Error("Venue provider unavailable.");
  return response.json();
}
async function wikidataPhotos(id: string | undefined | null) {
  if (!id || !/^Q[1-9][0-9]{0,16}$/.test(id)) return [];
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action: "wbgetclaims", entity: id, property: "P18", format: "json" }).toString();
  const result = z.object({ claims: z.object({ P18: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string().max(235) }).optional() }) })).optional() }) }).safeParse(await json(url, 2300, clientHeader));
  return result.success ? (result.data.claims.P18 ?? []).slice(0, 2).flatMap(claim => {
    const file = fileTitle("File:" + (claim.mainsnak.datavalue?.value ?? ""));
    return file ? [file] : [];
  }) : [];
}
async function commonsPhotos(titles: string[]): Promise<VenuePhoto[]> {
  if (!titles.length) return [];
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo",
    iiprop: "url|extmetadata|mime", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl", iiurlwidth: "640", titles: titles.join("|") }).toString();
  const metadata = z.record(z.string(), z.object({ value: z.string().max(2000) }));
  const response = z.object({ query: z.object({ pages: z.array(z.object({ imageinfo: z.array(z.object({ thumburl: z.string(), descriptionurl: z.string(),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]), extmetadata: metadata })).optional() })).max(2) }) }).safeParse(await json(url, 2500, clientHeader));
  if (!response.success) return [];
  return response.data.query.pages.flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info) return [];
    const photo = parseHttps(info.thumburl), source = parseHttps(info.descriptionurl), licenseUrl = parseHttps(info.extmetadata.LicenseUrl?.value);
    const license = info.extmetadata.LicenseShortName?.value;
    const author = info.extmetadata.Artist?.value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
    if (!photo || photo.hostname !== "upload.wikimedia.org" || !photo.pathname.startsWith("/wikipedia/commons/") ||
      !source || source.hostname !== "commons.wikimedia.org" || !source.pathname.startsWith("/wiki/File:") ||
      !license || !/^(?:CC BY(?:-SA)? \d\.\d|CC0(?: 1\.0)?|Public domain)$/i.test(license)) return [];
    const safeLicense = licenseUrl?.hostname === "creativecommons.org" ? licenseUrl.href : null;
    if (/^CC BY/i.test(license) && (!author || !safeLicense)) return [];
    return [{ url: photo.href, source: source.href, author: author || "Wikimedia Commons contributor", license, licenseUrl: safeLicense }];
  });
}
function openingHours(raw?: string | null): string[] {
  if (!raw) return [];
  if (raw === "24/7") return ["Open 24 hours"];
  const rules = raw.split(";").map(rule => rule.trim());
  const calendar: Record<string,string> = { Mo:"Mon", Tu:"Tue", We:"Wed", Th:"Thu", Fr:"Fri", Sa:"Sat", Su:"Sun" };
  const simple = /^(?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[,-](?:Mo|Tu|We|Th|Fr|Sa|Su))* )?(?:\d\d:\d\d-\d\d:\d\d(?:,\d\d:\d\d-\d\d:\d\d)*|off)$/;
  return rules.length <= 7 && rules.every(rule => simple.test(rule))
    ? rules.map(rule => rule.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, day => calendar[day]!).replace(/(?<=\d\d:\d\d),(?=\d\d:\d\d)/g, ", ").replace(/off$/, "closed")) : [];
}

export function getPlaceProvider(): PlaceProvider | null {
  const apiKey = process.env.DATE_SPOTS_GEOAPIFY_API_KEY?.trim() || process.env.DISCOVERY_GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return null;
  const geo = (path: string, params: Record<string,string>) => {
    const url = new URL(path, "https://api.geoapify.com");
    url.search = new URLSearchParams({ ...params, apiKey }).toString();
    return url;
  };
  return {
    async search(center,radiusKm,categories) {
      const location = `${center.longitude},${center.latitude}`;
      const params = { filter: `circle:${location},${Math.round(radiusKm * 1000)}`, bias: `proximity:${location}`, categories: categories.join(","), limit: "60" };
      const result = featureCollection.parse(await json(geo("/v2/places", params)));
      return result.features.flatMap(item => {
        const parsed = feature.safeParse(item.properties);
        if (!parsed.success || restricted(parsed.data.datasource?.raw)) return [];
        const { place_id, name, formatted, categories, lat, lon } = parsed.data;
        return [{ id: place_id, name, address: formatted ?? null, categories, latitude: lat, longitude: lon }];
      });
    },
    async details(id) {
      const response = featureCollection.parse(await json(geo("/v2/place-details",{ id })));
      const result = response.features.map(item => feature.safeParse(item.properties)).find(item => item.success);
      if (!result?.success || restricted(result.data.datasource?.raw)) return null;
      const { name, formatted, lat, lon, website, opening_hours, wiki_and_media } = result.data;
      const maps = new URL("https://www.openstreetmap.org/");
      maps.search = new URLSearchParams({ mlat: String(lat), mlon: String(lon) }).toString();
      maps.hash = `map=17/${lat}/${lon}`;
      let photos: VenuePhoto[] = [];
      try {
        const known = [fileTitle(wiki_and_media?.image), fileTitle(wiki_and_media?.wikimedia_commons)].filter((item): item is string => item !== null);
        const files = known.length ? known : await wikidataPhotos(wiki_and_media?.wikidata);
        photos = await commonsPhotos([...new Set(files)].slice(0, 2));
      } catch { /* Photos are optional and must never block venue details. */ }
      return { name, address: formatted ?? null, website: parseHttps(website)?.href ?? null, mapsUrl: maps.href, hours: openingHours(opening_hours), photos };
    },
  };
}
