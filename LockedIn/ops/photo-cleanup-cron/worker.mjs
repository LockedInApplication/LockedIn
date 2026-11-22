// The destination is deliberately fixed: a misconfigured URL must not receive the credential.
const productionEndpoint = "https://lockedin-9yon.onrender.com/internal/account-photo-cleanup/tick";
const retryDelays = [0, 8_000, 20_000, 35_000];

export async function tick(secret, request = globalThis.fetch, delay = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (typeof secret !== "string" || !/^[0-9a-f]{64}$/.test(secret)) throw new Error("Missing account photo cleanup trigger secret");
  let lastOutcome = "network error";
  for (const interval of retryDelays) {
    if (interval) await delay(interval);
    let response;
    try {
      response = await request(productionEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json", "Cache-Control": "no-store" },
        // Workers does not implement redirect: "error". Handle the redirect without following it.
        redirect: "manual",
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      lastOutcome = "network error";
      continue;
    }
    lastOutcome = `HTTP ${response.status}`;
    const completed = response.status === 204 && response.headers.get("X-LockedIn-Cleanup") === "completed";
    await response.body?.cancel().catch(() => {});
    if (completed) return;
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Account photo cleanup trigger refused a redirect (${lastOutcome})`);
    }
    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
      throw new Error(`Account photo cleanup trigger was rejected (${lastOutcome})`);
    }
    // A Render cold start can return a loading page with a successful HTTP status.
  }
  throw new Error(`Account photo cleanup did not confirm a completed round (${lastOutcome})`);
}

export default {
  async scheduled(_event, env) {
    await tick(env.ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET);
    console.info("Account photo cleanup round completed");
  },
};
