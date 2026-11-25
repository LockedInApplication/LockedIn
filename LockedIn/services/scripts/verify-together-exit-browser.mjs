import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";

const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const link = (scope, name) => scope.getByRole("link", { name, exact: true });
const composer = (page) => page.getByRole("textbox", { name: "Message", exact: true });

export async function verifyPhotoCleanupReceipt({ prisma, base, alex, alexPage: a }) {
  const password = "disposable-photo-cleanup-password";
  const { auth } = await import("../api/src/lib/auth.ts");
  const hash = await (await auth.$context).password.hash(password);
  await prisma.account.create({ data: { id: randomUUID(), accountId: alex.id, userId: alex.id, providerId: "credential", password: hash } });
  const profile = await prisma.discoveryProfile.create({ data: { ownerId: alex.id, draft: { revision: 0 } } });
  const id = randomUUID(), publicId = `lockedin-discovery/${id}`;
  await prisma.discoveryPhoto.create({ data: { id, publicId, ownerId: alex.id, profileId: profile.id, requestId: randomUUID(), payloadHash: "0".repeat(64), assetId: "synthetic", assetVersion: 1, state: "APPROVED", scanCompleted: true } });

  await a.goto(base + "/profile");
  const deletion = a.getByRole("region", { name: "Delete account", exact: true });
  await button(deletion,"Delete account").click();
  await deletion.getByLabel("Current password", { exact: true }).fill(password);
  await button(deletion,"Permanently delete account").click();
  await a.waitForURL(base + "/account-deletion");
  const request = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { userId: alex.id } });
  await a.getByText(request.id, { exact: true }).waitFor();
  assert.equal(request.state, "CLEANING_PHOTOS");
  assert.equal((await a.request.get(base + "/api/profile")).status(), 401);
  assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await a.reload();
  await a.getByText(request.id, { exact: true }).waitFor();
  const { runAccountPhotoCleanup } = await import("../api/src/features/profile/account-photo-cleanup.ts");
  const erased = [];
  await runAccountPhotoCleanup({ destroy: async ({ publicId }) => { erased.push(publicId); return "destroyed"; } });
  assert.deepEqual(erased, [publicId]);
  assert.equal(await prisma.user.findUnique({ where: { id: alex.id } }), null);
  console.log("PASS confirmed photo deletion shows a private receipt after sign-out and finishes after fake storage confirms erasure");
}

