import { expect, it } from "vitest";
import { classifyPhoto, explainPhotoScreening, PHOTO_POLICY_VERSION } from "../photo-policy.js";

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
it.each(["A newly introduced risk", "sUgGeStIvE"])("reviews %s only at or above 50 percent confidence", name => {
  expect(classifyPhoto(screening([{ name, confidence: 49.99 }])).state).toBe("APPROVED");
  expect(classifyPhoto(screening([{ name, confidence: 50 }])).state).toBe("NEEDS_REVIEW");
  expect(classifyPhoto(screening([{ name, confidence: 0.19 }], "rejected")).state).toBe("NEEDS_REVIEW");
});
it("does not hold an approved portrait for low-confidence provider labels", () => {
  const labels = [
    { name: "Obstructed Intimate Parts", parent_name: "Non-Explicit Nudity of Intimate parts and Kissing", confidence: 0.19 },
    { name: "Obstructed Female Nipple", parent_name: "Obstructed Intimate Parts", confidence: 0.19 },
    { name: "Swimwear or Underwear", confidence: 0.02 },
    { name: "Female Swimwear or Underwear", parent_name: "Swimwear or Underwear", confidence: 0.02 },
    { name: "Exposed Buttocks or Anus", parent_name: "Explicit Nudity", confidence: 0.004 },
    { name: "Suggestive", confidence: 0.01 },
  ];
  const result = classifyPhoto(screening(labels));
  expect(result).toMatchObject({ state: "APPROVED", complete: true, providerStatus: "approved", policyVersion: "aws-rek-photo-v2" });
  expect(explainPhotoScreening(result, result.policyVersion)?.triggers).toEqual([]);
});
it("matches names and parents case-insensitively without weakening rejection", () => {
  expect(classifyPhoto(screening([{ name: "Female Swimwear or Underwear", confidence: 99 }])).state).toBe("APPROVED");
  expect(classifyPhoto(screening([{ name: "sUgGeStIvE", confidence: 99 }, { name: "Female Swimwear or Underwear", parent_name: "SUGGESTIVE", confidence: 0.02 }])).state).toBe("NEEDS_REVIEW");
  expect(classifyPhoto(screening([{ name: "Suggestive", confidence: 99 }, { name: "Different provider name", parent_name: "EXPLICIT NUDITY", confidence: 90 }])).state).toBe("REJECTED");
  expect(classifyPhoto(screening([{ name: "Exposed Buttocks or Anus", confidence: 90 }])).state).toBe("REJECTED");
});
it("never approves incomplete, mixed or malformed provider data", () => {
  for (const status of ["pending", "queued"]) expect(classifyPhoto(screening([], status)).state).toBe("PROCESSING");
  for (const value of [null, {}, { moderation: [] }, screening([], "aborted"), screening([{ name: "Explicit Nudity", confidence: NaN }]), screening([{ name: "Explicit Nudity", confidence: 101 }]), { moderation: [{ kind: "manual", status: "approved" }] }]) {
    expect(classifyPhoto(value)).toMatchObject({ state: "CHECK_FAILED", complete: false });
  }
  const mixed = screening(); mixed.moderation.push({ kind: "manual", status: "pending", response: { moderation_labels: [] } });
  expect(classifyPhoto(mixed).state).not.toBe("APPROVED");
});
it("explains the winning rule for existing label-only records without guessing the provider result", () => {
  const label = { name: "Implied Nudity", parent: "", confidence: 50.25 };
  expect(explainPhotoScreening([label], "aws-rek-photo-v1")).toMatchObject({ providerStatus: null, triggers: [{ rule: "Sensitive category at or above the review threshold", label }] });
  expect(explainPhotoScreening([], PHOTO_POLICY_VERSION)).toMatchObject({ providerStatus: null, triggers: [] });
  expect(explainPhotoScreening([label], "unknown-policy")).toMatchObject({ labels: [label], triggers: [] });
  expect(explainPhotoScreening([{ ...label, confidence: 101 }], PHOTO_POLICY_VERSION)).toBeNull();
});
it("keeps reporting the historical trigger for a photo held under v1", () => {
  const label = { name: "Female Swimwear or Underwear", parent: "Swimwear or Underwear", confidence: 0.02 };
  const stored = { labels: [label], providerStatus: "approved" };
  expect(explainPhotoScreening(stored, "aws-rek-photo-v1")?.triggers).toEqual([{ rule: "Unrecognized screening label", label }]);
  expect(explainPhotoScreening(stored, PHOTO_POLICY_VERSION)?.triggers).toEqual([]);
});
it("explains a provider-only hold without inventing a confidence score", () => {
  const result = classifyPhoto(screening([], "rejected"));
  expect(result.state).toBe("NEEDS_REVIEW");
  expect(explainPhotoScreening(result, result.policyVersion)).toMatchObject({ providerStatus: "rejected", triggers: [{ rule: "Provider rejected the photo without a matching app rejection rule", label: null }] });
});
