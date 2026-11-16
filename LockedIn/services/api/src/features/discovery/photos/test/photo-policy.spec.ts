import { expect, it } from "vitest";
import { classifyPhoto } from "../photo-policy.js";

export const screening = (labels: { name: string; confidence: number; parent_name?: string }[] = [], status = "approved") => ({ moderation: [{ kind: "aws_rek", status, response: { moderation_labels: labels.map(label => ({ parent_name: "", ...label })) } }] });
it("permits a completed clean result but never a status without the requested labels", () => {
  expect(classifyPhoto(screening())).toMatchObject({ state: "APPROVED", complete: true, labels: [] });
  expect(classifyPhoto({ moderation: [{ kind: "aws_rek", status: "approved" }] })).toMatchObject({ state: "CHECK_FAILED", complete: false });
});
it.each([
  [49.99, "APPROVED"], [50, "NEEDS_REVIEW"], [89.99, "NEEDS_REVIEW"], [90, "REJECTED"], [100, "REJECTED"],
])("uses explicit nudity policy confidence %s as %s", (confidence, state) => {
  expect(classifyPhoto(screening([{ name: "Explicit Nudity", confidence: Number(confidence) }])).state).toBe(state);
});
it("screens sexual activity, gore and hate symbols with no identity/age claims", () => {
  for (const name of ["Explicit Sexual Activity", "Graphic Violence Or Gore", "Hate Symbols"]) expect(classifyPhoto(screening([{ name, confidence: 95 }])).state).toBe("REJECTED");
  expect(classifyPhoto(screening([{ name: "Implied Nudity", confidence: 95 }])).state).toBe("NEEDS_REVIEW");
});
it("does not automatically reject benign clothing, swimwear, alcohol or tobacco", () => {
  for (const name of ["Female Swimwear Or Underwear", "Male Swimwear Or Underwear", "Barechested Male", "Revealing Clothes", "Alcohol", "Tobacco"]) expect(classifyPhoto(screening([{ name, confidence: 99 }])).state).toBe("APPROVED");
  expect(classifyPhoto(screening([{ name: "Female Swimwear Or Underwear", confidence: 99 }], "rejected")).state).toBe("NEEDS_REVIEW");
});
it("holds broad ambiguous categories without treating them as proof of prohibited content", () => {
  for (const name of ["Suggestive", "Visually Disturbing"]) expect(classifyPhoto(screening([{ name, confidence: 99 }])).state).toBe("NEEDS_REVIEW");
  expect(classifyPhoto(screening([{ name: "Suggestive", confidence: 99 }, { name: "Female Swimwear Or Underwear", parent_name: "Suggestive", confidence: 99 }])).state).toBe("APPROVED");
});
it("holds unknown categories and never approves incomplete, mixed or malformed provider data", () => {
  expect(classifyPhoto(screening([{ name: "A newly introduced risk", confidence: 10 }])).state).toBe("NEEDS_REVIEW");
  for (const status of ["pending", "queued"]) expect(classifyPhoto(screening([], status)).state).toBe("PROCESSING");
  for (const value of [null, {}, { moderation: [] }, screening([], "aborted"), screening([{ name: "Explicit Nudity", confidence: NaN }]), screening([{ name: "Explicit Nudity", confidence: 101 }]), { moderation: [{ kind: "manual", status: "approved" }] }]) {
    expect(classifyPhoto(value)).toMatchObject({ state: "CHECK_FAILED", complete: false });
  }
  const mixed = screening(); mixed.moderation.push({ kind: "manual", status: "pending", response: { moderation_labels: [] } });
  expect(classifyPhoto(mixed).state).not.toBe("APPROVED");
});
