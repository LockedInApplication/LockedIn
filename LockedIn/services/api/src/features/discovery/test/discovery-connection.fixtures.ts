import { randomUUID } from "node:crypto";
import { createPerson, discoveryRequest } from "./discovery.fixtures.js";
import type { FastifyInstance } from "fastify";

export const publicDraft = { publicName: "Chosen alias", avatarPreset: "leaf", bio: "Public introduction", intention: "LONG_TERM", interests: ["Reading"], pace: null, areaId: "pilot-city" };
export function connectionFixtures(server: FastifyInstance) {
  const cohort: string[] = [];
  const request = discoveryRequest(server);
  const configure = () => Object.assign(process.env, { DISCOVERY_ENABLED: "true", DISCOVERY_PILOT_USER_IDS: cohort.join(","), DISCOVERY_MODERATOR_USER_IDS: "test-moderator", DISCOVERY_AREAS_JSON: '[{"id":"pilot-city","label":"Pilot city"}]' });
  async function person(customId?: string) {
    const account = await createPerson(true, customId);
    cohort.push(account.id); configure();
    const { prisma } = await import("../../../lib/prisma.js");
    const profile = await prisma.discoveryProfile.create({ data: { ownerId: account.id, draft: { revision: 1, profile: publicDraft }, publishedSnapshot: publicDraft, publishedAreaId: "pilot-city", publishedIntention: "LONG_TERM", adultAttestedAt: new Date(), publishedAt: new Date(), publicationConsentedAt: new Date(), publicationConsentVersion: 1, publicationVersion: 1 } });
    return { ...account, profileId: profile.id };
  }
  const send = (from: {id: string; cookie: string}, to: {profileId: string}, requestId = randomUUID()) => request(from, "POST", "/api/discovery/connections", { targetProfileId: to.profileId, topicKey: "support", hello: "Hello there", requestId });
  return { person, request, send, configure };
}
