import { z } from "zod";
import { isCalendarBirthDate } from "./discovery-match-preferences.dates.js";

export const matchGenders = ["WOMAN", "MAN", "NONBINARY", "ANOTHER_GENDER"] as const;
const matchGender = z.enum(matchGenders);
export type MatchGender = z.infer<typeof matchGender>;
const ageBound = z.number().int().min(18).max(120);
export const matchPreferencesSchema = z.strictObject({
  revision: z.uuid().nullable(),
  birthDate: z.string().refine(isCalendarBirthDate),
  gender: matchGender,
  meetGenders: z.union([z.literal("all"), z.array(matchGender).min(1).max(4).refine(values => new Set(values).size === values.length)]),
  minAge: ageBound,
  maxAge: ageBound.nullable(),
  confirmBirthDateChange: z.literal(true).optional(),
}).refine(({ minAge, maxAge }) => maxAge === null ? minAge === 18 : minAge <= maxAge);

export type MatchPreferencesInput = z.infer<typeof matchPreferencesSchema>;