export async function verifyTogetherExit({ browser, prisma, base, outbox, alex, alexPage: a, sampleArea, sampleVenue, artifacts }) {
  const email = "sam-together-exit@example.test", password = "disposable-two-account-password";
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const b = await context.newPage();
  b.setDefaultTimeout(15000);
  try {
    await a.goto(base + "/connections?compose=invite");
    await a.getByLabel("Their email", { exact: true }).fill(email);
    await button(a,"Send private invite").click();
    const invitation = await a.getByLabel("Private invitation link", { exact: true }).inputValue();
    const invitationUrl = new URL(invitation);
    assert.equal(invitationUrl.origin, base);
    await b.goto(invitation);
    await link(b,"Sign up").click();
    for (const [label, value] of Object.entries({ "First name":"Sam", "Last name":"Tester", Email:email, Password:password, "Confirm password":password })) {
      await b.getByLabel(label, { exact: true }).fill(value);
    }
    await button(b,"Sign Up").click();
    await b.getByRole("heading", { name: "Verify your email", exact: true }).waitFor();
    assert.equal(new URL(b.url()).searchParams.get("returnTo"), invitationUrl.pathname + invitationUrl.search);
    const sam = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(sam.emailVerified, false);
    const verification = outbox.find(mail => mail.subject === "Verify your LockedIn email" && [mail.to].flat().includes(email));
    assert(verification, "The local mail sink received Sam’s verification email");
    const confirmationLink = verification.text.split("\n").find(line=>line.startsWith("http"));
    assert.equal(new URL(confirmationLink).hostname,"127.0.0.1");
    await b.goto(confirmationLink);
    await link(b,"Continue to LockedIn").click();
    await button(b,"Accept and chat").click();
    await composer(b).waitFor();
    assert.equal(await button(b,"Try a prompt").count(), 0);
    const chatUrl = b.url(), conversationId = new URL(chatUrl).pathname.split("/").at(-1);
    assert.equal(await prisma.relationshipMember.count({ where: { userId: sam.id } }), 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).emailVerified, true);
    for (const [id, name] of [[alex.id,"Alex"],[sam.id,"Sam"]]) {
      const draft = { publicName:name, avatarPreset:"leaf", bio:"Local browser fixture", areaId:"nearby", intention:"LONG_TERM", interests:["Reading"], pace:null };
      await prisma.discoveryProfile.create({ data: {
        ownerId:id, draft:{ revision:1, profile:draft }, publishedSnapshot:draft, publishedAreaId:"nearby", publishedIntention:"LONG_TERM", publicationVersion:1,
        adultAttestedAt:new Date(), publicationConsentedAt:new Date(), publicationConsentVersion:1, publishedAt:new Date(),
      } });
    }
    await b.addInitScript(() => {
      // Deterministic denied-permission fixture; never request a real device location.
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: (_success, onError) => onError({ code: 1 }) });
    });
    await b.goto(base + "/discover");
    await button(b,"Confirm my location").click();
    await b.getByRole("alert").filter({ hasText: "Location permission is off" }).waitFor();
    await button(b,"Go to Inbox").click();
    await b.getByRole("button", { name: /Alex.*Started from a direct invite/ }).click();
    await composer(b).fill("Hello from Sam");
    await button(b,"Send message").click();
    await a.goto(chatUrl);
    await a.getByText("Hello from Sam", { exact: true }).waitFor();
    await composer(a).fill("Coffee this weekend?");
    await button(a,"Send message").click();
    await b.reload();
    await b.getByText("Coffee this weekend?", { exact: true }).waitFor();
    console.log("PASS invitation, real verification link via local mail, first messages, and denied location with Inbox access");

    const sheet = (page) => page.getByRole("dialog").filter({ has: button(page,"Close") });
    await button(a,"Plan a date").click();
    await button(sheet(a),"Browse on my own").click();
    await sheet(a).getByRole("combobox", { name: "Starting area", exact: true }).selectOption(sampleArea.areaId);
    await button(sheet(a),"Show places").click();
    await sheet(a).getByRole("button", { name: new RegExp(sampleVenue.name) }).click();
    await button(sheet(a),"Choose this place").click();
    await sheet(a).getByLabel("Day", { exact: true }).fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10));
    await sheet(a).getByLabel("Time", { exact: true }).fill("18:30");
    await button(sheet(a),"Send invite").click();
    await sheet(a).getByText("Waiting for their reply", { exact: true }).waitFor();
    await button(sheet(a),"Close").click();
    await b.reload();
    await b.locator("[data-date-toggle]").filter({ hasText:"Date invite" }).click();
    await button(sheet(b),"Confirm").click();
    await sheet(b).getByRole("region", { name: "Date confirmed", exact: true }).waitFor();
    await button(sheet(b),"Close").click();
    console.log("PASS date proposal and confirmation across both accounts");

    // Report only (not block) to exercise the real assisted-deletion eligibility case later.
    const reportedMessage = a.locator("[data-message-id]").filter({ hasText:"Hello from Sam" });
    await reportedMessage.getByLabel("Message actions", { exact: true }).click();
    await button(a,"Report message").click();
    await a.getByRole("combobox", { name: "Reason", exact: true }).selectOption("SPAM");
    await button(a,"Send report").click();
    await a.getByText("Report received for moderator review.", { exact: true }).waitFor();
    await button(a,"Close message report").click();

    const ask = async () => {
      await button(a,"Ask to lock in").click();
      await button(a.getByRole("alertdialog", { name: "Ask to lock in?", exact: true }),"Send request").click();
      await a.getByText(/Your invitation to lock in was sent/).waitFor();
      await b.reload();
    };
    await ask();
    await button(b,"Not now").click();
    await button(b,"Ask to lock in").waitFor();
    assert.equal(await prisma.relationshipMember.count({ where: { userId: sam.id } }), 0);
    await a.reload();
    await ask();
    await button(b,"Lock in together").click();
    await button(b.getByRole("alertdialog", { name:"Lock in together?", exact:true }),"Yes, lock in").click();
    await link(b,"Open Together").click();
    await link(b,"Message Alex").waitFor();
    assert.equal(await b.getByText("Shared progress", { exact:true }).count(), 0);
    assert.equal(await button(b,"Try a prompt").count(), 0);
    const space = await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert(space.relationshipId);
    const homeNotes = `/api/journey/relationships/${space.relationshipId}/home-notes`;
    const messagesBeforeNotes = await prisma.discoveryMessage.count({ where: { conversationId } });
    await a.setViewportSize({ width:390, height:844 });
    await a.goto(base + "/journey");
    await button(b,"Write the first note").waitFor();
    await button(a,"Write the first note").click();
    const firstDraft = a.getByRole("textbox", { name: /^Note to Sam/ });
    await firstDraft.waitFor();
    assert.equal(a.url(), base + "/journey");
    assert(await firstDraft.evaluate(el => document.activeElement === el));
    assert(await button(a,"Share note").isDisabled());
    await firstDraft.fill("A private draft that will be canceled");
    assert.equal(await prisma.togetherHomeNote.count({ where: { relationshipId:space.relationshipId } }),0);
    await button(a,"Cancel").click();
    await button(a,"Write the first note").click();
    assert.equal(await firstDraft.inputValue(), "");
    const note = "I loved our walk today.";
    await firstDraft.fill(note);
    assert.equal(await b.getByText(note, { exact:false }).count(),0);
    if (artifacts) await a.screenshot({ path: path.join(artifacts,"together-note-draft-390.png") });
    await button(a,"Share note").click();
    await a.getByText(/^Note shared with Sam/).waitFor();
    const received = b.getByRole("region", { name:"A note from Alex", exact:true });
    await received.getByText(`“${note}”`, { exact:true }).waitFor();
    await b.reload();
    await received.getByText(`“${note}”`, { exact:true }).waitFor();
    if (artifacts) {
      const size = b.viewportSize();
      await b.setViewportSize({ width:390, height:844 });
      await b.screenshot({ path: path.join(artifacts,"together-note-received-390.png") });
      if (size) await b.setViewportSize(size);
    }
    await button(received,"Write one back").click();
    const reply = "Let’s go again on Sunday.";
    await b.getByRole("textbox", { name:"Note to Alex", exact:true }).fill(reply);
    await button(b,"Share note").click();
    await a.getByText(`“${reply}”`, { exact:true }).waitFor();
    assert.equal(await prisma.discoveryMessage.count({ where: { conversationId } }),messagesBeforeNotes);
    assert.equal(await prisma.togetherPhoto.count({ where: { relationshipId:space.relationshipId } }),0);
    assert.equal(await prisma.togetherEnvelope.count({ where: { relationshipId:space.relationshipId } }),0);
    console.log("PASS Together notes stay private while drafted, appear for the partner, and persist without photos, envelopes, or chat messages");

    const plansUrl = base + "/journey?view=roadmap";
    const outing = "Visit the sculpture garden";
    const outingCard = page => page.getByRole("article").filter({ has: page.getByRole("heading", { name: outing, exact: true }) });
    await a.goto(plansUrl);
    await button(a,"Suggest a plan").click();
    await a.getByLabel("Plan title", { exact: true }).fill(outing);
    await a.getByLabel("Day (optional)", { exact: true }).fill("2020-07-05");
    await a.getByLabel("Note (optional)", { exact: true }).fill("Plan note stays with the plan.");
    await button(a,"Send suggestion").click();
    await a.getByText("Suggestion sent.", { exact: true }).waitFor();
    await b.goto(plansUrl);
    await button(outingCard(b),"Accept").click();
    await b.getByText("Added to Coming up.", { exact: true }).waitFor();
    await a.reload();
    await button(outingCard(a),"Mark done").click();
    const saveMemory = button(outingCard(a),"Save a memory");
    await saveMemory.waitFor();
    assert(await outingCard(a).evaluate(el => el === document.activeElement), "Completing reveals and focuses the past plan");
    await saveMemory.click();
    const memoryForm = a.getByRole("form", { name:"Save a memory", exact:true });
    await memoryForm.waitFor();
    assert.equal(await memoryForm.getByLabel("Name this memory").inputValue(), outing);
    assert.equal(await memoryForm.locator("time").getAttribute("datetime"),"2020-07-05");
    assert.doesNotMatch(await memoryForm.innerText(), /Plan note stays with the plan/);
    assert.equal(await prisma.togetherPhoto.count({ where: { relationshipId:space.relationshipId } }),0);
    if (artifacts) await a.screenshot({ path: path.join(artifacts,"save-plan-memory-390.png") });
    await button(memoryForm,"Cancel").click();
    await saveMemory.waitFor();
    await saveMemory.click();
    const sharp = (await import("sharp")).default;
    const photoFile = await sharp({ create: { width: 160, height: 120, channels: 3, background: "#876952" } }).png().toBuffer();
    await memoryForm.locator('input[type="file"]').setInputFiles({ name:"local-garden-fixture.png", mimeType:"image/png", buffer:photoFile });
    await button(memoryForm,"Share photo").click();
    await a.getByText(/^Photo shared with Sam/).waitFor();
    await a.getByRole("img", { name: outing, exact: true }).waitFor();
    await b.reload();
    await b.getByText("Past plans", { exact:true }).click();
    await button(outingCard(b),"Open memory").click();
    await b.getByRole("img", { name: outing, exact: true }).waitFor();
    await button(b,"+ Pin a detail").click();
    await button(b,"Place a pin on the photo").press("Enter");
    await b.getByLabel("Name this detail", { exact:true }).fill("The path");
    await button(b,"Text").click();
    await b.getByLabel("What do you remember?", { exact:true }).fill("It felt like the whole garden was ours.");
    await button(b,"Share note").click();
    await a.reload();
    await a.getByText("It felt like the whole garden was ours.", { exact:true }).waitFor();
    await button(b,"← Back to plan").click();
    await button(outingCard(b),"Undo done").click();
    await b.getByText("Plan moved back to Coming up.", { exact:true }).waitFor();
    await button(outingCard(b),"Mark done").waitFor();
    await button(outingCard(b),"Open memory").click();
    await b.getByRole("img", { name: outing, exact: true }).waitFor();
    assert.equal(await prisma.togetherPhoto.count({ where: { relationshipId:space.relationshipId } }),1);
    console.log("PASS completed plan prefilled a private photo draft, both guests opened the same memory, and undo kept it");

    const { previousTogetherWeek } = await import("../api/src/features/journey/our-week.service.ts");
    const { start: lastWeek } = previousTogetherWeek(new Date());
    const lastSaturday = new Date(lastWeek.getTime() + 5 * 86_400_000 + 12 * 3_600_000);
    const fixturePlan = await prisma.roadmapPlan.findFirstOrThrow({ where: { relationshipId: space.relationshipId, title: outing } });
    const envelope = await prisma.togetherEnvelope.create({ data: {
      relationshipId: space.relationshipId, title: "Garden day", tone: "LINEN",
      captions: { create: [
        { authorId: alex.id, text: "The sculptures caught the afternoon light." },
        { authorId: sam.id, text: "I want to walk that path again." },
      ] },
    } });
    await prisma.roadmapPlan.update({ where: { id: fixturePlan.id }, data: { status: "DONE", completedAt: lastSaturday } });
    const photo = await prisma.togetherPhoto.update({ where: { sourcePlanId: fixturePlan.id }, data: {
      title: "Light in the garden", envelopeId: envelope.id, createdAt: lastSaturday,
    } });
    await prisma.roomTalkTopic.create({ data: {
      relationshipId: space.relationshipId, authorId: alex.id, question: "Places to see next",
      phase: "DISCUSSED", discussedAt: lastSaturday,
    } });

    const weekPath = "/journey?view=our-week";
    const weekApi = `/api/journey/relationships/${space.relationshipId}/our-week`;
    let recapRequests = 0;
    const countRecap = request => { if (new URL(request.url()).pathname === weekApi) recapRequests++; };
    a.on("request",countRecap);
    await a.goto(base + "/journey");
    await link(a,"Our Week Together").waitFor();
    assert.equal(recapRequests,0,"Recap is not fetched on Together home");
    await link(a,"Our Week Together").click();
    await a.waitForURL(base + weekPath);
    const week = page => page.getByRole("region", { name: "Our Week Together", exact: true });
    await week(a).getByText("Places to see next", { exact: true }).waitFor();
    a.off("request",countRecap);
    for (const width of [320,390]) {
      await a.setViewportSize({ width, height:844 });
      assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width === 390 && artifacts) await a.screenshot({ path:path.join(artifacts,"our-week-recap-390.png") });
    }
    const planLink = page => week(page).getByRole("region", { name:"Plans", exact:true }).getByRole("link", { name:/^Visit the sculpture garden/ });
    await planLink(a).press("Enter");
    const fromWeekPlan = `/journey?view=roadmap&from=our-week#step-${fixturePlan.id}`;
    await a.waitForURL(base + fromWeekPlan);
    await button(outingCard(a),"Open memory").waitFor();
    await a.waitForFunction(id => document.activeElement?.id === "step-" + id, fixturePlan.id);
    await button(outingCard(a),"Open memory").click();
    const captions = page => page.getByRole("region", { name:"Captions from Garden day", exact:true });
    await captions(a).getByText(/sculptures caught/).waitFor();
    await captions(a).getByText(/walk that path again/).waitFor();
    await button(a,"← Back to plan").click();
    await a.waitForURL(base + fromWeekPlan);
    await link(a,"Our Week Together").click();
    await a.waitForURL(base + weekPath);
    const memoryLink = page => week(page).getByRole("region", { name:"Memories", exact:true }).getByRole("link", { name:/^Light in the garden/ });
    await memoryLink(a).click();
    await a.waitForURL(base + `/journey?view=memories&from=our-week#memory-photo/${photo.id}`);
    await a.getByRole("img", { name:"Light in the garden", exact:true }).waitFor();
    await captions(a).getByText(/walk that path again/).waitFor();
    if (artifacts) await a.screenshot({ path:path.join(artifacts,"our-week-memory-390.png") });
    await link(a,"Our Week Together").click();
    await a.waitForURL(base + weekPath);
    await b.goto(base + weekPath);
    await planLink(b).waitFor();
    await memoryLink(b).waitFor();
    assert.equal(await week(b).getByText("Only you and Alex",{exact:true}).count(),1);
    console.log("PASS opt-in-to-view recap for both partners, focus and back from the original plan and photo, both captions, mobile layout");
    await b.goto(base + "/journey");

    await link(b,"Message Alex").click();
    const prompt = button(b,"Try a prompt");
    await prompt.waitFor();
    assert.equal(await composer(b).inputValue(), "");
    const messagesBeforePrompt = await prisma.discoveryMessage.count({ where: { conversationId } });
    await prompt.click();
    await composer(b).fill("Leave my draft alone");
    const usePrompt = button(b,"Use in draft");
    assert(await usePrompt.isDisabled());
    assert.equal(await composer(b).inputValue(), "Leave my draft alone");
    await composer(b).fill("");
    await usePrompt.click();
    assert.match(await composer(b).inputValue(), /something we’ve done together/);
    assert.equal(await prisma.discoveryMessage.count({ where: { conversationId } }), messagesBeforePrompt);
    await link(b,"Back to Together").click();
    const home = b.getByRole("navigation", { name: "Together sections", exact: true });
    await home.getByRole("link", { name: /^Talk/ }).click();
    const talk = b.getByRole("navigation", { name: "Talk sections", exact: true });
    await talk.getByRole("link", { name: /^Check-ins/ }).click();
    const progress = b.getByRole("region", { name: "Shared progress", exact: true });
    await link(progress,"Shared progress").click();
    await b.getByRole("heading", { name: "Pick a topic", exact: true }).waitFor();
    await b.waitForURL(base + "/journey?view=conversations#your-topic");
    await link(b,"Check-ins").click();
    await link(b,"Talk").click();
    await talk.getByRole("link", { name: /^Atlas/ }).click();
    const atlas = b.getByRole("region", { name: "The Atlas of Us", exact: true });
    await atlas.getByRole("button", { name: /Support.*Unexplored/ }).waitFor();
    await a.goto(base + "/discover");
    await a.getByRole("heading", { name: "Discovery is paused while you’re locked in.", exact: true }).waitFor();
    console.log("PASS Not now, mutual Lock In, Discovery pause, both maps and the private check-in");

    await a.goto(base + "/journey");
    await link(a,"Manage Together").click();
    const manage = a.getByRole("heading", { name: "Manage Together", exact: true });
    await manage.waitFor();
    const shortcuts = a.getByRole("navigation", { name: "Where other things live", exact: true });
    assert.equal(await button(a,"Need a hand?").count(), 0);
    for (const width of [320, 390, 1280]) {
      await a.setViewportSize({ width, height: 844 });
      assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert((await link(shortcuts,"Chat safety").boundingBox()).height >= 44);
      assert((await link(shortcuts,"Discovery visibility").boundingBox()).height >= 44);
      assert((await link(shortcuts,"Together reporting").boundingBox()).height >= 44);
      if (width === 390 && artifacts) await a.screenshot({ path: path.join(artifacts, "manage-together-390.png") });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await link(shortcuts,"Chat safety").click();
    await a.waitForURL(base + `/messages/${conversationId}?from=manage-together#chat-safety`);
    const safety = a.locator("#chat-safety[open]");
    await button(safety,"Block contact").waitFor();
    await safety.getByText(/choose Report message/).waitFor();
    await a.waitForFunction(() => document.activeElement?.closest("details")?.id === "chat-safety");
    assert.equal(await a.getByRole("alertdialog").count(),0,"The shortcut does not open a destructive action");
    await link(a,"Back to Manage Together").click();
    await manage.waitFor();
    await link(shortcuts,"Discovery visibility").click();
    await a.waitForURL(base + "/discover/profile#discovery-visibility");
    const visibility = a.getByRole("group", { name: "Discovery visibility", exact: true });
    await button(visibility,"Resume visibility").waitFor();
    assert(await button(visibility,"Resume visibility").isDisabled(), "The shortcut cannot bypass Lock In");
    await a.waitForFunction(() => document.activeElement?.id === "discovery-visibility");
    await a.goBack();
    await manage.waitFor();

    await prisma.$executeRaw`INSERT INTO lockedin_reporting.pilot_pair (relationship_id) VALUES (${space.relationshipId})`;
    await link(shortcuts,"Together reporting").click();
    await a.waitForURL(base + "/profile#together-reporting");
    const reporting = a.getByRole("region", { name: "Together reporting", exact: true });
    await link(reporting,"Read the Together privacy notice").click();
    await a.waitForURL(base + "/privacy");
    await a.getByRole("heading", { name: "Together privacy notice", exact: true }).waitFor();
    await a.waitForFunction(() => window.scrollY === 0);
    await a.getByText(/Only couples who both agreed to the pilot are counted/).waitFor();
    assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (artifacts) await a.screenshot({ path: path.join(artifacts, "together-privacy-390.png") });
    await link(a,"Manage Together reporting").click();
    await a.waitForURL(base + "/profile#together-reporting");
    await button(reporting,"Opt out of Together reporting").click();
    await reporting.getByRole("status").filter({ hasText: /You’ve opted out/ }).waitFor();
    await a.reload();
    await reporting.getByRole("status").filter({ hasText: /You’ve opted out/ }).waitFor();
    assert.equal((await prisma.$queryRaw`SELECT 1 FROM lockedin_reporting.pilot_pair WHERE relationship_id = ${space.relationshipId}`).length, 0);
    await b.goto(base + "/profile#together-reporting");
    const partnerReporting = b.getByRole("region", { name: "Together reporting", exact: true });
    await button(partnerReporting,"Opt out of Together reporting").waitFor();
    assert.equal(await partnerReporting.getByText(/You’ve opted out/).count(), 0);
    console.log("PASS public Together privacy notice and private opt-out; partner not opted out, pilot enrollment removed");
    await a.goto(base + "/journey?view=options");
    await manage.waitFor();

    await button(a,"Leave Together").filter({ visible: true }).click();
    const exit = a.getByRole("alertdialog", { name: "Leave Together?", exact: true });
    await exit.getByText(/lose access to this space, its plans and memories, and any chat linked to it/).waitFor();
    await exit.getByText(/Neither profile becomes visible in Discovery automatically/).waitFor();
    assert(await button(exit,"Stay in Together").evaluate(el => el === document.activeElement));
    assert(await exit.evaluate(el => innerHeight - el.getBoundingClientRect().bottom <= 24), "Leave confirmation is a bottom sheet on phones");
    if (artifacts) await a.screenshot({ path: path.join(artifacts, "leave-together-390.png") });
    await button(exit,"Stay in Together").click();
    assert(await button(a,"Leave Together").filter({ visible: true }).evaluate(el => el === document.activeElement));
    assert.equal((await prisma.relationship.findUniqueOrThrow({ where: { id: space.relationshipId } })).status,"ACTIVE");
    await button(a,"Leave Together").filter({ visible: true }).click();
    await button(exit,"Leave Together").click();
    await link(a,"Review Discovery visibility").click();
    await button(a,"Resume visibility").waitFor();
    await b.goto(chatUrl);
    assert.equal((await b.request.get(base + `/api/messaging/conversations/${conversationId}/messages`)).status(),404);
    assert.equal((await b.request.get(base + homeNotes, { headers: { "X-Together-Owner":sam.id } })).status(),404);
    assert.equal((await a.request.get(base + weekApi, { headers: { "X-Together-Owner":alex.id } })).status(),404);
    assert.equal((await b.request.get(base + weekApi, { headers: { "X-Together-Owner":sam.id } })).status(),404);
    for (const id of [alex.id,sam.id]) assert((await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId:id } })).pausedAt);
    console.log("PASS Manage Together shortcuts, cancel and confirm exit, linked chat closure, and no automatic republication");
    const savedPublication = await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId:alex.id } });
    await button(a,"Resume visibility").click();
    await a.getByText("Discovery visibility resumed.", { exact:true }).waitFor();
    const resumed = await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId:alex.id } });
    assert.equal(resumed.pausedAt,null);
    assert.equal(resumed.publicationVersion,savedPublication.publicationVersion);
    assert.deepEqual(resumed.publishedSnapshot,savedPublication.publishedSnapshot);
    assert((await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId:sam.id } })).pausedAt);
    console.log("PASS Resume visibility returns the existing Discovery profile without rebuilding or republishing it; partner stays paused");

    await b.setViewportSize({ width:390, height:844 });
    await b.goto(base + "/profile");
    const deletion = b.getByRole("region", { name:"Delete account", exact: true });
    await button(deletion,"Delete account").click();
    await deletion.getByLabel("Current password", { exact: true }).fill(password);
    await button(deletion,"Permanently delete account").click();
    await deletion.getByRole("alert").filter({ hasText: "needs a manual review" }).waitFor();
    await button(deletion,"Request account deletion").click();
    assert(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Deletion request fits a phone-width viewport");
    await button(deletion,"Send deletion request").click();
    await deletion.getByText("Deletion request received", { exact: true }).waitFor();
    const ticket = await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { userId: sam.id } });
    await b.reload();
    await b.getByText(ticket.id, { exact: true }).waitFor();
    assert.equal(await prisma.discoveryReport.count({ where: { reportedUserId: sam.id, reporterId: alex.id } }),1);
    assert(await prisma.user.findUnique({ where: { id:sam.id } }));
    console.log("PASS assisted deletion request, durable private receipt, account still usable and safety evidence retained");
  } finally {
    await context.close();
  }
}
