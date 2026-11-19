import { z } from "zod";
import { getDiscoveryConfig } from "../../config/env.js";
import { discoveryLocationMarkets } from "../discovery/discovery-location.js";

export const interests = ["art", "coffee", "food", "outdoors", "books", "music", "games"] as const;
export const interestSchema = z.enum(interests);
export type Interest = z.infer<typeof interestSchema>;
export const venueTypes: Record<Interest, readonly string[]> = {
  art: ["entertainment.culture.gallery", "entertainment.culture.arts_centre", "entertainment.museum"],
  coffee: ["catering.cafe"],
  food: ["catering.restaurant"],
  outdoors: ["leisure.park"],
  books: ["commercial.books", "education.library"],
  music: ["entertainment.culture.theatre", "entertainment.culture.arts_centre"],
  games: ["entertainment.bowling_alley", "entertainment.miniature_golf", "entertainment.amusement_arcade"],
};
const labels: Record<Interest, string> = { art: "art and culture", coffee: "coffee", food: "food", outdoors: "the outdoors", books: "books", music: "live performances", games: "games" };
const aliases: Record<Interest, RegExp> = {
  art: /\b(art|museums?|galler(y|ies)|paint(ing)?|design|photography)\b/i, coffee: /\b(coffee|caf[eé]s?|tea)\b/i,
  food: /\b(food|cooking|baking|restaurants?|dining|brunch|foodie)\b/i, outdoors: /\b(outdoors?|hiking|walking|parks?|gardening|nature|running|cycling)\b/i,
  books: /\b(books?|reading|literature|poetry|libraries)\b/i, music: /\b(music|concerts?|theat(re|er)|singing|jazz)\b/i, games: /\b(games?|gaming|bowling|arcades?|minigolf)\b/i,
};
export function mapInterests(values: string[]): Interest[] {
  return [...new Set(values.flatMap(value => interests.filter(item => aliases[item].test(value))))].slice(0, 3);
}

