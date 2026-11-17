export const discoveryProfilePrompt = "What does showing up for someone look like to you?";
export const discoveryProfilePromptKey = "profile_prompt";
export const writtenPrompts = {
  showing_up: discoveryProfilePrompt,
  sunday: "A Sunday I’d happily repeat…",
  cared_for: "What makes you feel cared for?",
  together: "Something I’d love to try together…",
  tradition: "A tradition I’d like to start…",
} as const;
export const photoPrompts = {
  story: "The story behind this photo…",
  happy_place: "My happy place",
  favorite_memory: "A memory I’d relive",
} as const;
export const petOptions = { have: "Have pets", open: "Open to pets", none: "No pets" } as const;
export const familyOptions = { want: "Want children", dont_want: "Don’t want children", open: "Open to children", unsure: "Still figuring it out" } as const;
export const heightLabel = (inches: number) => `${Math.floor(inches / 12)}′ ${inches % 12}″`;
export type WrittenKey = keyof typeof writtenPrompts;
export type PhotoKey = keyof typeof photoPrompts;
export type ProfileReply = { prompt: WrittenKey } | { photo: string };
export function profileAnswers(profile: { prompts?: { key: WrittenKey; answer: string }[]; promptAnswer?: string }): { key: WrittenKey; answer: string }[] {
  return profile.prompts ?? (profile.promptAnswer ? [{ key: "showing_up", answer: profile.promptAnswer }] : []);
}
