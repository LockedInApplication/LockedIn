import { randomUUID } from "node:crypto";
import type { DiscoveryMatchPreferences, Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { lockInvitationUsers } from "../invitations/invitation-access.service.js";
import { calendarDate, completedAge, utcDate } from "./discovery-match-preferences.dates.js";
import { matchGenders, type MatchPreferencesInput } from "./discovery-match-preferences.schemas.js";
import { isDiscoveryAdmitted } from "./discovery-profile.service.js";
import type { DiscoveryResult } from "./discovery.types.js";

const correctionMs = 30 * 24 * 60 * 60 * 1000;
export const discoveryMatchPreferencesRequired = () => process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED === "true";

function view(settings: DiscoveryMatchPreferences | null, required = discoveryMatchPreferencesRequired()) {
  if (!settings) return { required, settings: null };
  const { birthDate, gender, meetAllGenders, meetGenders, minAge, maxAge, revision } = settings;
  return { required, settings: { birthDate: utcDate(birthDate), gender, meetGenders: meetAllGenders ? "all" as const : meetGenders, minAge, maxAge, revision } };
}
type MatchPreferencesResult = DiscoveryResult<ReturnType<typeof view>>;

export async function getMatchPreferences(ownerId: string): Promise<MatchPreferencesResult> {
  return { ok: true, value: view(await prisma.discoveryMatchPreferences.findUnique({ where: { ownerId } })) };
}

export async function saveMatchPreferences(ownerId: string, input: MatchPreferencesInput): Promise<MatchPreferencesResult> {
  if (!discoveryMatchPreferencesRequired()) return { ok: false, status: 404, error: "Discovery matching setup is unavailable." };
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const now = new Date(), today = utcDate(now);
    if (input.birthDate > today || completedAge(input.birthDate, today) < 18) {
      return { ok: false, status: 400, error: "Discovery is for adults. Check your date of birth." };
    }
    const profile = await tx.discoveryProfile.findUnique({ where: { ownerId } });
    if (!await isDiscoveryAdmitted(tx, ownerId, profile)) return { ok: false, status: 403, error: "Discovery is not available for this account." };
    const existing = await tx.discoveryMatchPreferences.findUnique({ where: { ownerId } });
    const guard = await tx.discoveryMatchPreferenceGuard.findUnique({ where: { ownerId } });
    const correction = existing ? utcDate(existing.birthDate) !== input.birthDate : !!guard?.reenrollUntil && guard.reenrollUntil > now;
    if (correction) {
      if (guard?.correctionUntil && guard.correctionUntil > now) {
        return { ok: false, status: 409, error: "You can change your birthday or set up again once the 30-day correction window ends." };
      }
      if (!input.confirmBirthDateChange) return { ok: false, status: 409, error: "Confirm your birthday to continue after a change or recent removal." };
      const correctionUntil = new Date(now.getTime() + correctionMs);
      await tx.discoveryMatchPreferenceGuard.upsert({ where: { ownerId }, create: { ownerId, correctionUntil }, update: { correctionUntil, reenrollUntil: null } });
    }
    const meetAllGenders = input.meetGenders === "all";
    const selected = input.meetGenders;
    const data = {
      birthDate: calendarDate(input.birthDate), gender: input.gender, meetAllGenders,
      meetGenders: matchGenders.filter(gender => selected === "all" || selected.includes(gender)),
      minAge: input.minAge, maxAge: input.maxAge, revision: randomUUID(),
    };
    const settings = await tx.discoveryMatchPreferences.upsert({ where: { ownerId }, create: { ownerId, ...data }, update: data });
    return { ok: true, value: view(settings, true) };
  });
}

export async function removeMatchPreferences(ownerId: string): Promise<MatchPreferencesResult> {
  return prisma.$transaction(async tx => {
    await lockInvitationUsers(tx, [ownerId]);
    const deleted = await tx.discoveryMatchPreferences.deleteMany({ where: { ownerId } });
    if (deleted.count) {
      const reenrollUntil = new Date(Date.now() + correctionMs);
      await tx.discoveryMatchPreferenceGuard.upsert({ where: { ownerId }, create: { ownerId, reenrollUntil }, update: { reenrollUntil } });
    }
    return { ok: true, value: view(null) };
  });
}

export async function pruneDiscoveryMatchPreferenceGuards(db: Prisma.TransactionClient, now: Date) {
  const expired = {
    AND: [
      { OR: [{ correctionUntil: null }, { correctionUntil: { lte: now } }] },
      { OR: [{ reenrollUntil: null }, { reenrollUntil: { lte: now } }] },
    ],
  };
  const batch = await db.discoveryMatchPreferenceGuard.findMany({ where: expired, take: 500, orderBy: { ownerId: "asc" }, select: { ownerId: true } });
  if (batch.length) await db.discoveryMatchPreferenceGuard.deleteMany({ where: { ...expired, ownerId: { in: batch.map(row => row.ownerId) } } });
}
