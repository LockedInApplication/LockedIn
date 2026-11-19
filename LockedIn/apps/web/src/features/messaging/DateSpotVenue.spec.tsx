import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DateSpotVenue from "./DateSpotVenue";
import type { VenueDetails } from "./date-spots.types";

const venue: VenueDetails = { name:"An art gallery",address:"1 Public Way",website:null,photos:[],hours:[],mapsUrl:"https://www.openstreetmap.org/" };
it("keeps the venue useful when photos and hours are unavailable", () => {
  const html = renderToStaticMarkup(<DateSpotVenue venue={venue} busy={false} onBack={() => {}}/>);
  expect(html).toContain("No venue photos available.");
  expect(html).toContain("1 Public Way");
  expect(html).toContain("View on map");
  expect(html).not.toContain("Listed hours");
  expect(html).not.toContain("Share in chat");
});
it("shows a real credited photo, hours, and an explicit share action for an unshared venue", () => {
  const html = renderToStaticMarkup(<DateSpotVenue venue={{ ...venue, hours:["Mon 09:00–17:00"],
    photos:[{url:"https://upload.wikimedia.org/test.jpg",source:"https://commons.wikimedia.org/wiki/File:Test.jpg",author:"Photo Author",license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/"}],
  }} busy={false} onBack={() => {}} onShare={() => {}}/>);
  expect(html).toContain("Photo Author");
  expect(html).toContain("CC BY-SA 4.0");
  expect(html).toContain("Share in chat");
  expect(html).toContain("Listed hours");
});
