// Runs only inside verify-discovery.mjs's owned disposable database.
import assert from "node:assert/strict";
import {createHmac,randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {mkdtempSync,openSync,closeSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkDiscoveryLayout} from "../../apps/web/scripts/check-discovery-layout.mjs";

const url=new URL(process.env.DATABASE_URL??"invalid:");
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.search||url.hash||!/^\/lockedin_discovery_test_[a-f0-9]{24}$/.test(url.pathname))throw new Error("Browser acceptance requires the disposable harness database");
let chromium;
try{({chromium}=await import(process.env.LOCKEDIN_PLAYWRIGHT_MODULE||"playwright"));}catch{throw new Error("Install Playwright locally or set LOCKEDIN_PLAYWRIGHT_MODULE to its module entry");}
const freePort=()=>new Promise((resolve,reject)=>{const socket=createServer();socket.once("error",reject);socket.listen(0,"127.0.0.1",()=>{const port=socket.address().port;socket.close(error=>error?reject(error):resolve(port));});});
const webPort=await freePort(),apiPort=await freePort(),base=`http://127.0.0.1:${webPort}`;
Object.assign(process.env,{APP_URL:base,BETTER_AUTH_URL:`http://127.0.0.1:${apiPort}`,DISCOVERY_ENABLED:"true",DISCOVERY_MODERATOR_USER_IDS:"browser-moderator",DISCOVERY_AREAS_JSON:'[{"id":"pilot-city","label":"Pilot city"},{"id":"other-city","label":"Other city"}]',RESEND_API_KEY:"",RESEND_FROM_EMAIL:""});
Object.assign(process.env,{DISCOVERY_PHOTOS_ENABLED:"true",CLOUDINARY_CLOUD_NAME:"synthetic",CLOUDINARY_API_KEY:"synthetic",CLOUDINARY_API_SECRET:"synthetic"});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../.."),web=path.join(root,"LockedIn/apps/web");
const artifacts=process.env.DISCOVERY_TEST_ARTIFACT_DIR||mkdtempSync(path.join(tmpdir(),"lockedin-discovery-browser-"));
console.log(`Browser artifacts: ${artifacts}`);
const log=openSync(path.join(artifacts,"preview.log"),"a");
let browser,preview,build,api,prisma;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reviewCase=process.env.DISCOVERY_REVIEW_CASE||"all";
const reviewRuns=name=>reviewCase==="all"||reviewCase===name;
async function ready(){for(let tries=0;tries<150;tries++){if(preview.exitCode!==null)throw new Error(`Preview exited ${preview.exitCode}; see ${artifacts}/preview.log`);try{if((await fetch(`${base}/login`)).ok)return;}catch{}await pause(200);}throw new Error(`Preview did not become ready; see ${artifacts}/preview.log`);}
try{
  ({prisma}=await import("../api/src/lib/prisma.ts"));
  const people=[];
  for(const key of ["a","b","c","d","existing-partner","moderator","e","f"]){
    const id=`browser-${key}`,token=`browser-token-${randomUUID()}`;
    await prisma.user.create({data:{id,email:`${id}@example.test`,name:`PRIVATE ${key}`,emailVerified:true}});
    await prisma.session.create({data:{id:randomUUID(),userId:id,token,expiresAt:new Date(Date.now()+3600000)}});
    const value=encodeURIComponent(`${token}.${createHmac("sha256",process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
    people.push({id,cookie:{name:"better-auth.session_token",value,url:base},publicName:`Public ${key.toUpperCase()}`});
  }
  process.env.DISCOVERY_PILOT_USER_IDS=people.map(person=>person.id).join(",");
  const [a,b,c,d,existingPartner,moderator,e,f]=people;
  const oldRelationship=await prisma.relationship.create({data:{members:{create:[{userId:d.id},{userId:existingPartner.id}]}}});
  const oldSnapshot=JSON.stringify(await prisma.relationship.findUnique({where:{id:oldRelationship.id},include:{members:true}}));
  const jpeg=await (await import("sharp")).default({create:{width:120,height:80,channels:3,background:"#74a989"}}).jpeg().toBuffer();
  const assets=new Map();
  const photoProvider={upload:async({photoId,jpeg})=>{
    const asset={assetId:`synthetic-${photoId}`,publicId:`lockedin-discovery/${photoId}`,version:1,format:"jpg"};
    const screening={moderation:[{kind:"aws_rek",status:"approved",response:{moderation_labels:[{name:"Implied Nudity",parent_name:"",confidence:50}]}}]};
    assets.set(asset.publicId,{asset,screening,jpeg});return{asset,screening};
  },inspect:async({publicId})=>assets.get(publicId)??null,read:async({publicId})=>assets.get(publicId).jpeg,destroy:async({publicId})=>{assets.delete(publicId);},override:async()=>{}};
  const discoveryGeocoder=async query=>query==="987 Synthetic Street"
    ?[{label:"987 Synthetic Street",areaLabel:"Pilot city",latitude:40.75123,longitude:-73.99987}]
    :[{label:"Uptown result",areaLabel:"Other city",latitude:40.87473,longitude:-73.99987}];
  api=await(await import("../api/src/app.ts")).buildServer({photoProvider,...(reviewRuns("distance")?{discoveryGeocoder}:{})});await api.listen({port:apiPort,host:"127.0.0.1"});
  const previewEnv={...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",API_PROXY_URL:`http://127.0.0.1:${apiPort}`,NEXT_PUBLIC_API_URL:""};
  // Production output avoids development HMR reloading a form while a newly
  // visited route compiles. The build uses this run's exact owned API port.
  build=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"build","--webpack"],{cwd:web,env:previewEnv,stdio:["ignore",log,log]});
  await new Promise((resolve,reject)=>{build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(new Error(`Browser preview build failed (${code}); see ${artifacts}/preview.log`)));});
  preview=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(webPort)],{cwd:web,env:previewEnv,stdio:["ignore",log,log]});
  await ready();
  browser=await chromium.launch({channel:process.env.LOCKEDIN_BROWSER_CHANNEL||"chrome",headless:true});
  const contexts=new Map(),errors=[];
  async function pageFor(person,fallback=false,track=true){const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:"reduce"});if(fallback)await context.addInitScript(()=>Object.defineProperty(window,"navigation",{value:undefined,configurable:true}));await context.addCookies([person.cookie]);const page=await context.newPage();page.on("pageerror",error=>{errors.push(error.message);console.log(`Browser error: ${error.message}`);});if(track)contexts.set(person.id,{context,page});return page;}
  const pageA=await pageFor(a),pageB=await pageFor(b),pageC=await pageFor(c),pageD=await pageFor(d),pageMod=await pageFor(moderator);
  pageA.on("console",message=>{if(message.text().startsWith("[discovery-navigation]"))console.log(message.text());});
  await pageA.addInitScript(()=>{
    window.navigation?.addEventListener("navigate",event=>queueMicrotask(()=>console.log("[discovery-navigation]",event.navigationType,event.destination?.url,event.defaultPrevented)));
    window.addEventListener("popstate",()=>console.log("[discovery-navigation] pop",location.href));
  });
  pageA.on("framenavigated",frame=>{if(frame===pageA.mainFrame())console.log(`A navigation: ${frame.url()}`);});
  pageA.on("dialog",async dialog=>{console.log(`A dialog: ${dialog.type()} ${dialog.message()}`);await dialog.dismiss();});
  async function request(person,method,endpoint,body){const response=await contexts.get(person.id).context.request.fetch(`${base}${endpoint}`,{method,headers:{Origin:base,"X-Discovery-Owner":person.id},...(body!==undefined?{data:body}:{})});return{status:response.status(),body:await response.json()};}
  async function publish(person,areaId="pilot-city"){
    const saved=await request(person,"PUT","/api/discovery/profile",{publicName:person.publicName,avatarPreset:"leaf",bio:`A public introduction from ${person.publicName}`,intention:"LONG_TERM",interests:["Reading"],pace:null,areaId,revision:0,...(person===b&&reviewRuns("matching")?{promptAnswer:"Make time and follow through."}:{})});assert.equal(saved.status,200);
    const result=await request(person,"POST","/api/discovery/profile/publish",{draftRevision:1,adultAttested:true});assert.equal(result.status,200);person.profileId=result.body.value.published.id;
  }
  await pageA.goto(`${base}/discover/profile`);await pageA.getByLabel("Public name",{exact:true}).fill(a.publicName);await pageA.getByLabel("Short introduction").fill("A public introduction from A");
  if(reviewRuns("matching")){
    await pageA.getByRole("button",{name:"Add written prompt",exact:true}).click();
    await pageA.getByLabel("Your answer",{exact:true}).fill("Listen and follow up.");
    await pageA.getByLabel("Height",{exact:true}).selectOption("175");
  }
  assert.equal(await pageA.getByRole("button",{name:"Refresh when ready",exact:true}).count(),0,"Initial quiet notification connection must not fill the page with a false activity banner");
  async function pendingProfileOperation(endpoint,button){
    if(!reviewRuns("profile")){await button.click();return;}
    let release,started;const pending=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    await pageA.route(`**${endpoint}`,async route=>{if(route.request().method()==="GET")return route.continue();const response=await route.fetch();started();await gate;await route.fulfill({response});});
    try{await button.click();await pending;
      const controls=await pageA.locator("main form input, main form textarea, main form select").all();assert(controls.length>=7,"Expected all public profile editing controls");
      for(const control of controls)assert(await control.isDisabled(),`Profile fields must not accept edits while ${endpoint} replaces their revision`);
      assert(await pageA.getByLabel(/I confirm I am 18 or older/).isDisabled(),"Publication consent cannot be changed while the editor is being replaced");
    }finally{release();await pageA.unrouteAll({behavior:"wait"});}
  }
  await pendingProfileOperation("/api/discovery/profile",pageA.getByRole("button",{name:"Save private draft",exact:true}));await pageA.getByText("Private draft saved. It has not been published.").waitFor();
  await pageA.getByLabel(/I confirm I am 18 or older/).check();await pendingProfileOperation("/api/discovery/profile/publish",pageA.getByRole("button",{name:"Publish profile",exact:true}));await pageA.getByText(/^Profile published/).waitFor();
  if(reviewRuns("matching")){
    const published=pageA.getByRole("region",{name:"Published Discovery profile",exact:true});
    await published.getByText("Listen and follow up.",{exact:true}).waitFor();
    await published.getByText(/175 cm/).waitFor();
  }
  a.profileId=(await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).id;
  for(const person of [b,c,d])await publish(person);
  if(reviewRuns("photos")){
    await pageA.getByRole("button",{name:"Edit profile",exact:true}).click();
    await pageA.getByLabel("Choose photo").setInputFiles({name:"synthetic.jpg",mimeType:"image/jpeg",buffer:jpeg});
    await pageA.getByLabel("Short introduction").fill("Unsaved draft text");
    assert.equal(await pageA.getByRole("button",{name:"Upload photo",exact:true}).isDisabled(),true);
    await pageA.getByRole("button",{name:"Save private draft",exact:true}).click();
    await pageA.getByRole("button",{name:"Upload photo",exact:true}).click();
    await pageA.getByText("Photo needs a moderator review", {exact:true}).waitFor();
    await pageA.getByRole("button",{name:"Manage photos",exact:true}).click();
    assert(await pageA.getByRole("heading",{name:"Discovery photos",exact:true}).evaluate(element=>element===document.activeElement));
    const [photo]=await prisma.discoveryPhoto.findMany({where:{ownerId:a.id}});
    assert(photo);const media=`/api/discovery/photos/${photo.id}/media`;
    assert.equal((await contexts.get(b.id).context.request.get(base+media)).status(),404);
    await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"photo-editor"});
    const panel=pageA.getByRole("region",{name:"Discovery photos",exact:true});
    for(const width of [320,393,430,1280]){
      await pageA.setViewportSize({width,height:852});
      assert(await panel.evaluate(element=>{
        const outer=element.getBoundingClientRect();
        return [...element.querySelectorAll("p, li, input, button")].every(child=>child.getBoundingClientRect().right<outer.right);
      }),`Photo editor controls should stay inside the card at ${width}px`);
    }
    await pageA.setViewportSize({width:393,height:852});
    await pageMod.goto(`${base}/discovery/moderation`);await pageMod.getByRole("button",{name:"Photo review",exact:true}).click();
    const queue=pageMod.getByRole("region",{name:"Photo review queue",exact:true});
    await queue.getByRole("button",{name:"Open preview",exact:true}).waitFor();
    assert.equal(await queue.locator("img").count(),0);
    await queue.getByRole("button",{name:"Open preview",exact:true}).click();
    await queue.getByRole("img",{name:"Restricted photo evidence",exact:true}).waitFor();
    await queue.getByText("Automated screening details",{exact:true}).click();
    await queue.getByText(/Sensitive category.*Implied Nudity.*50% confidence/).waitFor();
    await queue.getByLabel("Decision reason").fill("Synthetic photo review");
    await checkDiscoveryLayout(pageMod,{screenshotDir:artifacts,name:"photo-review"});
    pageMod.once("dialog",dialog=>dialog.accept());await queue.getByRole("button",{name:"Approve",exact:true}).click();
    await queue.getByText("Decision saved. Approval does not publish the photo.").waitFor();
    assert.equal((await contexts.get(b.id).context.request.get(base+media)).status(),404);
    await pageA.getByRole("button",{name:"Refresh photo status",exact:true}).click();
    await pageA.getByText("Ready to publish",{exact:true}).waitFor();
    await pageA.getByLabel("Photo 1 prompt",{exact:true}).selectOption("story");
    await pageA.getByRole("button",{name:"Save private draft",exact:true}).click();
    await pageA.getByText("Private draft saved. It has not been published.",{exact:true}).waitFor();
    await pageA.getByLabel(/I confirm I am 18 or older/).check();await pageA.getByRole("button",{name:"Publish profile",exact:true}).click();
    await pageA.getByText(/^Profile published/).waitFor();
    const ownerCard=pageA.getByRole("region",{name:"Published Discovery profile",exact:true});
    await ownerCard.getByRole("img",{name:`Photo 1 of ${a.publicName}`,exact:true}).waitFor();
    assert.equal(await pageA.getByLabel("Public name",{exact:true}).count(),0);
    await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"published-profile"});
    await pageA.getByRole("button",{name:"Edit profile",exact:true}).click();
    const publishedPhoto = pageA.getByText("Published on your Discovery profile",{exact:true});
    await publishedPhoto.waitFor();
    await pageA.reload();
    await ownerCard.getByRole("img",{name:`Photo 1 of ${a.publicName}`,exact:true}).waitFor();
    await pageA.getByRole("button",{name:"Edit profile",exact:true}).click();
    await publishedPhoto.waitFor();
    assert.equal(await pageA.getByText("Ready to publish",{exact:true}).count(),0);
    await pageB.goto(`${base}/discover`);
    await pageB.getByRole("list",{name:"People in this area"}).getByRole("button").filter({hasText:a.publicName}).click();
    const selected=pageB.getByRole("region",{name:"Selected person",exact:true});
    await selected.getByRole("img",{name:`Photo 1 of ${a.publicName}`}).waitFor();
    await selected.getByText("The story behind this photo…",{exact:true}).waitFor();
    await selected.getByRole("button",{name:"Reply to photo 1",exact:true}).click();
    await pageB.getByRole("heading",{name:"The story behind this photo…",exact:true}).waitFor();
    await pageB.getByLabel("Your reply",{exact:true}).waitFor();
    const delivered=await contexts.get(b.id).context.request.get(base+media);assert.equal(delivered.status(),200);assert.equal(delivered.headers()["cache-control"],"private, no-store");
    pageA.removeAllListeners("dialog");pageA.once("dialog",dialog=>dialog.accept());
    await pageA.getByRole("button",{name:"Delete now",exact:true}).click();
    await pageA.getByText("Photo removed from Discover and your draft.").waitFor();
    assert.equal((await contexts.get(b.id).context.request.get(base+media)).status(),404);
    console.log("PASS private photo editor, moderator approval, explicit publishing, peer bytes, and immediate deletion");
  }
  if(reviewRuns("query")){
    const failures=[];
    for(const fallback of [false,true]){
      const queryPage=await pageFor(a,fallback,false);
      try{
        await queryPage.goto(`${base}/connections?profile=${b.profileId}`);await queryPage.getByRole("textbox",{name:"A short hello (optional)",exact:true}).waitFor();await queryPage.getByRole("button",{name:"← My connections",exact:true}).click();await queryPage.waitForURL(`${base}/connections`);
        await queryPage.goBack({waitUntil:"commit"});await queryPage.getByRole("textbox",{name:"A short hello (optional)",exact:true}).fill(`QUERY PRIVATE ${fallback}`);
        const forward=queryPage.goForward({waitUntil:"commit",timeout:4000}).catch(()=>null);await queryPage.getByRole("button",{name:"Keep editing",exact:true}).waitFor({timeout:3000});await queryPage.getByRole("button",{name:"Keep editing",exact:true}).click();await forward;
        assert.equal(await queryPage.getByRole("textbox",{name:"A short hello (optional)",exact:true}).inputValue(),`QUERY PRIVATE ${fallback}`);
        const leave=queryPage.goForward({waitUntil:"commit",timeout:4000}).catch(()=>null);await queryPage.getByRole("button",{name:"Leave draft",exact:true}).click();await leave;await queryPage.waitForURL(`${base}/connections`);
        await queryPage.goBack({waitUntil:"commit"});await queryPage.getByRole("textbox",{name:"A short hello (optional)",exact:true}).fill(`SECOND PRIVATE ${fallback}`);
        const again=queryPage.goForward({waitUntil:"commit",timeout:4000}).catch(()=>null);await queryPage.getByRole("button",{name:"Keep editing",exact:true}).waitFor({timeout:3000});await queryPage.getByRole("button",{name:"Keep editing",exact:true}).click();await again;assert.equal(await queryPage.getByRole("textbox",{name:"A short hello (optional)",exact:true}).inputValue(),`SECOND PRIVATE ${fallback}`);
      }catch(error){failures.push(`${fallback?"fallback":"modern"}: ${error.message}`);}finally{await queryPage.context().close();}
    }
    assert.deepEqual(failures,[],"Both history mechanisms must guard query-only invitation editor changes and reset approval for the next draft");
  }
  await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"profile"});
  await pageB.goto(`${base}/discover`);await pageB.getByRole("heading",{name:"Find someone to build with."}).waitFor();await pageB.getByRole("region",{name:"Selected person"}).waitFor();
  assert(!await pageB.locator("main").innerText().then(text=>text.includes("PRIVATE")));
  await checkDiscoveryLayout(pageB,{screenshotDir:artifacts,name:"browse"});
  if(reviewRuns("matching")){
    await pageA.goto(`${base}/discover`);
    const picker=pageA.getByLabel("Explore an area");
    assert.equal(await picker.inputValue(),"pilot-city");
    await picker.selectOption("other-city");
    await pageA.getByRole("heading",{name:"No profiles to show in Other city yet",exact:true}).waitFor();
    await pageA.getByText("Your profile stays listed in Pilot city.",{exact:false}).waitFor();
    await pageA.getByRole("button",{name:"Explore another area",exact:true}).click();
    assert(await picker.evaluate(element=>element===document.activeElement));
    await picker.selectOption("pilot-city");
    await pageA.getByRole("list",{name:"People in this area"}).getByRole("button").filter({hasText:b.publicName}).click();
    const selected=pageA.getByRole("region",{name:"Selected person",exact:true});
    await selected.getByText("Why you’re seeing this profile:",{exact:true}).waitFor();
    await selected.getByRole("button",{name:"Reply to this answer",exact:true}).click();
    await pageA.getByText("Make time and follow through.",{exact:true}).waitFor();
    await pageA.getByLabel("Your reply",{exact:true}).fill("A browser starter hello");
    await pageA.getByRole("button",{name:"Send reply as invitation",exact:true}).click();
    console.log("PASS city switching, recommendation reasons and published profile prompt reply");
  }else{
    await pageA.goto(`${base}/connections?profile=${b.profileId}`);await pageA.getByLabel("A short hello (optional)").fill("A browser starter hello");await pageA.getByRole("button",{name:"Send starter invitation",exact:true}).click();
  }
  await pageA.waitForURL(/\/connections\/[a-f0-9-]+$/,{timeout:5000});const connectionId=new URL(pageA.url()).pathname.split("/").at(-1),connectionUrl=`/connections/${connectionId}`;
  await pageB.goto(`${base}/journey`);await pageB.getByRole("button",{name:/^Notifications,/}).click();await pageB.getByRole("button",{name:"Open activity"}).click();await pageB.waitForURL(`${base}${connectionUrl}`);
  const accept=pageB.getByRole("button",{name:"Accept starter",exact:true});await accept.waitFor();assert((await accept.boundingBox()).y<760,"Acceptance must be visible near the top on phone");
  await checkDiscoveryLayout(pageB,{screenshotDir:artifacts,name:"invitation"});await accept.click();await pageB.getByRole("textbox",{name:"Your private response",exact:true}).waitFor();
  assert.equal(await prisma.relationshipMember.count({where:{userId:b.id}}),0);
  const second=await request(a,"POST","/api/discovery/connections",{targetProfileId:c.profileId,topicKey:"communication",hello:"Separate starter",requestId:randomUUID()});assert.equal(second.status,200);const secondId=second.body.value.id;
  await pageC.goto(`${base}/connections/${secondId}`);await pageC.getByRole("button",{name:"Decline quietly",exact:true}).click();await pageC.getByText("Read-only history",{exact:true}).waitFor();
  await pageA.reload();await pageA.getByRole("textbox",{name:"Your private response",exact:true}).fill("PRIVATE UNSENT A");await pageA.getByRole("button",{name:"Save privately",exact:true}).click();await pageA.getByText("Saved privately. Nothing was shared.").waitFor();
  await pageB.reload();assert(!await pageB.locator("main").innerText().then(text=>text.includes("PRIVATE UNSENT A")));
  await pageA.getByRole("button",{name:"Share saved response",exact:true}).click();await pageB.reload();await pageB.getByText("PRIVATE UNSENT A",{exact:true}).waitFor();
  assert.equal((await request(c,"GET",`/api/discovery/connections/${connectionId}`)).status,404);
  await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"starter"});
  // Dirty close cancellation must not silently approve a later browser Back.
  await pageA.getByRole("textbox",{name:"Your private response",exact:true}).fill("UNFINISHED RESPONSE");await pageA.getByRole("button",{name:"Close this starter",exact:true}).click();await pageA.getByRole("button",{name:"Leave draft",exact:true}).click();await pageA.getByRole("button",{name:"Keep starter",exact:true}).click();
  const back=pageA.goBack({waitUntil:"commit",timeout:4000}).catch(()=>null);await pageA.getByRole("button",{name:"Keep editing",exact:true}).waitFor({timeout:3000});await pageA.getByRole("button",{name:"Keep editing",exact:true}).click();await back;assert.equal(await pageA.getByRole("textbox",{name:"Your private response",exact:true}).inputValue(),"UNFINISHED RESPONSE");
  await pageA.getByRole("button",{name:"Save privately",exact:true}).click();await pageA.getByText("Saved privately. Nothing was shared.").waitFor();
  if(reviewRuns("reports"))assert.equal((await request(a,"POST",`/api/discovery/connections/${connectionId}/share`,{draftRevision:2,requestId:randomUUID()})).status,200);
  await pageA.getByRole("button",{name:"Your space",exact:true}).click();await pageA.getByRole("textbox",{name:"Your private reflection",exact:true}).fill("SOLO REFLECTION A");await pageA.getByRole("button",{name:"Save only for me",exact:true}).click();await pageA.getByText("Your saved reflection is private.").waitFor();assert(!JSON.stringify((await request(b,"GET",`/api/discovery/connections/${connectionId}`)).body).includes("SOLO REFLECTION A"));
  await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"private-reflection"});
  const dInvite=await request(d,"POST","/api/discovery/connections",{targetProfileId:a.profileId,topicKey:"support",hello:"Existing space remains",requestId:randomUUID()});assert.equal(dInvite.status,200);const dId=dInvite.body.value.id;
  assert.equal((await request(a,"POST",`/api/discovery/connections/${dId}/accept`,{})).status,200);assert.equal((await request(d,"POST",`/api/discovery/connections/${dId}/readiness`,{ready:true,consentVersion:1})).status,409);assert.equal(JSON.stringify(await prisma.relationship.findUnique({where:{id:oldRelationship.id},include:{members:true}})),oldSnapshot);
  await pageA.goto(`${base}${connectionUrl}`);await pageA.getByText("Build together · a separate mutual choice",{exact:true}).click();await pageA.getByRole("button",{name:"I choose to build together",exact:true}).click();await pageA.getByRole("button",{name:"Withdraw my choice",exact:true}).waitFor();
  await pageB.reload();
  if(reviewRuns("promotion")){
    await pageB.getByRole("textbox",{name:"Your private response",exact:true}).fill("B PRIVATE MUST NOT DISAPPEAR");await pageB.getByRole("button",{name:"I choose to build together",exact:true}).click();await pageB.getByRole("button",{name:"Keep editing",exact:true}).waitFor({timeout:3000});await pageB.getByRole("button",{name:"Keep editing",exact:true}).click();
    assert.equal(await pageB.getByRole("textbox",{name:"Your private response",exact:true}).inputValue(),"B PRIVATE MUST NOT DISAPPEAR");assert.equal(await prisma.relationshipMember.count({where:{userId:b.id}}),0);
    await pageB.getByRole("button",{name:"Save privately",exact:true}).click();await pageB.getByText("Saved privately. Nothing was shared.").waitFor();assert.equal(await prisma.discoverySharedResponse.count({where:{connectionId,ownerId:b.id}}),0,"Build guard must never auto-share private text");
  }
  await pageB.getByRole("button",{name:"I choose to build together",exact:true}).click();await pageB.getByRole("button",{name:"Open our shared space",exact:true}).waitFor({timeout:3000});
  const promoted=await prisma.discoveryConnection.findUniqueOrThrow({where:{id:connectionId}});assert.equal(promoted.state,"PROMOTED");assert.equal(await prisma.relationshipMember.count({where:{relationshipId:promoted.relationshipId}}),2);assert.equal((await prisma.discoveryConnection.findUniqueOrThrow({where:{id:secondId}})).state,"DECLINED");
  await pageB.getByText("Safety & contact controls",{exact:true}).click();
  if(reviewRuns("reports")){
    const source=pageB.getByLabel("Content to report",{exact:true});await source.waitFor({timeout:3000});assert(await source.getByRole("option",{name:"Received invitation",exact:true}).count());await source.selectOption({label:"Shared response · version 1"});
  }
  await pageB.getByLabel("Optional context",{exact:true}).fill("Browser safety review");await pageB.getByRole("button",{name:"Send report",exact:true}).click();await pageB.getByText("Report received for moderator review. We cannot promise a response time.",{exact:true}).waitFor();
  if(reviewRuns("reports")){const evidence=await prisma.discoveryReport.findFirstOrThrow({where:{reporterId:b.id,details:"Browser safety review"}});assert.equal(evidence.evidence.text,"PRIVATE UNSENT A","Reporting the old selected version must capture that snapshot, not the latest harmless replacement");}
  assert.equal((await request(c,"GET","/api/discovery/moderation/reports")).status,403);await pageMod.goto(`${base}/discovery/moderation`);await pageMod.getByRole("heading",{name:"Discovery report review."}).waitFor();
  await checkDiscoveryLayout(pageMod,{screenshotDir:artifacts,name:"moderation"});
  const reviewCard=pageMod.locator("section").filter({has:pageMod.getByText("Browser safety review",{exact:true})});
  pageMod.once("dialog",dialog=>dialog.accept());await reviewCard.getByRole("button",{name:"Suspend discovery access",exact:true}).click();await reviewCard.getByRole("button",{name:"Restore discovery access",exact:true}).waitFor();
  assert((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).suspendedAt);
  assert.equal((await prisma.relationship.findUniqueOrThrow({where:{id:promoted.relationshipId}})).status,"ACTIVE");
  pageMod.once("dialog",dialog=>dialog.accept());await reviewCard.getByRole("button",{name:"Restore discovery access",exact:true}).click();await reviewCard.getByRole("button",{name:"Restore discovery access",exact:true}).waitFor({state:"hidden"});
  assert.equal((await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).suspendedAt,null);
  await pageB.getByRole("button",{name:"Block contact",exact:true}).click();await pageB.getByRole("alertdialog",{name:"Block this contact?",exact:true}).getByRole("button",{name:"Block contact",exact:true}).click();
  await pageB.getByText("Contact blocked. Existing full shared spaces are unchanged. Unblocking will not reopen this starter.",{exact:true}).waitFor();
  await pageB.getByRole("button",{name:"Open our shared space",exact:true}).waitFor({timeout:3000});
  assert.equal((await prisma.relationship.findUniqueOrThrow({where:{id:promoted.relationshipId}})).status,"ACTIVE");
  await pageC.goto(`${base}/discover`);await pageC.getByRole("list",{name:"People in this area",exact:true}).getByRole("button").filter({hasText:d.publicName}).click();
  const selectedPerson=pageC.getByRole("region",{name:"Selected person",exact:true});await selectedPerson.getByRole("heading",{name:d.publicName,exact:true}).waitFor();await selectedPerson.getByText("Safety & contact controls",{exact:true}).click();await selectedPerson.getByRole("button",{name:"Block contact",exact:true}).click();await pageC.getByRole("alertdialog",{name:"Block this contact?",exact:true}).getByRole("button",{name:"Block contact",exact:true}).click();
  await pageC.waitForURL(`${base}/connections`,{timeout:5000});
  if(reviewRuns("distance")){
    const pageE=await pageFor(e),pageF=await pageFor(f);
    await publish(e);await publish(f,"other-city");
    async function setDistance(page,query,label,miles){
      await page.goto(`${base}/discover`);
      await page.getByRole("button",{name:"Distance preferences",exact:true}).click();
      const preferences=page.getByRole("region",{name:"Distance preferences",exact:true});
      await preferences.getByLabel("Search location",{exact:true}).fill(query);
      await preferences.getByRole("button",{name:"Find location",exact:true}).click();
      await preferences.getByRole("radio",{name:label,exact:true}).check();
      await preferences.getByRole("radio",{name:`${miles} mi`,exact:true}).check();
      await preferences.getByRole("button",{name:"Save preferences",exact:true}).click();
      await page.getByText("Distance preferences saved.",{exact:true}).waitFor();
    }
    await setDistance(pageE,"987 Synthetic Street","987 Synthetic Street",25);
    await setDistance(pageF,"Uptown","Uptown result",5);
    await pageE.reload();
    await pageE.getByRole("heading",{name:"No profiles fit your distance preferences right now.",exact:true}).waitFor();
    assert.equal(await pageE.getByText("987 Synthetic Street",{exact:true}).count(),0);
    assert(!pageE.url().includes("Synthetic"));
    await pageF.getByRole("button",{name:"Change distance",exact:true}).click();
    const settings=pageF.getByRole("region",{name:"Distance preferences",exact:true});
    await checkDiscoveryLayout(pageF,{screenshotDir:artifacts,name:"distance-preferences"});
    await settings.getByRole("radio",{name:"10 mi",exact:true}).check();
    await settings.getByRole("button",{name:"Save preferences",exact:true}).click();
    await settings.waitFor({state:"hidden"});
    await pageE.reload();
    const card=pageE.getByRole("region",{name:"Selected person",exact:true});
    await card.getByRole("heading",{name:f.publicName,exact:true}).waitFor();
    await card.getByText("Other city",{exact:true}).waitFor();
    await pageF.getByRole("button",{name:"Distance preferences",exact:true}).click();
    await settings.getByRole("button",{name:"Remove search location and browse by city",exact:true}).click();
    await pageF.getByLabel("Explore an area").waitFor();
    console.log("PASS private location selection, mutual distance limits, cross-city Discovery and removing the saved location");
  }
  const fallback=await pageFor(c,true);await fallback.goto(`${base}/connections`);await fallback.getByRole("button",{name:"Your space",exact:true}).click();await fallback.getByRole("textbox",{name:"Your private reflection",exact:true}).fill("FALLBACK UNSAVED");const fallbackBack=fallback.goBack({waitUntil:"commit",timeout:4000}).catch(()=>null);await fallback.getByRole("button",{name:"Keep editing",exact:true}).click();await fallbackBack;assert.equal(await fallback.getByRole("textbox",{name:"Your private reflection",exact:true}).inputValue(),"FALLBACK UNSAVED");
  // Account switch discards mounted state; old text is never installed for B.
  await contexts.get(a.id).context.clearCookies();await contexts.get(a.id).context.addCookies([b.cookie]);await pageA.goto(`${base}/your-space`);await pageA.getByRole("textbox",{name:"Your private reflection",exact:true}).waitFor();assert.equal(await pageA.getByRole("textbox",{name:"Your private reflection",exact:true}).inputValue(),"");
  process.env.DISCOVERY_ENABLED="false";
  assert.equal((await request(b,"GET","/api/discovery/candidates?areaId=pilot-city")).status,403);assert.equal((await request(b,"GET",`/api/discovery/connections/${connectionId}`)).status,200);assert.equal((await request(a,"GET","/api/discovery/reflection")).status,200);
  assert.equal((await request(b,"POST","/api/discovery/blocks",{connectionId})).status,200);
  assert.deepEqual(errors,[],"No browser runtime errors");
  console.log("Verified report UI, audited moderator suspend/restore and block without hiding the existing deep space.");
  console.log(`PASS real multi-account discovery workflow, modern/fallback draft guards, layouts and migration isolation. Screenshots: ${artifacts}`);
}finally{
  await browser?.close();
  if(build&&build.exitCode===null)build.kill("SIGTERM");
  if(preview&&preview.exitCode===null){preview.kill("SIGTERM");await Promise.race([new Promise(resolve=>preview.once("exit",resolve)),pause(3000)]);}
  await api?.close();await prisma?.$disconnect();closeSync(log);
}
