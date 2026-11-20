// Local production UI acceptance. API/provider responses are synthetic; no email is sent.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.LOCKEDIN_PLAYWRIGHT_MODULE || "playwright");
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = mkdtempSync(path.join(tmpdir(), "lockedin-email-verification-"));
const log = openSync(path.join(artifacts, "preview.log"), "a");
const port = await new Promise((resolve, reject) => { const server = createServer(); server.on("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_API_URL: "", API_PROXY_URL: "http://127.0.0.1:1" };
const next = path.join(web, "node_modules/next/dist/bin/next");
let preview, browser;
console.log(`Verification browser artifacts: ${artifacts}`);
try {
  const build = spawn(process.execPath, [next, "build", "--webpack"], { cwd: web, env, stdio: ["ignore", log, log] });
  assert.equal(await new Promise(resolve => build.on("exit", resolve)), 0, `Build failed: ${artifacts}/preview.log`);
  preview = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: web, env, stdio: ["ignore", log, log] });
  for (let tries = 0; ; tries++) {
    assert(tries < 100 && preview.exitCode === null, "Owned preview failed to start");
    try { if ((await fetch(`${base}/verify-email?pending=1`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: process.env.LOCKEDIN_BROWSER_CHANNEL || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: "reduce" });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let account = null, verified = false, sends = 0, mode = "success", release = null, freshChecks = 0;
  let useCurrentSessionFlag = false;
  const user = () => account ? { id: account, name: "Test Person", email: `${account}@example.test`, emailVerified: false, image: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : null;
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (endpoint.endsWith("/get-session")) {
      const person = user(), fresh = url.searchParams.get("disableCookieCache") === "true";
      if (fresh) freshChecks++;
      return json(person ? { user: { ...person, emailVerified: fresh || useCurrentSessionFlag ? verified : false }, session: { id: `synthetic-${account}`, userId: account, token: "synthetic-only", expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } : null);
    }
    if (endpoint.endsWith("/send-verification-email")) {
      sends++;
      const body = request.postDataJSON();
      assert.equal(body.callbackURL, `${base}/verify-email?pending=1&returnTo=%2Fjourney`);
      assert.equal(body.email, account ? `${account}@example.test` : "manual@example.test");
      const result = mode;
      if (result.startsWith("hold")) await new Promise(resolve => { release = resolve; });
      if (result.endsWith("failure")) return json({ code: "EMAIL_FAILURE", message: "SENSITIVE_PROVIDER_DETAIL" }, 500);
      if (result === "network") return route.abort("failed");
      return json({ status: true });
    }
    if (endpoint === "/api/profile") return json({ id: account, displayName: "Test Person", email: `${account}@example.test`, emailVerified: verified, avatarPreset: "initials", activityEmails: true, inAppActivity: true });
    if (endpoint === "/api/journey/invitation-blocks") return json({ items: [], nextCursor: null });
    if (endpoint === "/api/discovery/me") return json({ ownerId: account, value: { canDiscover: false, canModerate: false, hasHistory: false, canReflect: true, currentRelationshipId: null, areas: [], topics: [] } });
    if (endpoint === "/api/discovery/profile") return json({ ownerId: account, value: { draft: null, revision: 0, published: null, publicationVersion: 0, paused: false, adultAttested: false, suspended: false } });
    if (endpoint.endsWith("/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    if (endpoint.includes("notifications")) return json({ items: [], unreadCount: 0, nextCursor: null });
    return json({ error: `Unhandled synthetic endpoint: ${endpoint}` }, 404);
  });
  const resend = () => page.getByRole("button", { name: "Resend verification email", exact: true });
  const checkAgain = () => page.getByRole("button", { name: "I've verified my email — check again", exact: true });
  const waitRelease = async () => { for (let tries = 0; !release; tries++) { assert(tries < 100, "Pending email request never arrived"); await new Promise(resolve => setTimeout(resolve, 20)); } };

  await page.goto(`${base}/verify-email?pending=1`);
  await resend().waitFor();
  await page.getByLabel("Email address", { exact: true }).fill("manual@example.test");
  await resend().click();
  await page.getByRole("status").filter({ hasText: "Verification email requested" }).waitFor();
  assert.equal(sends, 1);
  assert.equal(await page.getByRole("heading", { name: "Your email is verified.", exact: true }).count(), 0);
  for (const suffix of ["", "?verified=1", "?error=invalid_token"]) {
    await page.goto(`${base}/verify-email${suffix}`); await resend().waitFor();
    assert.equal(await page.getByRole("heading", { name: "Your email is verified.", exact: true }).count(), 0);
  }
  account = "a";
  await page.goto(`${base}/verify-email?pending=1`);
  await checkAgain().waitFor();
  assert.equal(await page.getByLabel("Email address", { exact: true }).inputValue(), "a@example.test");
  for (const outcome of ["hold-failure", "hold-success", "network"]) {
    mode = outcome; release = null; const count = sends;
    await resend().click();
    if (outcome.startsWith("hold")) {
      await waitRelease();
      assert(await page.getByRole("button", { name: "Sending…", exact: true }).isDisabled());
      await page.locator("form").evaluate(form => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      assert.equal(sends, count + 1, "Duplicate submit during pending request must not send twice");
      release();
    }
    if (outcome === "hold-success") await page.getByRole("status").filter({ hasText: "Verification email requested" }).waitFor();
    else await page.getByRole("alert").filter({ hasText: "Could not send" }).waitFor();
    await resend().waitFor(); assert(!(await resend().isDisabled()));
    assert(!(await page.locator("main").innerText()).includes("SENSITIVE_PROVIDER_DETAIL"));
    assert.equal(await page.getByRole("heading", { name: "Your email is verified.", exact: true }).count(), 0);
  }
  await checkAgain().click();
  await page.getByRole("status").filter({ hasText: "not verified yet" }).waitFor();
  const beforeCheck = freshChecks; verified = true;
  await checkAgain().click();
  await page.getByRole("heading", { name: "Your email is verified.", exact: true }).waitFor();
  assert(freshChecks > beforeCheck, "Check again must bypass stale cookie status");
  assert.equal(await resend().count(), 0);
  assert.equal(await page.getByRole("link", { name: "Continue to LockedIn" }).getAttribute("href"), "/journey");
  await page.screenshot({ path: path.join(artifacts, "verified-393.png"), fullPage: true });

  // Change accounts via the same cross-tab signal Better Auth uses; don't replace app code.
  verified = false; account = "a";
  await page.goto(`${base}/verify-email?pending=1`); await checkAgain().waitFor();
  mode = "hold-success"; release = null;
  await resend().click(); await waitRelease();
  account = "b";
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "better-auth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "updateUser" } }) })));
  await page.getByLabel("Email address", { exact: true }).filter({ visible: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[type="email"]')?.value === "b@example.test");
  const oldCompletion = page.waitForResponse(response => response.url().endsWith("/send-verification-email"));
  release(); await oldCompletion;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole("status").filter({ hasText: "Verification email requested" }).count(), 0, "Old account completion must not update the new account");
  mode = "success";
  await resend().click(); await page.getByRole("status").filter({ hasText: "Verification email requested" }).waitFor();

  if (process.env.EMAIL_VERIFY_STAGE !== "shared") {
    for (const path of ["/profile", "/discover", "/journey?view=roadmap", "/connections?compose=invite", "/messages/example"]) {
      await page.goto(`${base}${path}`);
      await page.waitForURL(url => url.pathname === "/verify-email" && url.searchParams.get("returnTo") === path);
      await resend().waitFor();
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0);
    }
    await page.goto(`${base}/profile`);
    await checkAgain().waitFor();
    verified = true; useCurrentSessionFlag = true;
    await checkAgain().click();
    await page.getByRole("link", { name: "Continue to LockedIn", exact: true }).click();
    await page.waitForURL(`${base}/profile`);
    await page.getByText("Email verified", { exact: true }).waitFor();
    await page.goto(`${base}/discover`); await page.getByRole("heading", { name: "Discovery is not available.", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Verify email", exact: true }).count(), 0);
  }
  verified = false;
  await page.goto(`${base}/verify-email?pending=1`); await resend().waitFor();
  for (const width of [320, 393, 1280]) {
    await page.setViewportSize({ width, height: 852 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px no overflow`);
    for (const control of await page.locator("main input, main button, main a").all()) assert((await control.boundingBox()).height >= 44, "44px touch target");
    await page.screenshot({ path: path.join(artifacts, `verify-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log("PASS verification resend, no false success, failures, duplicate submission, stale status, account switch and layouts" + (process.env.EMAIL_VERIFY_STAGE === "shared" ? "" : ", mandatory member gate and return path"));
} finally {
  if (browser) await browser.close();
  if (preview) { preview.kill("SIGTERM"); await new Promise(resolve => preview.exitCode !== null ? resolve() : preview.once("exit", resolve)); }
  closeSync(log);
}
