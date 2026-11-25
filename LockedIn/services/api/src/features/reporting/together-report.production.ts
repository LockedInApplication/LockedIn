import { createPublicKey } from "node:crypto";

// This is a verifier, not an authentication secret. Only the owner's Mac has
// the matching signing key. The default is restricted to the production API.
const approvedPublicKey = "MCowBQYDK2VwAyEAkdRZQmO/z7XP62zO3UAPTxeNMDezzDBFU1iLEcHs6ko=";
const productionApiId = "srv-dbsr5j6i0phs73dtrkq0";

export function productionTogetherReportKey(settings = process.env) {
  if (settings.RENDER !== "true" || settings.RENDER_SERVICE_ID !== productionApiId ||
      settings.RENDER_GIT_BRANCH !== "production" || settings.IS_PULL_REQUEST === "true" ||
      settings.TOGETHER_REPORT_HTTPS_DISABLED === "true") return null;
  const encoded = settings.TOGETHER_REPORT_PUBLIC_KEY ?? approvedPublicKey;
  // Ed25519 DER/SPKI; reject invalid configuration without affecting other API routes.
  if (!/^[A-Za-z0-9+/]{59}=$/.test(encoded)) return null;
  try {
    const key = createPublicKey({ format: "der", type: "spki", key: Buffer.from(encoded, "base64") });
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}
