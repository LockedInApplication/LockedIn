import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { cleanupTriggerPath, registerAccountPhotoTrigger } from "./account-photo-trigger.routes.js";

const trigger = "a".repeat(64);
const headers = { authorization: `Bearer ${trigger}` };

afterEach(() => vi.unstubAllEnvs());

it("wakes only the existing cleanup round with the exact token and no caller-supplied data", async () => {
  vi.stubEnv("ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET", trigger);
  const app = Fastify();
  const runDeletionRound = vi.fn(async () => {});
  app.register(registerAccountPhotoTrigger, { runDeletionRound });
  try {
    expect((await app.inject({ method: "POST", url: cleanupTriggerPath })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: cleanupTriggerPath, headers: { authorization: `Bearer ${"b".repeat(64)}` } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: cleanupTriggerPath, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `${cleanupTriggerPath}?account=other`, headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: cleanupTriggerPath, headers, payload: { account: "other" } })).statusCode).toBe(400);
    expect(runDeletionRound).not.toHaveBeenCalled();
    const result = await app.inject({ method: "POST", url: cleanupTriggerPath, headers });
    expect(result.statusCode).toBe(204);
    expect(result.headers["x-lockedin-cleanup"]).toBe("completed");
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toBe("");
    expect(runDeletionRound.mock.calls).toEqual([[]]);
  } finally { await app.close(); }
});

it("reports unavailable rounds without credentials or error details", async () => {
  vi.stubEnv("ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET", "");
  const app = Fastify();
  const runDeletionRound = vi.fn<() => Promise<void> | null>().mockReturnValueOnce(null).mockRejectedValueOnce(Error("private storage error"));
  app.register(registerAccountPhotoTrigger, { runDeletionRound });
  try {
    expect((await app.inject({ method: "POST", url: cleanupTriggerPath, headers })).statusCode).toBe(404);
    vi.stubEnv("ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET", trigger);
    for (let i = 0; i < 2; i++) {
      const response = await app.inject({ method: "POST", url: cleanupTriggerPath, headers });
      expect(response.statusCode).toBe(503);
      expect(response.headers["x-lockedin-cleanup"]).toBeUndefined();
      expect(response.body).toBe("");
    }
    expect(runDeletionRound).toHaveBeenCalledTimes(2);
  } finally { await app.close(); }
});
