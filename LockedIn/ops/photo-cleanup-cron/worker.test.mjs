import assert from "node:assert/strict";
import { test } from "node:test";
import { tick } from "./worker.mjs";

const secret = "a".repeat(64);
const done = () => new Response(null, { status: 204, headers: { "X-LockedIn-Cleanup": "completed" } });
const immediate = async () => {};

test("retries a cold/loading origin, a transient failure, and an unreachable request", async () => {
  const responses = [() => new Response("Render loading", { status: 200 }), () => new Response(null, { status: 503 }), () => { throw Error("timeout"); }, done];
  const waits = [];
  await tick(secret, async (url, request) => {
    assert.equal(url, "https://lockedin-9yon.onrender.com/internal/account-photo-cleanup/tick");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, `Bearer ${secret}`);
    assert.equal(request.redirect, "manual");
    assert.equal(request.body, undefined);
    return responses.shift()();
  }, async ms => waits.push(ms));
  assert.deepEqual(waits, [8_000, 20_000, 35_000]);
  assert.equal(responses.length, 0);
});

test("refuses redirects without using or logging their destination", async () => {
  let calls = 0;
  await assert.rejects(tick(secret, async (_url, request) => {
    calls++;
    assert.equal(request.redirect, "manual");
    return new Response("untrusted", { status: 302, headers: { Location: "https://redirect.invalid" } });
  }, immediate), { message: "Account photo cleanup trigger refused a redirect (HTTP 302)" });
  assert.equal(calls, 1);
});

test("does not retry authorization rejections or treat unknown success responses as completion", async () => {
  let calls = 0;
  await assert.rejects(tick(secret, async () => { calls++; return new Response(null, { status: 404 }); }, immediate), /rejected/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(tick(secret, async () => { calls++; return new Response(null, { status: 204 }); }, immediate), /did not confirm/);
  assert.equal(calls, 4);
  await assert.rejects(tick("", async () => { throw Error("unexpected request"); }, immediate), /Missing/);
});
