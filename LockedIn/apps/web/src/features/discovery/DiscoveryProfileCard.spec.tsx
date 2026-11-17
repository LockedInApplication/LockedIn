import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import type { DiscoveryProfileInput } from "./discovery.types";

const draftPhoto = "00000000-0000-4000-8000-000000000000";
const publishedPhotos = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const profile: DiscoveryProfileInput = { publicName: "Sam", avatarPreset: "sun", bio: "Hello", intention: "LONG_TERM", interests: ["Reading"], pace: null, areaId: "new-york", photoIds: [draftPhoto] };

it("shows the first supplied photo, details and carousel controls without using draft IDs", () => {
  const html = renderToStaticMarkup(<DiscoveryProfileCard profile={profile} area="New York" photoIds={publishedPhotos}/>);
  expect(html).toContain(`src="/api/discovery/photos/${publishedPhotos[0]}/media"`);
  expect(html).not.toContain(draftPhoto);
  expect(html).toContain('aria-label="Next photo"');
  expect(html).toContain("New York");
  expect(html).toContain("Looking for a long-term relationship");
  expect(html).toContain("Reading");
});

it("falls back to the avatar and hides carousel controls without published photos", () => {
  const html = renderToStaticMarkup(<DiscoveryProfileCard profile={profile}/>);
  expect(html).toContain('data-preset="sun"');
  expect(html).not.toContain("/api/discovery/photos/");
  expect(html).not.toContain('aria-label="Next photo"');
});
