import { afterEach, expect, it, vi } from "vitest";
import { journeyRequest } from "../../journey/journey.client";

afterEach(() => vi.unstubAllGlobals());
it("lets the browser supply the multipart content type and boundary", async () => {
  const body = new FormData(); body.append("requestId", "synthetic");
  const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(new Headers(init.headers).get("X-Discovery-Owner")).toBe("test-owner");
    return new Response("{}");
  });
  vi.stubGlobal("fetch", fetcher);
  await journeyRequest("/api/discovery/photos", { method: "POST", body, headers: { "X-Discovery-Owner": "test-owner" } });
  expect(fetcher).toHaveBeenCalledOnce();
});
