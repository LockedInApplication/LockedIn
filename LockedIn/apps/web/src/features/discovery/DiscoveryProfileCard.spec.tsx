import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import type { DiscoveryProfileInput } from "./discovery.types";

const draftPhoto = "00000000-0000-4000-8000-000000000000";
const publishedPhotos = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const profile: DiscoveryProfileInput = { publicName: "Sam", avatarPreset: "sun", bio: "Hello", intention: "LONG_TERM", interests: ["Reading"], pace: null, areaId: "new-york", photoIds: [draftPhoto] };

it("interleaves the supplied photos without rendering draft IDs", () => {
  const html = renderToStaticMarkup(<DiscoveryProfileCard profile={profile} area="New York" photoIds={publishedPhotos}/>);
  expect(html).toContain(`src="/api/discovery/photos/${publishedPhotos[0]}/media"`);
  expect(html).not.toContain(draftPhoto);
  expect(html).toContain(`src="/api/discovery/photos/${publishedPhotos[1]}/media"`);
  expect(html.indexOf("New York")).toBeLessThan(html.indexOf(publishedPhotos[1]));
  expect(html).toContain("New York");
  expect(html).toContain("Looking for a long-term relationship");
  expect(html).toContain("Reading");
});

it("falls back to the avatar without published photos", () => {
  const html = renderToStaticMarkup(<DiscoveryProfileCard profile={profile}/>);
  expect(html).toContain('data-preset="sun"');
  expect(html).not.toContain("/api/discovery/photos/");
});

it("shows the profile answer and offers a reply only on a peer card", () => {
  const answered = { ...profile, promptAnswer: "Make the time." };
  expect(renderToStaticMarkup(<DiscoveryProfileCard profile={answered}/>)).toContain("Make the time.");
  expect(renderToStaticMarkup(<DiscoveryProfileCard profile={answered}/>)).not.toContain("Reply to this answer");
  expect(renderToStaticMarkup(<DiscoveryProfileCard profile={answered} onReply={() => {}}/>)).toContain("Reply to this answer");
  expect(renderToStaticMarkup(<DiscoveryProfileCard profile={profile} onReply={() => {}}/>)).not.toContain("Reply to this answer");
});

it("shows optional details and captions only for the displayed photos", () => {
  const expanded: DiscoveryProfileInput = { ...profile, about: { heightCm: 175, languages: ["English", "Twi"], pets: "have" }, prompts: [{ key: "sunday", answer: "A long walk." }], photoPrompts: [{ photoId: publishedPhotos[0]!, key: "story" }, { photoId: draftPhoto, key: "happy_place" }] };
  const html = renderToStaticMarkup(<DiscoveryProfileCard profile={expanded} photoIds={publishedPhotos} onReply={() => {}}/>);
  expect(html).toContain("The story behind this photo");
  expect(html).not.toContain("My happy place");
  expect(html).toContain("175 cm");
  expect(html).toContain("English, Twi");
  expect(html).toContain("A long walk.");
  expect(html).toContain("Reply to photo 1");
});
