import { afterEach, expect, it, vi } from "vitest";
import { discoveryDraftSchema, discoveryProfileSchema } from "../../discovery.schemas.js";
import { discoveryDraft, publicDiscoveryProfile } from "../../discovery-profile.view.js";
import { getPhotoConfig, parsePhotoConfig, photoCapabilities } from "../photo.config.js";

const profile = { publicName: "Alias", avatarPreset: "leaf", bio: "Hello", intention: "LONG_TERM", interests: [], pace: null, areaId: "test-area" };
const id = "123e4567-e89b-42d3-a456-426614174000";
afterEach(() => vi.unstubAllEnvs());
it("accepts owned-photo references without importing arbitrary image URLs", () => {
  expect(discoveryDraftSchema.safeParse({ ...profile, photoIds: [id], revision: 1 }).success).toBe(true);
  expect(discoveryProfileSchema.safeParse({ ...profile, photoIds: [id], photoUrl: "https://tracker.test" }).success).toBe(false);
  expect(publicDiscoveryProfile(id, { ...profile, photoIds: [id] })).toMatchObject({ photoIds: [id] });
});
it("keeps legacy JSON readable without altering the old public wire shape", () => {
  expect(publicDiscoveryProfile(id, profile)).toEqual({ id, ...profile });
  expect(discoveryDraft({ draft: { revision: 2, profile } } as never)).toMatchObject({ revision: 2, profile });
  expect(discoveryProfileSchema.safeParse({ ...profile, photoIds: [] }).success).toBe(true);
});
it.each([{ photoIds: [id, id] }, { photoIds: [id, "bad"] }, { photoIds: Array.from({ length: 4 }, (_, i) => `123e4567-e89b-42d3-a456-42661417400${i}`) }])("rejects invalid photo selection %j", ({ photoIds }) => {
  expect(discoveryProfileSchema.safeParse({ ...profile, photoIds }).success).toBe(false);
});
it("requires explicit photo flag and all provider credentials without leaking them in capabilities", () => {
  vi.stubEnv("DISCOVERY_PHOTOS_ENABLED", "true"); vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud"); vi.stubEnv("CLOUDINARY_API_KEY", "test-key"); vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
  expect(getPhotoConfig()).toMatchObject({ enabled: true, configured: true });
  expect(photoCapabilities()).toEqual({ enabled: true, configured: true });
  expect(JSON.stringify(photoCapabilities())).not.toMatch(/test-key|test-secret|test-cloud/);
  expect(parsePhotoConfig({})).toMatchObject({ enabled: false, configured: false });
  expect(parsePhotoConfig({ DISCOVERY_PHOTOS_ENABLED: "TRUE" }).enabled).toBe(false);
  vi.stubEnv("CLOUDINARY_API_SECRET", "");
  expect(photoCapabilities()).toEqual({ enabled: true, configured: false });
});
