import assert from "node:assert/strict";

const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const link = (scope, name) => scope.getByRole("link", { name, exact: true });
const composer = (page) => page.getByRole("textbox", { name: "Message", exact: true });

export async function verifyTogetherExit({ browser, prisma, base, outbox, alex, alexPage: a, sampleArea, sampleVenue }) {
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
    await b.getByRole("region", { name: "Shared progress", exact:true }).waitFor();
    await b.getByRole("link", { name: /^Private check-in/ }).click();
    await b.getByRole("heading", { name: "Pick a topic", exact: true }).waitFor();
    await b.goto(base + "/journey");
    await link(b,"Atlas").click();
    const atlas = b.getByRole("region", { name: "The Atlas of Us", exact: true });
    await atlas.getByRole("button", { name: /Support.*Unexplored/ }).waitFor();
    const space = await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert(space.relationshipId);
    await a.goto(base + "/discover");
    await a.getByRole("heading", { name: "Discovery is paused while you’re locked in.", exact: true }).waitFor();
    console.log("PASS Not now, mutual Lock In, Discovery pause, both maps and the private check-in");

    await a.goto(base + "/journey");
    await button(a,"Leave Together").filter({ visible: true }).click();
    const exit = a.getByRole("alertdialog", { name: "Leave Together?", exact: true });
    await exit.getByText(/closes any chat linked to this space/).waitFor();
    await exit.getByText(/Neither Discovery profile is made visible again automatically/).waitFor();
    await button(exit,"Stay in Together").click();
    assert.equal((await prisma.relationship.findUniqueOrThrow({ where: { id: space.relationshipId } })).status,"ACTIVE");
    await button(a,"Leave Together").filter({ visible: true }).click();
    await button(exit,"Leave Together").click();
    await link(a,"Review Discovery visibility").click();
    await button(a,"Resume visibility").waitFor();
    await b.goto(chatUrl);
    assert.equal((await b.request.get(base + `/api/messaging/conversations/${conversationId}/messages`)).status(),404);
    for (const id of [alex.id,sam.id]) assert((await prisma.discoveryProfile.findUniqueOrThrow({ where: { ownerId:id } })).pausedAt);
    console.log("PASS cancel and confirm exit, linked chat closure, and no automatic republication");

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
