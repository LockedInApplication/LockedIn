import { afterEach, expect, it, vi } from "vitest";
import { getPlaceProvider } from "./date-spots-provider.js";

const place = {
  place_id:"gallery-id",name:"Gallery",formatted:"1 Public Street",lat:41,lon:-72,categories:["entertainment.culture.gallery"],
  opening_hours:"We-Su 11:00-18:00; Mo-Tu off",website:"javascript:alert(1)",
  wiki_and_media:{ image:"https://commons.wikimedia.org/wiki/File:Gallery.jpg" },
};
const meta = { Artist:{value:"<a href='https://commons.wikimedia.org/'>Example photographer</a>"}, LicenseShortName:{value:"CC BY-SA 4.0"}, LicenseUrl:{value:"https://creativecommons.org/licenses/by-sa/4.0/"} };
const photo = {
  thumburl:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Gallery.jpg/640px-Gallery.jpg",
  descriptionurl:"https://commons.wikimedia.org/wiki/File:Gallery.jpg",mime:"image/jpeg",extmetadata:meta,
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("uses only fixed provider endpoints and returns attributed photos and venue details", async () => {
  vi.stubEnv("DATE_SPOTS_GEOAPIFY_API_KEY","synthetic-server-only");
  const fetch = vi.fn(async (url: URL) => {
    if (url.hostname === "api.geoapify.com") return Response.json({features:[
      {properties:place},{properties:{...place,place_id:"restricted",datasource:{raw:{access:"private"}}}},
    ]});
    if (url.hostname === "commons.wikimedia.org") return Response.json({query:{pages:[{imageinfo:[photo]}]}});
    throw Error("Unexpected provider");
  });
  vi.stubGlobal("fetch",fetch);
  const p = getPlaceProvider()!;
  expect(await p.search({latitude:41,longitude:-72},12,["entertainment.culture.gallery"])).toEqual([
    expect.objectContaining({id:"gallery-id",name:"Gallery"}),
  ]);
  expect(fetch.mock.calls[0]![0].searchParams.get("filter")).toBe("circle:-72,41,12000");
  const details = await p.details("gallery-id");
  expect(details).toMatchObject({name:"Gallery",website:null,hours:["Wed-Sun 11:00-18:00","Mon-Tue closed"],
    photos:[{author:"Example photographer",license:"CC BY-SA 4.0",url:photo.thumburl}]});
  expect(JSON.stringify(details)).not.toContain("synthetic-server-only");
  expect(fetch.mock.calls[2]![0].searchParams.get("titles")).toBe("File:Gallery.jpg");
});
it("omits unlicensed or untrusted photos without losing the venue", async () => {
  vi.stubEnv("DATE_SPOTS_GEOAPIFY_API_KEY","synthetic");
  vi.stubGlobal("fetch",vi.fn(async (url: URL) => url.hostname === "api.geoapify.com"
    ? Response.json({features:[{properties:place}]})
    : Response.json({query:{pages:[{imageinfo:[
      {...photo,thumburl:"https://third-party.example/gallery.jpg",extmetadata:{...meta,LicenseShortName:{value:"All rights reserved"}}},
    ]}]}})));
  expect(await getPlaceProvider()!.details("gallery-id")).toMatchObject({name:"Gallery",photos:[]});
});
