// Disposable local acceptance only. No production URL/database fallback.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const database = new URL(process.env.DATABASE_URL ?? "invalid:");
if (!["localhost","127.0.0.1"].includes(database.hostname) || database.search || database.hash || !/^\/lockedin_discovery_test_[a-f0-9]{24}$/.test(database.pathname)) throw Error("Owned disposable localhost database required");
const { chromium } = await import(process.env.LOCKEDIN_PLAYWRIGHT_MODULE || "playwright");
const freePort = () => new Promise((resolve,reject) => { const s=createServer(); s.once("error",reject); s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(e=>e?reject(e):resolve(port));}); });
const webPort=await freePort(), apiPort=await freePort(), base=`http://127.0.0.1:${webPort}`;
Object.assign(process.env,{APP_URL:base,BETTER_AUTH_URL:`http://127.0.0.1:${apiPort}`,SHARED_MESSAGING_ENABLED:"true",DISCOVERY_CHAT_ENABLED:"true",DISCOVERY_ENABLED:"true",DISCOVERY_ACCESS_MODE:"pilot",DISCOVERY_MODERATOR_USER_IDS:"shared-browser-moderator",DISCOVERY_AREAS_JSON:'[{"id":"pilot-city","label":"Pilot city"}]',RESEND_API_KEY:"",RESEND_FROM_EMAIL:""});
const services=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."), web=path.resolve(services,"../apps/web");
const artifacts=mkdtempSync(path.join(tmpdir(),"lockedin-shared-chat-browser-")), log=openSync(path.join(artifacts,"preview.log"),"a");
console.log(`Shared chat browser artifacts: ${artifacts}`);
let prisma, api, build, preview, browser;
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
  api=await(await import("../api/src/app.ts")).buildServer(); await api.listen({port:apiPort,host:"127.0.0.1"});
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
  const invite=await prisma.relationshipInvite.create({data:{inviterId:a.id,inviteeId:b.id,expiresAt:new Date(Date.now()+60000)}});
  await pb.goto(`${base}/journey?invite=${invite.token}`,{waitUntil:"domcontentloaded"});
  await pb.getByRole("button",{name:"Accept invitation",exact:true}).click();
  const messages=pb.getByRole("link",{name:"Messages →",exact:true}); await messages.waitFor(); await messages.click();
  await pb.getByRole("textbox",{name:"Message",exact:true}).waitFor();
  const id=new URL(pb.url()).pathname.split("/").at(-1), route=`/api/messaging/conversations/${id}`;
  assert.equal(await prisma.discoveryProfile.count({where:{ownerId:{in:[a.id,b.id]}}}),0);
  assert.equal(await prisma.discoveryMessage.count({where:{conversationId:id}}),0);
  assert.equal(await pb.getByRole("button",{name:/View .*profile/}).count(),0);
  await pa.goto(`${base}/messages/${id}`); await pa.getByRole("textbox",{name:"Message",exact:true}).fill("Hello from Alex"); await pa.getByRole("button",{name:"Send message",exact:true}).click();
  await pb.getByText("Hello from Alex",{exact:true}).waitFor();
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
  await pa.getByRole("button",{name:"New messages · Jump to latest ↓",exact:true}).click();
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
  // A stale owner header cannot turn an account switch into a wrong-account send.
  await pa.getByRole("textbox",{name:"Message",exact:true}).fill("DO NOT LEAK");
  await contexts.get(a.id).clearCookies(); await contexts.get(a.id).addCookies([c.cookie]);
  await pa.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await pa.getByText("This chat is unavailable. Return to your shared space or try again.",{exact:true}).waitFor();
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
  const sent=await request(c,"POST","/api/discovery/connections",{targetProfileId:d.profileId,topicKey:"support",hello:"Discovery opening",requestId:randomUUID()});assert.equal(sent.status,200);const source=sent.body.value.id;
  assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/accept`,{})).status,200);
  await pc.goto(`${base}/connections/${source}`);await pc.getByRole("textbox",{name:"Message",exact:true}).fill("Discovery history survives");await pc.getByRole("button",{name:"Send message",exact:true}).click();await pc.getByText("Discovery history survives",{exact:true}).waitFor();
  const ready={ready:true,consentVersion:1,exclusiveConsent:true};assert.equal((await request(c,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);
  await pc.goto(`${base}/messages/${source}`);await pc.getByText("Discovery history survives",{exact:true}).waitFor();await pc.getByRole("button",{name:"View Discovery Drew’s profile",exact:true}).click();await pc.getByRole("dialog").getByRole("heading",{name:"Discovery Drew",exact:true}).waitFor();await pc.getByRole("button",{name:"← Back to chat",exact:true}).click();
  await pc.screenshot({path:path.join(artifacts,"promoted-chat.png"),fullPage:true});
  assert.deepEqual(errors,[],"No browser runtime errors");console.log("PASS existing-space backfill, Discovery transcript/promotion and authorized public-profile dialog");
} finally {
  await browser?.close();preview?.kill("SIGTERM");build?.kill("SIGTERM");await api?.close();await prisma?.$disconnect();closeSync(log);
}
