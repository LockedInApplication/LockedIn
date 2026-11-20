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
Object.assign(process.env,{DATE_PLANS_ENABLED:"true",DATE_SPOTS_ENABLED:"true",DATE_SPOTS_GEOAPIFY_API_KEY:"local-fixture-only",DATE_SPOT_AREAS_JSON:JSON.stringify([sampleArea])});
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
  api=await(await import("../api/src/app.ts")).buildServer({dateSpotProvider:{
    search:async()=>[sampleVenue],
    details:async id=>id===sampleVenue.id ? {name:sampleVenue.name,address:sampleVenue.address,mapsUrl:"https://www.openstreetmap.org/",website:null,hours:[],photos:[]} : null,
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
    const composer = page => page.getByRole("textbox",{name:"Message",exact:true});
    const textOfSpot = "Suggested date spot: " + sampleVenue.name;
    const spot = page => page.locator("[data-message-id]").filter({hasText:textOfSpot});
    const card = (page,label) => page.getByRole("region",{name:label,exact:true});
    const planTools = first.getByRole("button",{name:"Plan a date",exact:true});
    const button = (scope, name) => scope.getByRole("button",{name,exact:true});
    const proposedTime = (day,hour) => {
      const date = new Date(Date.now() + day * 86_400_000).toISOString().slice(0,10);
      return {date, time:hour + ":30"};
    };
    async function fillTime(page,title,day,hour) {
      const form = page.getByRole("dialog",{name:title,exact:true});
      const {date,time} = proposedTime(day,hour);
      await form.getByLabel("Day",{exact:true}).fill(date);
      await form.getByLabel("Time",{exact:true}).fill(time);
      await button(form,"Send suggestion").click();
      await form.waitFor({state:"hidden"});
    }
    await first.goto(chat); await composer(first).waitFor();
    await second.goto(chat); await composer(second).waitFor();
    await planTools.waitFor();
    assert.equal(await button(first,"Find together").count(),0);
    await planTools.click();
    await button(first,"Find together").waitFor();
    await button(first,"Browse on my own").click();
    await first.getByRole("combobox",{name:"Starting area",exact:true}).selectOption(sampleArea.areaId);
    await button(first,"Show places").click();
    await first.getByRole("button",{name:new RegExp(sampleVenue.name)}).click();
    await first.getByRole("region",{name:"Venue details",exact:true}).getByRole("heading",{name:sampleVenue.name,exact:true}).waitFor();
    await button(first,"Share in chat").click();
    await spot(first).waitFor();
    await spot(second).waitFor();
    await second.waitForFunction(async()=>((await (await fetch("/api/messaging/unread")).json()).value?.count ?? -1)===0);
    await second.goto(base + (discovery ? "/connections" : "/journey"));
    const view = button(spot(first),"View place");
    await view.click();
    await first.getByRole("region",{name:"Venue details",exact:true}).getByRole("heading",{name:sampleVenue.name,exact:true}).waitFor();
    await button(first,"← Back").click();
    assert(await view.evaluate(el=>el===document.activeElement),"Closing the venue returns focus");
    const suggest = button(spot(first),"Suggest a time");
    for (const width of [320,393,1280]) {
      await first.setViewportSize({width,height:852});
      await suggest.focus();
      await suggest.press("Enter");
      const dialog = first.getByRole("dialog",{name:"Suggest a time",exact:true});
      await dialog.waitFor();
      assert(await dialog.getByLabel("Day",{exact:true}).evaluate(el=>el===document.activeElement),"The first date field receives focus");
      assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1));
      assert(await dialog.evaluate(el=>{
        const rect=el.getBoundingClientRect();
        return Math.abs(rect.left+rect.width/2-innerWidth/2)<6 && Math.abs(rect.top+rect.height/2-innerHeight/2)<6;
      }),"Date picker stays centered at width "+width);
      if (discovery) await first.screenshot({path:path.join(artifacts,"date-picker-"+width+".png")});
      await first.keyboard.press("Escape");
      await dialog.waitFor({state:"hidden"});
      await first.waitForFunction(()=>document.activeElement?.textContent==="Suggest a time");
    }
    await composer(first).fill("Keep this unfinished message");
    await suggest.click();
    await fillTime(first,"Suggest a time",3,"18");
    await card(first,"Suggested date time").getByText("Waiting for their reply",{exact:true}).waitFor();
    const unread = second.getByRole("button",{name:/Notifications, (?!0 unread)\d+ unread/});
    await unread.click();
    const unreadChat = second.getByRole("list",{name:"Unread conversations",exact:true});
    await button(unreadChat,"Open chat").click();
    const reply = card(second,"Suggested date time");
    await reply.waitFor();
    const scroll = first.getByRole("region",{name:"Scrollable conversation",exact:true});
    await scroll.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
    const readAnchor = await scroll.locator("[data-message-id]").first().evaluate(el=>({id:el.dataset.messageId,offset:el.getBoundingClientRect().top-el.closest("[role=region]").getBoundingClientRect().top}));
    await button(reply,"Suggest another time").click();
    await fillTime(second,"Suggest another time",4,"19");
    const counter = card(first,"Suggested another time");
    await counter.waitFor({state:"attached"});
    const offset = await scroll.locator('[data-message-id="'+readAnchor.id+'"]').evaluate(el=>el.getBoundingClientRect().top-el.closest("[role=region]").getBoundingClientRect().top);
    assert(Math.abs(offset-readAnchor.offset)<5,"A quiet counter keeps the scroll anchor");
    assert.equal(await composer(first).inputValue(),"Keep this unfinished message");
    assert.equal(await button(card(first,"Suggested date time"),"Confirm").count(),0);
    let confirmer = first;
    if (discovery) {
      // A second tab submits a later counter just before this tab's confirm reaches the server.
      await first.route("**"+endpoint,async route=>{
        const data=route.request().postDataJSON();
        if (route.request().method()==="POST" && data?.action==="confirm") {
          const utc = proposedTime(5,"20");
          const saved = await request(proposer,"POST",endpoint,{ action:"counter",planId:data.planId,revision:data.revision,requestId:randomUUID(),
            time:{localTime:utc.date+"T"+utc.time,startsAt:utc.date+"T"+utc.time+":00.000Z",timeZone:"UTC"} });
          assert.equal(saved.status,200);
        }
        await route.continue();
      });
      await button(counter,"Confirm").click();
      await first.getByText("This date plan changed. Check the latest plan and try again.",{exact:true}).waitFor();
      await first.unroute("**"+endpoint);
      await card(first,"Suggested another time").last().getByText("Waiting for their reply",{exact:true}).waitFor();
      assert.equal(await button(counter.first(),"Confirm").count(),0);
      assert.equal(await composer(first).inputValue(),"Keep this unfinished message");
      confirmer = second;
    }
    await button(card(confirmer,"Suggested another time").last(),"Confirm").click();
    await card(first,"Date confirmed").waitFor();
    const calendarButton = button(card(second,"Date confirmed"),"Add to calendar");
    await calendarButton.waitFor();
    const downloadable = second.waitForEvent("download");
    await calendarButton.click();
    const download = await downloadable;
    assert.equal(download.suggestedFilename(),"lockedin-date.ics");
    const ics = readFileSync(await download.path(),"utf8");
    assert.match(ics,/\r\nLOCATION:Date Test Gallery\r\n/);
    const meta = (await request(recipient,"GET",endpoint)).body.value.activePlan;
    assert(ics.includes("DTSTART:"+meta.startsAt.replace(/[-:]/g,"").replace(".000Z","Z")));
    assert(!/ATTENDEE|Synthetic meetup area/.test(ics));
    await button(card(first,"Date confirmed"),"Cancel date").click();
    await card(second,"Date canceled").waitFor();
    await button(card(second,"Date confirmed"),"Add to calendar").waitFor({state:"detached"});
    assert.equal(await composer(first).inputValue(),"Keep this unfinished message");
    process.env.DATE_SPOTS_ENABLED = "false";
    try {
      await first.reload(); await composer(first).waitFor();
      const oldSpot = spot(first);
      await button(oldSpot,"Suggest a time").waitFor();
      assert.equal(await button(oldSpot,"View place").count(),0);
      assert.equal(await button(first,"Find together").count(),0);
      await button(oldSpot,"Suggest a time").click();
      await fillTime(first,"Suggest a time",6,"17");
      await button(card(first,"Suggested date time").last(),"Withdraw").click();
      await card(first,"Date suggestion withdrawn").waitFor();
    } finally { process.env.DATE_SPOTS_ENABLED = "true"; }
    assert.equal(await button(first,"Refresh when ready").count(),0);
    console.log("PASS " + name + " date plans: composer, venue details, suggestion, unread, counter, confirmation, export, cancellation and planning with search off");
  }
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
  await pc.goto(`${base}/connections/${source}`);await pc.getByText("Waiting for acceptance",{exact:true}).waitFor();
  assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/accept`,{})).status,200);
  await pc.getByRole("textbox",{name:"Message",exact:true}).fill("Discovery history survives");await pc.getByRole("button",{name:"Send message",exact:true}).click();await pc.getByText("Discovery history survives",{exact:true}).waitFor();
  assert.equal(await pc.getByText("Refresh when ready",{exact:true}).count(),0);
  await prisma.discoveryMessage.createMany({data:Array.from({length:12},(_,i)=>({conversationId:source,connectionId:source,senderId:c.id,requestId:randomUUID(),text:"Discovery history "+i}))});
  await verifyDatePlanning({first:pc,second:pd,proposer:c,recipient:d,id:source,discovery:true});
  const ready={ready:true,consentVersion:1,exclusiveConsent:true};assert.equal((await request(c,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);assert.equal((await request(d,"POST",`/api/discovery/connections/${source}/readiness`,ready)).status,200);
  await pc.goto(`${base}/messages/${source}`);await pc.getByText("Discovery history survives",{exact:true}).waitFor();await pc.getByRole("button",{name:"View Discovery Drew’s profile",exact:true}).click();await pc.getByRole("dialog").getByRole("heading",{name:"Discovery Drew",exact:true}).waitFor();await pc.getByRole("button",{name:"← Back to chat",exact:true}).click();
  await pc.screenshot({path:path.join(artifacts,"promoted-chat.png"),fullPage:true});
  assert.deepEqual(errors,[],"No browser runtime errors");console.log("PASS existing-space backfill, Discovery transcript/promotion and authorized public-profile dialog");
} finally {
  await browser?.close();preview?.kill("SIGTERM");build?.kill("SIGTERM");await api?.close();await prisma?.$disconnect();closeSync(log);
}
