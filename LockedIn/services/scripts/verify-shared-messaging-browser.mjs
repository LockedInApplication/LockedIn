// Disposable local acceptance only. No production URL/database fallback.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, openSync, closeSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const database = new URL(process.env.DATABASE_URL ?? "invalid:");
if (!["localhost","127.0.0.1"].includes(database.hostname) || database.search || database.hash || !/^\/lockedin_discovery_test_[a-f0-9]{24}$/.test(database.pathname)) throw Error("Owned disposable localhost database required");
const { chromium } = await import(process.env.LOCKEDIN_PLAYWRIGHT_MODULE || "playwright");
const freePort = () => new Promise((resolve,reject) => { const s=createServer(); s.once("error",reject); s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(e=>e?reject(e):resolve(port));}); });
const webPort=await freePort(), apiPort=await freePort(), base=`http://127.0.0.1:${webPort}`;
Object.assign(process.env,{APP_URL:base,BETTER_AUTH_URL:`http://127.0.0.1:${apiPort}`,SHARED_MESSAGING_ENABLED:"true",DISCOVERY_CHAT_ENABLED:"true",DISCOVERY_ENABLED:"true",DISCOVERY_ACCESS_MODE:"pilot",DISCOVERY_MODERATOR_USER_IDS:"shared-browser-moderator",DISCOVERY_AREAS_JSON:'[{"id":"pilot-city","label":"Pilot city"}]',RESEND_API_KEY:"",RESEND_FROM_EMAIL:""});
const sampleArea = { areaId:"date-test",label:"Synthetic meetup area",latitude:40.75,longitude:-73.97 };
const sampleVenue = { id:"date-test-gallery",name:"Date Test Gallery",address:"1 Public Way",categories:["entertainment.culture.gallery"],latitude:40.746,longitude:-73.955 };
process.env.DISCOVERY_MATCH_PREFERENCES_REQUIRED="true";
Object.assign(process.env,{DATE_PLANS_ENABLED:"true",DATE_SPOTS_ENABLED:"true",DATE_SPOTS_GEOAPIFY_API_KEY:"local-fixture-only",DATE_SPOT_AREAS_JSON:JSON.stringify([sampleArea])});
const services=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."), web=path.resolve(services,"../apps/web");
const artifacts=mkdtempSync(path.join(tmpdir(),"lockedin-shared-chat-browser-")), log=openSync(path.join(artifacts,"preview.log"),"a");
console.log(`Shared chat browser artifacts: ${artifacts}`);
let prisma, api, build, preview, browser;
let venueProviderOffline = false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  ({prisma}=await import("../api/src/lib/prisma.ts"));
  const users=[];
  for (const label of ["Alex","Sam","Casey","Drew","Ellis","Finley"]) {
    const id=`shared-browser-${label.toLowerCase()}`,token=randomUUID();
    await prisma.user.create({data:{id,email:`${id}@example.test`,name:"Synthetic account",displayName:label,emailVerified:true}});
    await prisma.session.create({data:{id:randomUUID(),userId:id,token,expiresAt:new Date(Date.now()+3600000)}});
    const value=encodeURIComponent(`${token}.${createHmac("sha256",process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
    users.push({id,label,cookie:{name:"better-auth.session_token",value,url:base}});
  }
  process.env.DISCOVERY_PILOT_USER_IDS=users.map(u=>u.id).join(",");
  const [a,b,c,d,e,f]=users;
  api=await(await import("../api/src/app.ts")).buildServer({dateSpotProvider:{
    search:async()=>{
      if (venueProviderOffline) throw Error("Synthetic venue provider unavailable");
      return [sampleVenue];
    },
    details:async id=>{
      if (venueProviderOffline) throw Error("Synthetic venue provider unavailable");
      return id===sampleVenue.id ? {name:sampleVenue.name,address:sampleVenue.address,mapsUrl:"https://www.openstreetmap.org/",website:null,hours:[],photos:[{
        url:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        source:"https://example.test/venue",author:"Local test fixture",license:"Fixture",licenseUrl:null,
      }]} : null;
    },
  }}); await api.listen({port:apiPort,host:"127.0.0.1"});
  const env={...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",API_PROXY_URL:`http://127.0.0.1:${apiPort}`,NEXT_PUBLIC_API_URL:""};
  build=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"build","--webpack"],{cwd:web,env,stdio:["ignore",log,log]});
  await new Promise((resolve,reject)=>{build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(Error(`Build failed (${code}); see preview.log`)));});
  preview=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(webPort)],{cwd:web,env,stdio:["ignore",log,log]});
  let previewReady=false;
  for(let i=0;i<150;i++){if(preview.exitCode!==null)throw Error("Preview exited");try{if((await fetch(`${base}/login`)).ok){previewReady=true;break;}}catch{}await pause(200);}
  assert(previewReady,"Preview starts");
  browser=await chromium.launch({channel:process.env.LOCKEDIN_BROWSER_CHANNEL || "chrome",headless:true});
  const errors=[], contexts=new Map();
  async function pageFor(u) { const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:"reduce"});await context.addCookies([u.cookie]);const page=await context.newPage();page.setDefaultTimeout(20000);page.on("pageerror",error=>errors.push(error.message));contexts.set(u.id,context);return page; }
  const pa=await pageFor(a),pb=await pageFor(b),pc=await pageFor(c),pd=await pageFor(d);
  async function request(u,method,route,data) {const response=await contexts.get(u.id).request.fetch(base+route,{method,headers:{origin:base,"x-messaging-owner":u.id,"x-discovery-owner":u.id},...(data===undefined?{}:{data})});return {status:response.status(),body:await response.json()};}
  async function verifyDatePlanning({ first, second, proposer, recipient, id, discovery = false }) {
    const chat = base + (discovery ? "/connections/" : "/messages/") + id;
    const endpoint = "/api/messaging/conversations/" + id + "/date-plans";
    const name = discovery ? "discovery" : "direct";
    const reviewErrors = [];
    const composer = page => page.getByRole("textbox",{name:"Message",exact:true});
    const dialog = page => page.getByRole("dialog").filter({has:page.getByRole("button",{name:"Close",exact:true})});
    const button = (scope, label) => scope.getByRole("button",{name:label,exact:true});
    const header = page => page.locator("[data-date-toggle]");
    const invites = page => page.locator("[data-plan-id]");
    const card = (page,label) => dialog(page).getByRole("region",{name:label,exact:true});
    async function submitTime(page, day, hour, label) {
      const form = dialog(page);
      await form.getByLabel("Day",{exact:true}).fill(new Date(Date.now() + day * 86_400_000).toISOString().slice(0,10));
      await form.getByLabel("Time",{exact:true}).fill(hour + ":30");
      await button(form,label).click();
    }
    await first.goto(chat); await composer(first).waitFor();
    await second.goto(chat); await composer(second).waitFor();
    await second.goto(base + (discovery ? "/connections" : "/journey"));
    await composer(first).fill("Keep this unfinished message");
    for (const width of [320, 393, 1280]) {
      await first.setViewportSize({width,height:852});
      await header(first).click();
      await dialog(first).waitFor();
      assert(await dialog(first).evaluate(el => el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1));
      const expected = width < 600 ? "bottom" : "center";
      assert(await dialog(first).evaluate((el, placement) => {
        const r=el.getBoundingClientRect();
        return Math.abs(r.left+r.width/2-innerWidth/2)<6 &&
          (placement==="bottom" ? Math.abs(r.bottom-innerHeight)<6 : Math.abs(r.top+r.height/2-innerHeight/2)<6);
      },expected),"Date sheet is " + expected + " at width " + width);
      await first.keyboard.press("Escape");
      await dialog(first).waitFor({state:"hidden"});
      await first.waitForFunction(()=>document.activeElement?.hasAttribute("data-date-toggle"));
      assert.equal(await composer(first).inputValue(),"Keep this unfinished message");
    }
    const count = await prisma.discoveryMessage.count({where:{conversationId:id}});
    await header(first).click();
    await button(dialog(first),"Browse on my own").click();
    await dialog(first).getByRole("combobox",{name:"Starting area",exact:true}).selectOption(sampleArea.areaId);
    await button(dialog(first),"Show places").click();
    await dialog(first).getByRole("button",{name:new RegExp(sampleVenue.name)}).click();
    const venue = dialog(first).getByRole("region",{name:"Venue details",exact:true});
    await venue.getByRole("heading",{name:sampleVenue.name,exact:true}).waitFor();
    await venue.getByRole("img",{name:"Photo of " + sampleVenue.name,exact:true}).waitFor();
    await button(venue,"Choose this place").click();
    assert.equal(await prisma.discoveryMessage.count({where:{conversationId:id}}),count,"Picking a venue does not send it");
    await submitTime(first,3,"18","Send invite");
    await card(first,"Suggested date time").getByText("Waiting for their reply",{exact:true}).waitFor();
    const plan = (await request(proposer,"GET",endpoint)).body.value.activePlan;
    assert.equal(await prisma.discoveryMessage.count({where:{conversationId:id}}),count+1,"The invite writes just one row");
    const spotsPath = "/api/messaging/conversations/" + id + "/date-spots";
    const search = await request(recipient,"POST",spotsPath,{action:"start",preferences:{areaId:sampleArea.areaId,interests:["art"]}});
    assert.equal(search.status,200);
    const respond = dialog(first).getByText("Shared search request",{exact:true});
    try {
      await respond.waitFor({timeout:2500}); await respond.click();
      await button(dialog(first),"Not now").click({timeout:2500});
      assert.equal(await dialog(first).getByRole("button",{name:"Choose this place",exact:true}).count(),0);
    } catch {
      reviewErrors.push("An active date must let a newer client respond to an older client's shared search");
      await request(recipient,"POST",spotsPath,{action:"cancel",id:search.body.value.request.id});
    }
    await button(dialog(first),"Close").click();
    await invites(first).waitFor();
    const viewport = first.getByRole("region",{name:"Scrollable conversation",exact:true});
    await prisma.discoveryMessage.createMany({data:Array.from({length:38},(_,i)=>({
      conversationId:id,connectionId:discovery?id:null,senderId:proposer.id,requestId:randomUUID(),text:"Sheet history " + i,
    }))});
    await first.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await viewport.getByText("Sheet history 37",{exact:true}).waitFor({state:"attached"});
    const anchor = viewport.getByText("Sheet history 4",{exact:true});
    if (!await anchor.count()) await button(viewport,"Load older messages").click();
    await anchor.waitFor({state:"attached"});
    await anchor.evaluate(el=>el.scrollIntoView({block:"center"}));
    const top = el=>el.getBoundingClientRect().top-el.closest("[role=region]").getBoundingClientRect().top;
    const offset = await anchor.evaluate(top);
    const bell = second.getByRole("button",{name:/Notifications, (?!0 unread)\d+ unread/});
    await bell.click();
    const dateUpdates = second.getByRole("list",{name:"Date updates",exact:true});
    const readPath = endpoint + "/" + plan.id + "/read";
    await second.route("**"+readPath,route=>route.fulfill({status:503,json:{error:"Synthetic receipt failure"}}),{times:1});
    const unreadFailed=second.waitForResponse(response=>new URL(response.url()).pathname===readPath&&response.status()===503);
    await button(dateUpdates,"Open date").click();
    await unreadFailed;
    try {
      const recovered=second.waitForResponse(response=>new URL(response.url()).pathname===readPath&&response.status()===200,{timeout:2500});
      await second.evaluate(()=>window.dispatchEvent(new Event("online")));
      await recovered;
    } catch { reviewErrors.push("A visible date receipt did not retry after reconnecting"); }
    await button(card(second,"Suggested date time"),"Suggest another time").click();
    assert.equal(new URL(second.url()).searchParams.get("date"),plan.id);
    await submitTime(second,4,"19","Send new time");
    await card(second,"Suggested another time").getByText("Waiting for their reply",{exact:true}).waitFor();
    assert.equal(await invites(first).count(),1);
    assert.equal(await first.getByText("Suggested another time",{exact:true}).count(),0);
    await header(first).filter({hasText:"New time proposed"}).click();
    await button(card(first,"Suggested another time"),"Confirm").click();
    await card(first,"Date confirmed").waitFor();
    assert(Math.abs(await anchor.evaluate(top)-offset)<5,"Date updates preserve the scroll anchor in older chat history");
    const calendarButton = button(card(second,"Date confirmed"),"Add to calendar");
    await calendarButton.waitFor();
    const downloaded = second.waitForEvent("download");
    await calendarButton.click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(),"lockedin-date.ics");
    const ics = readFileSync(await download.path(),"utf8");
    assert.match(ics,/\r\nLOCATION:Date Test Gallery\r\n/);
    assert(!/ATTENDEE|Synthetic meetup area/.test(ics));
    await button(dialog(second),"Close").click();
    await button(card(first,"Date confirmed"),"Cancel date").click();
    await card(first,"Date canceled").waitFor();
    let releaseSummary;
    const summaryDelay=new Promise(resolve=>{releaseSummary=resolve;});
    const holdSummary=async route=>{ await summaryDelay; await route.continue(); };
    await second.route("**"+endpoint+"?presentation=sheet",holdSummary);
    try {
      await second.reload(); await composer(second).waitFor();
      await header(second).click();
      if (await dialog(second).getByText("Loading your date plan…",{exact:true}).count()!==1) reviewErrors.push("Header treats a loading summary as an empty plan");
      releaseSummary();
      try {
        await card(second,"Date canceled").waitFor({timeout:2500});
        assert.equal(await button(card(second,"Date canceled"),"Cancel date").count(),0);
      } catch { reviewErrors.push("Header opened before summary did not resolve to the unread cancellation"); }
    } finally { releaseSummary(); await second.unroute("**"+endpoint+"?presentation=sheet",holdSummary); }
    await button(dialog(second),"Close").click();
    await button(dialog(first),"Close").click();
    await invites(first).click();
    await card(first,"Date canceled").waitFor();
    await first.keyboard.press("Escape");
    await dialog(first).waitFor({state:"hidden"});
    assert.equal(await composer(first).inputValue(),"Keep this unfinished message");
    assert.equal(await invites(first).count(),1);
    await first.waitForFunction(()=>document.activeElement?.hasAttribute("data-plan-id"));

    // Explicitly sharing a place remains possible; it is not an invite.
    const dateSpots = "/api/messaging/conversations/" + id + "/date-spots";
    const suggestions = await request(proposer,"POST",dateSpots,{action:"solo",preferences:{areaId:sampleArea.areaId,interests:["art"]}});
    assert.equal(suggestions.status,200);
    const shared = await request(proposer,"POST",dateSpots,{action:"share",ticket:suggestions.body.value.items[0].ticket,requestId:randomUUID()});
    assert.equal(shared.status,200);
    await first.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await first.getByText("Suggested date spot: " + sampleVenue.name,{exact:true}).waitFor();
    venueProviderOffline = true;
    try {
      await header(first).filter({hasText:"Plan a date"}).click();
      await button(dialog(first),"Use a shared place").click();
      await button(dialog(first),sampleVenue.name).click();
      await dialog(first).getByText("Photos and place details aren’t available right now.",{exact:true}).waitFor();
      await button(dialog(first),"Choose this place").click();
      let sent, release;
      const requestArrived = new Promise(resolve=>{sent=resolve;});
      const delayedReply = new Promise(resolve=>{release=resolve;});
      const holdCreation = async route => {
        if (route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="propose") return route.continue();
        const response = await route.fetch();
        sent();
        await delayedReply;
        await route.fulfill({response});
      };
      await first.route("**"+endpoint,holdCreation);
      try {
        await submitTime(first,5,"17","Send invite");
        await requestArrived;
        await first.keyboard.press("Escape");
        await dialog(first).waitFor({state:"hidden"});
      } finally { release(); }
      await header(first).filter({hasText:"View date"}).waitFor();
      assert.equal(await dialog(first).isVisible(),false,"A late send response does not reopen a closed sheet");
      await first.unroute("**"+endpoint,holdCreation);
      await header(first).click();
      let failed, resume;
      const failureArrived = new Promise(resolve=>{failed=resolve;});
      const redirectFailure = new Promise(resolve=>{resume=resolve;});
      const holdFailure = async route => {
        if (route.request().method()!=="POST" || route.request().postDataJSON()?.action!=="withdraw") return route.continue();
        failed();
        await redirectFailure;
        await route.fulfill({status:503,json:{error:"Synthetic action failure"}});
      };
      await first.route("**"+endpoint,holdFailure);
      try {
        await button(card(first,"Suggested date time"),"Withdraw").click();
        await failureArrived;
        await first.keyboard.press("Escape");
        await dialog(first).waitFor({state:"hidden"});
        await invites(first).first().click();
        await card(first,"Date canceled").waitFor();
        const refresh=first.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==="GET");
        resume();
        await refresh;
        await first.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        if (await dialog(first).getByText("Synthetic action failure",{exact:true}).count()) reviewErrors.push("A delayed action failure appeared on a different plan");
      } finally { resume(); await first.unroute("**"+endpoint,holdFailure); }
      await button(dialog(first),"View current date").click();
      await button(card(first,"Suggested date time"),"Withdraw").click();
      await card(first,"Date suggestion withdrawn").waitFor();
      await button(dialog(first),"Close").click();
    } finally { venueProviderOffline = false; }
    process.env.DATE_PLANS_ENABLED = "false";
    try {
      await first.reload(); await composer(first).waitFor();
      assert.equal(await invites(first).count(),0);
      assert.equal((await request(proposer,"GET",endpoint)).status,404);
      assert.equal((await request(proposer,"GET","/api/messaging/unread?presentation=sheet")).body.value.dates.count,0);
      await first.getByText("Suggested date spot: " + sampleVenue.name,{exact:true}).waitFor();
    } finally { process.env.DATE_PLANS_ENABLED = "true"; }
    assert.equal(await button(first,"Refresh when ready").count(),0);
    assert.deepEqual(reviewErrors,[]);
    console.log("PASS " + name + " date sheet: place photos, one invite, notifications, counter, confirmation, calendar, cancellation, provider outage, flag off, focus and draft");
  }
  if (process.env.LOCKEDIN_BROWSER_SCENARIO === "navigation") {
    const nav = page => page.getByRole("navigation",{name:"Main navigation",exact:true});
    const tab = (page,label) => nav(page).getByRole("link",{name:new RegExp("^"+label+"(?:,|$)")});
    const composer = page => page.getByRole("textbox",{name:"Message",exact:true});
    await pa.goto(base+"/journey");
    await pa.getByRole("heading",{name:"Your shared space starts here.",exact:true}).waitFor();
    for (const width of [320,393,701,1280]) {
      await pa.setViewportSize({width,height:852});
      for (const label of ["Discover","Inbox","Together","Profile"]) assert.equal(await tab(pa,label).count(),1);
      assert(await nav(pa).evaluate((el,mobile)=>{
        const rect=el.getBoundingClientRect();
        return document.documentElement.scrollWidth <= innerWidth+1 && (mobile ? Math.abs(rect.bottom-innerHeight)<2 : rect.top>=0 && rect.bottom<85);
      },width<=700),"Tabs fit the intended position at width "+width);
    }
    await pa.setViewportSize({width:393,height:852});
    await tab(pa,"Inbox").click();
    await pa.getByRole("button",{name:"Invite someone",exact:true}).click();
    await pa.getByLabel("Their email",{exact:true}).fill(b.id+"@example.test");
    await tab(pa,"Discover").click();
    await pa.getByRole("button",{name:"Keep editing",exact:true}).click();
    assert.equal(await pa.getByLabel("Their email",{exact:true}).inputValue(),b.id+"@example.test");
    await pa.getByRole("button",{name:"Send private invite",exact:true}).click();
    await pa.getByRole("heading",{name:"Invitation ready",exact:true}).waitFor();
    const privateLink = await pa.getByLabel("Private invitation link",{exact:true}).inputValue();
    assert.equal(new URL(privateLink).pathname,"/journey");
    await pb.goto(base+"/connections");
    await pb.getByRole("button",{name:/Alex.*Invitation to review/}).click();
    await pb.getByRole("button",{name:"Accept invitation",exact:true}).click();
    await pb.getByText("You’re connected. Find your chat in Inbox, and your new shared space here in Together.",{exact:true}).waitFor();
    await tab(pb,"Inbox").click();
    await pb.getByRole("button",{name:/Alex.*shared-space conversation/}).click();
    await composer(pb).fill("Hello from the direct invite");
    await pb.getByRole("button",{name:"Send message",exact:true}).click();
    await nav(pa).getByRole("link",{name:"Inbox, 1 unread conversation",exact:true}).waitFor();
    await tab(pa,"Inbox").click();
    await pa.getByRole("button",{name:/Sam.*New message/}).click();
    await pa.getByText("Hello from the direct invite",{exact:true}).waitFor();
    assert.equal(await tab(pa,"Inbox").getAttribute("aria-current"),"page");
    await pa.getByRole("link",{name:"Inbox",exact:true}).waitFor();
    await tab(pa,"Profile").click();
    await pa.getByRole("button",{name:"Private reflection",exact:true}).click();
    await pa.getByRole("textbox",{name:"Your private reflection",exact:true}).waitFor();
    await pa.getByRole("button",{name:"← Profile",exact:true}).click();
    await pa.getByRole("heading",{name:"Privacy & safety",exact:true}).waitFor();
    assert.equal(await prisma.discoveryProfile.count({where:{ownerId:{in:[a.id,b.id]}}}),0);

    for(const user of [c,d]) {
      const profile={publicName:`Discovery ${user.label}`,avatarPreset:"leaf",bio:"Synthetic public introduction",intention:"LONG_TERM",interests:["Reading"],pace:null,areaId:"pilot-city"};
      const published=await prisma.discoveryProfile.create({data:{ownerId:user.id,draft:{revision:1,profile},publishedSnapshot:profile,publishedAreaId:"pilot-city",publishedIntention:"LONG_TERM",publicationVersion:1,publicationConsentVersion:1,publicationConsentedAt:new Date(),adultAttestedAt:new Date(),publishedAt:new Date()}});
      user.profileId=published.id;
      assert.equal((await request(user,"PUT","/api/discovery/match-preferences",{birthDate:"1995-04-02",gender:"ANOTHER_GENDER",meetGenders:"all",minAge:18,maxAge:null,revision:null})).status,200);
    }
    const discovery = await request(c,"POST","/api/discovery/connections",{targetProfileId:d.profileId,topicKey:"support",hello:"Discovery opening",requestId:randomUUID()});
    assert.equal(discovery.status,200);
    const source=discovery.body.value.id;
    assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/accept`,{})).status,200);
    const ready={ready:true,consentVersion:1,exclusiveConsent:true};
    for(const user of [c,d]) assert.equal((await request(user,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);
    await pc.goto(base+"/connections");
    await pc.getByRole("button",{name:/Discovery Drew.*Locked in/}).waitFor();
    assert.equal(await pc.getByRole("region",{name:"Conversations",exact:true}).getByRole("listitem").count(),1);
    await tab(pc,"Discover").click();
    await pc.getByRole("heading",{name:"Discovery is paused while you’re locked in.",exact:true}).waitFor();
    await tab(pc,"Inbox").click();
    await pc.getByRole("button",{name:/Discovery Drew.*Locked in/}).click();
    await composer(pc).fill("Keep this draft while viewing a profile");
    await pc.getByRole("button",{name:"View Discovery Drew’s profile",exact:true}).click();
    await pc.getByRole("dialog").getByRole("heading",{name:"Discovery Drew",exact:true}).waitFor();
    await pc.getByRole("button",{name:"← Back to chat",exact:true}).click();
    assert.equal(await composer(pc).inputValue(),"Keep this draft while viewing a profile");
    assert.equal(await pc.getByRole("button",{name:"Plan a date",exact:true}).count(),1);
    assert.deepEqual(errors,[]);
    console.log("PASS navigation: mobile/desktop tabs, direct invite with draft guard, unread Inbox, Profile and private reflection, locked-in Discovery pause, chat and profile return");
  } else {
  const invite=await prisma.relationshipInvite.create({data:{inviterId:a.id,inviteeId:b.id,expiresAt:new Date(Date.now()+60000)}});
  await pb.goto(`${base}/journey?invite=${invite.token}`,{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"Accept invitation",exact:true}).click();
  const messages=pb.getByRole("link",{name:"Messages →",exact:true}); await messages.waitFor(); await messages.click();
  await pb.getByRole("textbox",{name:"Message",exact:true}).waitFor();
  const id=new URL(pb.url()).pathname.split("/").at(-1), route=`/api/messaging/conversations/${id}`;
  assert.equal(await prisma.discoveryProfile.count({where:{ownerId:{in:[a.id,b.id]}}}),0);
  assert.equal(await prisma.discoveryMessage.count({where:{conversationId:id}}),0);
  assert.equal(await pb.getByRole("button",{name:/View .*profile/}).count(),0);
  await pb.goto(`${base}/journey`);
  await pb.getByRole("link",{name:"Messages →",exact:true}).waitFor();
  await pa.goto(`${base}/messages/${id}`); await pa.getByRole("textbox",{name:"Message",exact:true}).fill("Hello from Alex"); await pa.getByRole("button",{name:"Send message",exact:true}).click();
  await pb.getByRole("button",{name:/Notifications, (?!0 unread)\d+ unread/}).click();
  const unreadChat=pb.getByRole("list",{name:"Unread conversations",exact:true});
  await unreadChat.getByRole("button",{name:"Open chat",exact:true}).click();
  await pb.getByText("Hello from Alex",{exact:true}).waitFor();
  await pb.waitForFunction(async()=>((await (await fetch("/api/messaging/unread")).json()).value?.count ?? -1)===0);
  assert.equal(await pb.getByRole("button",{name:"Refresh when ready",exact:true}).count(),0);
  await pb.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  assert.equal((await request(a,"POST",`${route}/messages`,{text:"Arrived in a hidden tab",requestId:randomUUID()})).status,200);
  await pb.getByRole("button",{name:"Notifications, 1 unread",exact:true}).waitFor();
  assert.equal(await pb.getByText("Arrived in a hidden tab",{exact:true}).count(),0);
  assert.equal((await request(b,"GET","/api/messaging/unread")).body.value.count,1);
  await pb.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  await pb.getByText("Arrived in a hidden tab",{exact:true}).waitFor();
  await pb.waitForFunction(async()=>((await (await fetch("/api/messaging/unread")).json()).value?.count ?? -1)===0);
  await pb.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  assert.equal((await request(a,"POST",`${route}/messages`,{text:"Above a long reply",requestId:randomUUID()})).status,200);
  const longReply=Array.from({length:35},(_,i)=>`Reply line ${i}`).join("\n");
  assert.equal((await request(b,"POST",`${route}/messages`,{text:longReply,requestId:randomUUID()})).status,200);
  await pb.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  const covered=pb.getByText("Above a long reply",{exact:true});
  await covered.waitFor({state:"attached"});
  assert.equal((await request(b,"GET","/api/messaging/unread")).body.value.count,1);
  await covered.evaluate(el=>el.scrollIntoView({block:"center"}));
  await pb.waitForFunction(async()=>((await (await fetch("/api/messaging/unread")).json()).value?.count ?? -1)===0);
  await pb.getByRole("textbox",{name:"Message",exact:true}).fill("Hello from Sam"); await pb.getByRole("button",{name:"Send message",exact:true}).click(); await pa.getByText("Hello from Sam",{exact:true}).waitFor();
  await pa.getByRole("textbox",{name:"Message",exact:true}).fill("Unsent local text");
  await pa.route(`**${route}`,r=>r.fulfill({status:500,json:{error:"Synthetic transient failure"}}));
  await pa.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await pa.getByText("Could not refresh chat availability. Your unfinished message has not changed.",{exact:true}).waitFor();
  assert.equal(await pa.getByRole("textbox",{name:"Message",exact:true}).inputValue(),"Unsent local text");
  await pa.unroute(`**${route}`); await pa.getByRole("button",{name:"Try again",exact:true}).click();
  assert.equal(await pa.getByRole("textbox",{name:"Message",exact:true}).inputValue(),"Unsent local text");
  await prisma.discoveryMessage.createMany({data:Array.from({length:35},(_,i)=>({conversationId:id,senderId:b.id,requestId:randomUUID(),text:`History ${i}`}))});
  await pa.reload(); await pa.getByText("History 34",{exact:true}).waitFor();
  assert.equal(await pa.getByRole("textbox",{name:"Message",exact:true}).inputValue(),"");
  const viewport=pa.getByRole("region",{name:"Scrollable conversation",exact:true});
  for(const width of [320,393,1280]) {
    await pa.setViewportSize({width,height:852});
    assert(await viewport.evaluate(el=>el.clientHeight<600&&el.scrollHeight>el.clientHeight));
    assert(await pa.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`No horizontal overflow at ${width}`);
    await pa.screenshot({path:path.join(artifacts,`direct-${width}.png`),fullPage:true});
  }
  await viewport.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
  const anchor=await viewport.locator("[data-message-id]").first().evaluate(el=>({id:el.dataset.messageId,top:el.getBoundingClientRect().top}));
  await pa.getByRole("button",{name:"Load older messages",exact:true}).click();
  await pa.getByText("Hello from Alex",{exact:true}).waitFor({state:"attached"});
  const shifted=await viewport.locator(`[data-message-id="${anchor.id}"]`).evaluate(el=>el.getBoundingClientRect().top);
  assert(Math.abs(shifted-anchor.top)<5,"Older pagination retains visible anchor");
  assert.equal((await request(b,"POST",`${route}/messages`,{text:"New while reading history",requestId:randomUUID()})).status,200);
  await pa.getByRole("button",{name:"New messages · Jump to latest ↓",exact:true}).waitFor();
  assert.equal((await request(a,"GET","/api/messaging/unread")).body.value.count,1);
  await pa.getByRole("button",{name:"New messages · Jump to latest ↓",exact:true}).click();
  await pa.waitForFunction(async()=>((await (await fetch("/api/messaging/unread")).json()).value?.count ?? -1)===0);
  await viewport.evaluate(el=>{el.scrollTop=el.clientHeight;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
  const reading = await viewport.evaluate(el=>{
    const top = el.getBoundingClientRect().top;
    const message = [...el.querySelectorAll("[data-message-id]")].find(item=>item.getBoundingClientRect().bottom>top);
    return {id:message.dataset.messageId,offset:message.getBoundingClientRect().top-top};
  });
  await prisma.discoveryMessage.createMany({data:Array.from({length:65},(_,i)=>({conversationId:id,senderId:b.id,requestId:randomUUID(),text:`Catch-up ${i}`}))});
  await pa.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await pa.getByText("Catch-up 64",{exact:true}).waitFor({state:"attached"});
  assert.equal(await viewport.getByText(/^Catch-up \d+$/).count(),65,"Refresh keeps every message in the gap");
  const readingOffset=await viewport.locator(`[data-message-id="${reading.id}"]`).evaluate(el=>el.getBoundingClientRect().top-el.closest("[role=region]").getBoundingClientRect().top);
  assert(Math.abs(readingOffset-reading.offset)<5,"Multi-page refresh retains visible message and position");
  await pa.getByRole("button",{name:"New messages · Jump to latest ↓",exact:true}).click();
  assert(await viewport.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<5),"Jump reaches the latest message");
  assert.equal(await pa.getByRole("button",{name:"Report message",exact:true}).count(),0);
  const menu=viewport.getByLabel("Message actions",{exact:true}).last(); await menu.focus(); await menu.press("Enter");
  await pa.getByRole("button",{name:"Report message",exact:true}).click();
  const reporting=pa.getByRole("region",{name:"Report selected message",exact:true});
  await reporting.getByRole("combobox").selectOption("SPAM"); await reporting.getByRole("button",{name:"Send report",exact:true}).click();
  await reporting.getByText("Report received for moderator review.",{exact:true}).waitFor();
  await pa.getByRole("button",{name:"Close message report",exact:true}).click();
  await viewport.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
  await prisma.discoveryMessage.createMany({data:Array.from({length:181},(_,i)=>({conversationId:id,senderId:b.id,requestId:randomUUID(),text:`Long catch-up ${i}`}))});
  await pa.evaluate(()=>window.dispatchEvent(new Event("focus")));
  const jump = pa.getByRole("button",{name:"New messages · Jump to latest ↓",exact:true});
  await jump.waitFor();
  assert.equal(await viewport.getByText("Hello from Alex",{exact:true}).count(),1,"Very large gaps leave loaded history intact");
  assert.equal(await viewport.getByText(/^Long catch-up \d+$/).count(),0,"Don't render disjoint pages as continuous history");
  await jump.click();
  await viewport.getByText("Long catch-up 180",{exact:true}).waitFor();
  console.log("PASS multi-page catch-up preserves the reading anchor; very large gaps require an explicit jump");
  await verifyDatePlanning({first:pa,second:pb,proposer:a,recipient:b,id});
  // A stale owner header cannot turn an account switch into a wrong-account send.
  await pa.getByRole("textbox",{name:"Message",exact:true}).fill("DO NOT LEAK");
  await contexts.get(a.id).clearCookies(); await contexts.get(a.id).addCookies([c.cookie]);
  await pa.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await pa.getByText("This chat is unavailable. Return to your Inbox or try again.",{exact:true}).waitFor();
  assert(!await pa.locator("main").innerText().then(t=>t.includes("DO NOT LEAK")||t.includes("History 34")));
  await contexts.get(a.id).clearCookies(); await contexts.get(a.id).addCookies([a.cookie]); await pa.reload(); await pa.getByRole("textbox",{name:"Message",exact:true}).waitFor();
  await prisma.user.update({where:{id:a.id},data:{emailVerified:false}});await pa.reload();await pa.getByRole("heading",{name:"Verify your email",exact:true}).waitFor();
  await prisma.user.update({where:{id:a.id},data:{emailVerified:true}});await pa.reload();await pa.getByRole("textbox",{name:"Message",exact:true}).waitFor();
  await pa.getByText("Safety & contact controls",{exact:true}).click();await pa.getByRole("button",{name:"Block contact",exact:true}).click();
  await pa.getByRole("alertdialog",{name:"Block this contact?",exact:true}).getByRole("button",{name:"Block contact",exact:true}).click();
  await pa.getByText("This chat is unavailable.",{exact:true}).waitFor();assert.equal((await request(b,"GET",`${route}/messages`)).status,404);
  assert.equal((await prisma.relationship.findUniqueOrThrow({where:{id}})).status,"ACTIVE");
  console.log("PASS direct invitation acceptance, bidirectional chat, mobile/desktop bounds, history anchor, jump indicator, keyboard report menu, local draft, account switch, verification and durable block");
  // Existing active directly invited spaces receive their empty conversation via backfill.
  const oldRel=await prisma.relationship.create({data:{members:{create:[e,f].map(u=>({userId:u.id}))}}});
  const {backfillMessaging}=await import("../api/src/features/messaging/messaging-backfill.service.ts");let cursor;
  do{const batch=await prisma.$transaction(tx=>backfillMessaging(tx,{afterId:cursor,limit:100}));cursor=batch.nextCursor??undefined;}while(cursor);
  const pe=await pageFor(e);await pe.goto(`${base}/journey`);await pe.getByRole("link",{name:"Messages →",exact:true}).click();await pe.getByRole("textbox",{name:"Message",exact:true}).waitFor();assert(pe.url().endsWith(oldRel.id));
  // Discovery keeps its original transcript and source policy after promotion.
  for(const u of [c,d]) {const draft={publicName:`Discovery ${u.label}`,avatarPreset:"leaf",bio:"Synthetic public introduction",intention:"LONG_TERM",interests:["Reading"],pace:null,areaId:"pilot-city"};const p=await prisma.discoveryProfile.create({data:{ownerId:u.id,draft:{revision:1,profile:draft},publishedSnapshot:draft,publishedAreaId:"pilot-city",publishedIntention:"LONG_TERM",publicationVersion:1,publicationConsentVersion:1,publicationConsentedAt:new Date(),adultAttestedAt:new Date(),publishedAt:new Date()}});u.profileId=p.id;}
  for(const user of [c,d])assert.equal((await request(user,"PUT","/api/discovery/match-preferences",{birthDate:"1995-04-02",gender:"ANOTHER_GENDER",meetGenders:"all",minAge:18,maxAge:null,revision:null})).status,200);
  const sent=await request(c,"POST","/api/discovery/connections",{targetProfileId:d.profileId,topicKey:"support",hello:"Discovery opening",requestId:randomUUID()});assert.equal(sent.status,200);const source=sent.body.value.id;
  await pc.goto(`${base}/connections/${source}`);await pc.getByText("Waiting for acceptance",{exact:true}).waitFor();
  assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/accept`,{})).status,200);
  await pc.getByRole("textbox",{name:"Message",exact:true}).fill("Discovery history survives");await pc.getByRole("button",{name:"Send message",exact:true}).click();await pc.getByText("Discovery history survives",{exact:true}).waitFor();
  assert.equal(await pc.getByText("Refresh when ready",{exact:true}).count(),0);
  await prisma.discoveryMessage.createMany({data:Array.from({length:12},(_,i)=>({conversationId:source,connectionId:source,senderId:c.id,requestId:randomUUID(),text:"Discovery history "+i}))});
  await verifyDatePlanning({first:pc,second:pd,proposer:c,recipient:d,id:source,discovery:true});
  const ready={ready:true,consentVersion:1,exclusiveConsent:true};assert.equal((await request(c,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);
  await pc.goto(`${base}/messages/${source}`);
  const promoted = pc.getByRole("region",{name:"Scrollable conversation",exact:true});
  await promoted.getByText("Sheet history 37",{exact:true}).waitFor({state:"attached"});
  const preserved = promoted.getByText("Discovery history survives",{exact:true});
  if (!await preserved.count()) await promoted.getByRole("button",{name:"Load older messages",exact:true}).click();
  await preserved.waitFor();
  await pc.getByRole("button",{name:"View Discovery Drew’s profile",exact:true}).click();await pc.getByRole("dialog").getByRole("heading",{name:"Discovery Drew",exact:true}).waitFor();await pc.getByRole("button",{name:"← Back to chat",exact:true}).click();
  await pc.screenshot({path:path.join(artifacts,"promoted-chat.png"),fullPage:true});
  assert.deepEqual(errors,[],"No browser runtime errors");console.log("PASS existing-space backfill, Discovery transcript/promotion and authorized public-profile dialog");
  }
} finally {
  await browser?.close();preview?.kill("SIGTERM");build?.kill("SIGTERM");await api?.close();await prisma?.$disconnect();closeSync(log);
}