export const preferencesSchema = z.strictObject({
  areaId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  interests: z.array(interestSchema).max(3).refine(values => new Set(values).size === values.length),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const pointSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export type Point = z.infer<typeof pointSchema>;
const areaSchema = preferencesSchema.pick({ areaId: true }).extend({ label: z.string().trim().min(1).max(100), ...pointSchema.shape });
export type MeetupArea = z.infer<typeof areaSchema>;

// Public search centers only. Never accept a user's coordinates or an address.
const builtInAreas: Record<string, Point> = {
  hartford: { latitude: 41.76371, longitude: -72.68509 }, "new-york": { latitude: 40.71427, longitude: -74.00597 },
  kumasi: { latitude: 6.68848, longitude: -1.62443 }, accra: { latitude: 5.55602, longitude: -0.19690 },
};
const nearbyAreas: Record<string, MeetupArea[]> = {
  "new-york": [
    { areaId:"new-york-brooklyn", label:"Brooklyn, New York", latitude:40.65010, longitude:-73.94958 },
    { areaId:"new-york-astoria", label:"Astoria, Queens", latitude:40.77205, longitude:-73.93014 },
  ],
  hartford: [
    { areaId:"hartford-west", label:"West Hartford", latitude:41.76693, longitude:-72.75354 },
    { areaId:"hartford-east", label:"East Hartford", latitude:41.76344, longitude:-72.61523 },
  ],
  accra: [
    { areaId:"accra-osu", label:"Osu, Accra", latitude:5.55728, longitude:-0.18640 },
    { areaId:"accra-awoshie", label:"Awoshie, Accra", latitude:5.58385, longitude:-0.27787 },
  ],
  kumasi: [{ areaId:"kumasi-asokwa", label:"Asokwa, Kumasi", latitude:6.67, longitude:-1.6 }],
};
export function meetupAreas(): MeetupArea[] {
  const configured = getDiscoveryConfig().areas;
  const markets = new Map(discoveryLocationMarkets().map(market => [market.areaId, market]));
  const unique = new Map<string, MeetupArea>();
  for (const { id, label } of configured) {
    const p = markets.get(id) ?? builtInAreas[id];
    if (p) unique.set(id, { areaId: id, label, latitude: p.latitude, longitude: p.longitude });
    for (const area of nearbyAreas[id] ?? []) unique.set(area.areaId,area);
  }
  try {
    const extra = z.array(areaSchema).max(100).safeParse(JSON.parse(process.env.DATE_SPOT_AREAS_JSON ?? "[]"));
    if (extra.success) for (const area of extra.data) unique.set(area.areaId, area);
  } catch { /* Invalid optional additions cannot broaden the area list. */ }
  return [...unique.values()];
}

export type Venue = Point & { id: string; name: string; address: string | null; categories: string[] };
export type RankedVenue = Venue & { score: number; reason: string };
export const kmBetween = (a: Point, b: Point) => {
  const radians = Math.PI / 180;
  const f = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(Math.min(1, f)));
};
export const soloLimitKm = 12;
export const mutualLimitKm = 20;
export function searchWindow(a: Point, b?: Point) {
  if (!b) return { center: a, radiusKm: soloLimitKm };
  if (kmBetween(a, b) >= 2 * mutualLimitKm) return null;
  const shortDelta = (b.longitude - a.longitude + 540) % 360 - 180;
  return { center: { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + shortDelta / 2 + 540) % 360 - 180 }, radiusKm: mutualLimitKm };
}
export function searchCategories(a: Interest[], b: Interest[] = []) {
  const topics = [...new Set([...a, ...b])];
  return [...new Set((topics.length ? topics : ["coffee", "outdoors", "food"] as const).flatMap(topic => venueTypes[topic]))];
}
function interestMatch(v: Venue, picks: Interest[]) {
  const index = picks.findIndex(pick => venueTypes[pick].some(type => v.categories.some(category => category === type || category.startsWith(type + "."))));
  return { score: index === -1 ? 0 : [1, 0.75, 0.5][index] ?? 0, pick: index === -1 ? null : picks[index] ?? null };
}
export function rankVenues(venues: Venue[], a: MeetupArea, picksA: Interest[], b?: MeetupArea, picksB: Interest[] = []): RankedVenue[] {
  const limit = b ? mutualLimitKm : soloLimitKm;
  const results = venues.flatMap(v => {
    const distA = kmBetween(a, v), distB = b ? kmBetween(b, v) : 0;
    const worst = Math.max(distA, distB);
    if (worst > limit) return [];
    const fitA = interestMatch(v, picksA), fitB = interestMatch(v, picksB);
    const fit = b ? 0.6 * Math.min(fitA.score, fitB.score) + 0.4 * (fitA.score + fitB.score) / 2 : fitA.score;
    const proximity = 1 - worst / limit;
    const score = b ? 50 * fit + 35 * proximity + 15 * (1 - Math.abs(distA - distB) / limit) : 60 * fit + 40 * proximity;
    const reason = b
      ? fitA.pick && fitB.pick && fitA.pick === fitB.pick ? `You both like ${labels[fitA.pick]}.`
        : fitA.pick && fitB.pick ? "Matches an interest for each of you." : fitA.pick || fitB.pick ? "Matches one of your interests." : "Within your shared search range."
      : fitA.pick ? `Matches your interest in ${labels[fitA.pick]}.` : "Near your chosen area.";
    return [{ ...v, score, reason }];
  }).sort((l, r) => r.score - l.score || l.id.localeCompare(r.id));
  const ids = new Set<string>(), venuesSeen = new Set<string>();
  return results.filter(venue => {
    const key = `${venue.name.toLowerCase()}:${(venue.address ?? `${venue.latitude.toFixed(3)},${venue.longitude.toFixed(3)}`).toLowerCase()}`;
    if (ids.has(venue.id) || venuesSeen.has(key)) return false;
    ids.add(venue.id); venuesSeen.add(key);
    return true;
  }).slice(0, 3);
}
