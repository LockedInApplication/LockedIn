import { describe, expect, it } from "vitest";
import { mapInterests, rankVenues, searchWindow, type MeetupArea, type Venue } from "./date-spots-ranking.js";
import { dateSpotTicket, readDateSpotTicket } from "./date-spots-ticket.js";

const a: MeetupArea = { areaId:"a", label:"Area A", latitude:0,longitude:0 };
const b: MeetupArea = { areaId:"b", label:"Area B", latitude:0,longitude:0.144 };
const venue = (id: string, lon: number, category = "entertainment.culture.gallery"): Venue =>
  ({ id,name:id,address:null,latitude:0,longitude:lon,categories:[category] });

describe("date-spot ranking and sharing", () => {
  it("favors shared first choices and a balanced short trip over one-sided convenience", () => {
    const balanced = venue("balanced",0.063), oneSided = venue("one-sided",0.018), tooFar = venue("far",0.2 + 0.162);
    const cafe = venue("coffee",0.081,"catering.cafe");
    const ranked = rankVenues([oneSided,tooFar,cafe,balanced,balanced],a,["art","coffee"],b,["art"]);
    expect(ranked.map(v => v.id)).toEqual(["balanced","one-sided","coffee"]);
    expect(ranked[0]).toMatchObject({ reason:"You both like art and culture." });
    expect(ranked[0]!.score).toBeCloseTo(82.8,0);
  });
  it("preserves picked profile interest order, does not ask a partner for solo searches, and rejects distant pairs", () => {
    expect(mapInterests(["Reading","hiking","Museum trips","Art","Coffee"])).toEqual(["books","outdoors","art"]);
    expect(rankVenues([venue("coffee",0.061,"catering.cafe"),venue("gallery",0.005)],a,["coffee"])[0]!.id).toBe("coffee");
    expect(searchWindow(a,{ latitude:5,longitude:0 })).toBeNull();
    expect(searchWindow(a)?.radiusKm).toBe(12);
  });
  it("rejects modified, expired, or cross-user/place-card tickets", () => {
    const conversation = "b0833d41-5485-4384-b3fb-780e62cb86c4", other = "9a0bc99f-ac6b-4026-857b-73c12cadfa35", secret = "unit-test-secret";
    const ticket = dateSpotTicket(conversation,"actor","venue","A Gallery",secret,1000);
    expect(readDateSpotTicket(ticket,conversation,"actor",secret,1001)?.place).toBe("venue");
    expect(readDateSpotTicket(ticket,conversation,"other",secret,1001)).toBeNull();
    expect(readDateSpotTicket(ticket,other,"actor",secret,1001)).toBeNull();
    expect(readDateSpotTicket(ticket,conversation,"actor",secret,30*60_000+1000)).toBeNull();
    expect(readDateSpotTicket("Z"+ticket,conversation,"actor",secret,1001)).toBeNull();
  });
});
