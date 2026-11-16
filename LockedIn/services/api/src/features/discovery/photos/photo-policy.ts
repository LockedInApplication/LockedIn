import type { PhotoDecision, PhotoProviderStatus, PhotoScreeningLabel } from "./photo.types.js";

const LEGACY_PHOTO_POLICY_VERSION = "aws-rek-photo-v1";
export const PHOTO_POLICY_VERSION = "aws-rek-photo-v2";
const REVIEW_THRESHOLD = 50;
const REJECTION_THRESHOLD = 90;
const prohibited = new Set(["Explicit Nudity", "Nudity", "Graphic Male Nudity", "Graphic Female Nudity", "Exposed Male Genitalia", "Exposed Female Genitalia", "Exposed Buttocks Or Anus", "Exposed Female Nipple", "Explicit Sexual Activity", "Sexual Activity", "Sexual Intercourse", "Sex Toys", "Graphic Violence Or Gore", "Graphic Violence", "Gore", "Hate Symbols", "Nazi Party", "White Supremacy", "Extremist"]);
const uncertain = new Set(["Implied Nudity", "Sexualized Nudity", "Non-Explicit Nudity", "Non-Explicit Nudity of Intimate parts and Kissing", "Female Breast", "Partial Nudity", "Sexual Situations", "Sexual Gestures", "Violence", "Visually Disturbing"]);
// Group labels are not enough to reject benign child categories.
const benign = new Set(["Suggestive", "Swimwear Or Underwear", "Female Swimwear Or Underwear", "Male Swimwear Or Underwear", "Barechested Male", "Revealing Clothes", "Alcohol", "Alcoholic Beverages", "Drinking", "Tobacco", "Smoking", "Tobacco Products"]);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizeLabel = (name: string) => name.trim().toLowerCase();
const normalizeSet = (names: Set<string>) => new Set([...names].map(normalizeLabel));
const v2Categories = { prohibited: normalizeSet(prohibited), uncertain: normalizeSet(uncertain), benign: normalizeSet(benign) };

function screeningTriggers(labels: PhotoScreeningLabel[], providerStatus: PhotoProviderStatus | null, version: typeof PHOTO_POLICY_VERSION | typeof LEGACY_PHOTO_POLICY_VERSION) {
  // Reconstruct historical decisions with their original rules, not today's policy.
  const legacy = version === LEGACY_PHOTO_POLICY_VERSION;
  const categories = legacy ? { prohibited, uncertain, benign } : v2Categories;
  const comparable = (name: string) => legacy ? name : normalizeLabel(name);
  const suggestiveName = comparable("Suggestive");
  const suggestive = labels.some(child => comparable(child.parent) === suggestiveName && (legacy || child.confidence >= REVIEW_THRESHOLD))
    ? [] : labels.filter(label => comparable(label.name) === suggestiveName && (legacy || label.confidence >= REVIEW_THRESHOLD));
  const broadTriggers = suggestive.map(label => ({ rule: "Broad suggestive label without a more specific category", label, rejects: false }));
  if (legacy && broadTriggers.length) return broadTriggers;
  const rejects = labels.filter(label => (categories.prohibited.has(comparable(label.name)) || categories.prohibited.has(comparable(label.parent))) && label.confidence >= REJECTION_THRESHOLD);
  if (rejects.length) return rejects.map(label => ({ rule: "Prohibited category at or above the rejection threshold", label, rejects: true }));
  const reviews = labels.flatMap(label => {
    const name = comparable(label.name), parent = comparable(label.parent);
    const aboveThreshold = label.confidence >= REVIEW_THRESHOLD;
    const unknown = !categories.benign.has(name) && !categories.prohibited.has(name) && !categories.uncertain.has(name);
    const elevated = aboveThreshold && (categories.prohibited.has(name) || categories.prohibited.has(parent) || categories.uncertain.has(name) || categories.uncertain.has(parent));
    return (unknown && (legacy || aboveThreshold)) || elevated ? [{ rule: unknown ? "Unrecognized screening label" : "Sensitive category at or above the review threshold", label, rejects: false }] : [];
  });
  return [...broadTriggers, ...reviews, ...(providerStatus === "rejected" ? [{ rule: "Provider rejected the photo without a matching app rejection rule", label: null, rejects: false }] : [])];
}

export function explainPhotoScreening(screening: unknown, policyVersion: string | null) {
  const stored = record(screening) ? screening : null;
  const values = Array.isArray(screening) ? screening : stored?.labels;
  if (!Array.isArray(values)) return null;
  const labels: PhotoScreeningLabel[] = [];
  for (const item of values) {
    if (!record(item) || typeof item.name !== "string" || typeof item.parent !== "string" || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 100) return null;
    labels.push({ name: item.name, parent: item.parent, confidence: item.confidence });
  }
  const status = stored?.providerStatus;
  const providerStatus = status === "approved" || status === "rejected" ? status : null;
  const triggers = policyVersion === PHOTO_POLICY_VERSION || policyVersion === LEGACY_PHOTO_POLICY_VERSION
    ? screeningTriggers(labels, providerStatus, policyVersion).map(({ rule, label }) => ({ rule, label })) : [];
  return { policyVersion, providerStatus, labels, triggers };
}

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
  const providerStatus = result.status;
  const triggers = screeningTriggers(labels, providerStatus, PHOTO_POLICY_VERSION);
  const outcome = triggers.some(trigger => trigger.rejects) ? decision("REJECTED", "Photo does not meet the discovery photo policy", true, labels)
    : triggers.length ? decision("NEEDS_REVIEW", "Photo needs a moderator review", true, labels)
      : decision("APPROVED", "Ready to publish", true, labels);
  return { ...outcome, providerStatus };
}
