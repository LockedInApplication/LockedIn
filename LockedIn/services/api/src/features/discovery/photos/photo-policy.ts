import type { PhotoDecision } from "./photo.types.js";

export const PHOTO_POLICY_VERSION = "aws-rek-photo-v1";
const prohibited = new Set(["Explicit Nudity", "Nudity", "Graphic Male Nudity", "Graphic Female Nudity", "Exposed Male Genitalia", "Exposed Female Genitalia", "Exposed Buttocks Or Anus", "Exposed Female Nipple", "Explicit Sexual Activity", "Sexual Activity", "Sexual Intercourse", "Sex Toys", "Graphic Violence Or Gore", "Graphic Violence", "Gore", "Hate Symbols", "Nazi Party", "White Supremacy", "Extremist"]);
const uncertain = new Set(["Implied Nudity", "Sexualized Nudity", "Non-Explicit Nudity", "Non-Explicit Nudity of Intimate parts and Kissing", "Female Breast", "Partial Nudity", "Sexual Situations", "Sexual Gestures", "Violence", "Visually Disturbing"]);
// Group labels are not enough to reject benign child categories.
const benign = new Set(["Suggestive", "Swimwear Or Underwear", "Female Swimwear Or Underwear", "Male Swimwear Or Underwear", "Barechested Male", "Revealing Clothes", "Alcohol", "Alcoholic Beverages", "Drinking", "Tobacco", "Smoking", "Tobacco Products"]);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function classifyPhoto(screening: unknown): PhotoDecision {
  const decision = (state: PhotoDecision["state"], reason: string, complete = false, labels: PhotoDecision["labels"] = []): PhotoDecision => ({ state, reason, complete, labels, policyVersion: PHOTO_POLICY_VERSION });
  const failed = () => decision("CHECK_FAILED", "Photo screening could not be completed");
  if (!record(screening) || !Array.isArray(screening.moderation) || screening.moderation.length !== 1) return failed();
  const result: unknown = screening.moderation[0];
  if (!record(result) || result.kind !== "aws_rek") return failed();
  if (result.status === "pending" || result.status === "queued") return decision("PROCESSING", "Checking photo");
  if (result.status !== "approved" && result.status !== "rejected") return failed();
  if (!record(result.response) || !Array.isArray(result.response.moderation_labels) || result.response.moderation_labels.length > 1000) return failed();
  const labels: PhotoDecision["labels"] = [];
  for (const item of result.response.moderation_labels as unknown[]) {
    if (!record(item) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 || typeof item.parent_name !== "string" || item.parent_name.length > 200 || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 100) return failed();
    labels.push({ name: item.name, parent: item.parent_name, confidence: item.confidence });
  }
  if (labels.some(label => label.name === "Suggestive" && !labels.some(child => child.parent === "Suggestive"))) return decision("NEEDS_REVIEW", "Photo needs a moderator review", true, labels);
  if (labels.some(label => (prohibited.has(label.name) || prohibited.has(label.parent)) && label.confidence >= 90)) return decision("REJECTED", "Photo does not meet the discovery photo policy", true, labels);
  if (labels.some(label => ((!benign.has(label.name) && !prohibited.has(label.name) && !uncertain.has(label.name)) || ((prohibited.has(label.name) || prohibited.has(label.parent) || uncertain.has(label.name) || uncertain.has(label.parent)) && label.confidence >= 50))) || result.status === "rejected") return decision("NEEDS_REVIEW", "Photo needs a moderator review", true, labels);
  return decision("APPROVED", "Ready to publish", true, labels);
}
