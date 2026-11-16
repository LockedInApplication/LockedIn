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
Object.assign(process.env,{APP_URL:base,BETTER_AUTH_URL:`http://127.0.0.1:${apiPort}`,DISCOVERY_ENABLED:"true",DISCOVERY_MODERATOR_USER_IDS:"browser-moderator",DISCOVERY_AREAS_JSON:'[{"id":"pilot-city","label":"Pilot city"}]',RESEND_API_KEY:"",RESEND_FROM_EMAIL:""});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../.."),web=path.join(root,"LockedIn/apps/web");
const artifacts=process.env.DISCOVERY_TEST_ARTIFACT_DIR||mkdtempSync(path.join(tmpdir(),"lockedin-discovery-browser-"));
console.log(`Browser artifacts: ${artifacts}`);
const log=openSync(path.join(artifacts,"preview.log"),"a");
let browser,preview,build,api,prisma;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){for(let tries=0;tries<150;tries++){if(preview.exitCode!==null)throw new Error(`Preview exited ${preview.exitCode}; see ${artifacts}/preview.log`);try{if((await fetch(`${base}/login`)).ok)return;}catch{}await pause(200);}throw new Error(`Preview did not become ready; see ${artifacts}/preview.log`);}
try{
  ({prisma}=await import("../api/src/lib/prisma.ts"));
  const people=[];
  for(const key of ["a","b","c","d","existing-partner","moderator"]){
    const id=`browser-${key}`,token=`browser-token-${randomUUID()}`;
    await prisma.user.create({data:{id,email:`${id}@example.test`,name:`PRIVATE ${key}`,emailVerified:true}});
    await prisma.session.create({data:{id:randomUUID(),userId:id,token,expiresAt:new Date(Date.now()+3600000)}});
    const value=encodeURIComponent(`${token}.${createHmac("sha256",process.env.BETTER_AUTH_SECRET).update(token).digest("base64")}`);
    people.push({id,cookie:{name:"better-auth.session_token",value,url:base},publicName:`Public ${key.toUpperCase()}`});
  }
  process.env.DISCOVERY_PILOT_USER_IDS=people.map(person=>person.id).join(",");
  const [a,b,c,d,existingPartner,moderator]=people;
  const oldRelationship=await prisma.relationship.create({data:{members:{create:[{userId:d.id},{userId:existingPartner.id}]}}});
  const oldSnapshot=JSON.stringify(await prisma.relationship.findUnique({where:{id:oldRelationship.id},include:{members:true}}));
  api=await(await import("../api/src/app.ts")).buildServer();await api.listen({port:apiPort,host:"127.0.0.1"});
  const previewEnv={...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",API_PROXY_URL:`http://127.0.0.1:${apiPort}`,NEXT_PUBLIC_API_URL:""};
  // Production output avoids development HMR reloading a form while a newly
  // visited route compiles. The build uses this run's exact owned API port.
  build=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"build","--webpack"],{cwd:web,env:previewEnv,stdio:["ignore",log,log]});
  await new Promise((resolve,reject)=>{build.once("error",reject);build.once("exit",code=>code===0?resolve():reject(new Error(`Browser preview build failed (${code}); see ${artifacts}/preview.log`)));});
  preview=spawn(process.execPath,[path.join(web,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(webPort)],{cwd:web,env:previewEnv,stdio:["ignore",log,log]});
  await ready();
  browser=await chromium.launch({channel:process.env.LOCKEDIN_BROWSER_CHANNEL||"chrome",headless:true});
  const contexts=new Map();
  async function pageFor(person,fallback=false){const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:"reduce"});if(fallback)await context.addInitScript(()=>Object.defineProperty(window,"navigation",{value:undefined,configurable:true}));await context.addCookies([person.cookie]);const page=await context.newPage();contexts.set(person.id,{context,page});return page;}
  const pageA=await pageFor(a),pageB=await pageFor(b),pageC=await pageFor(c),pageD=await pageFor(d),pageMod=await pageFor(moderator);
  pageA.on("console",message=>{if(message.text().startsWith("[discovery-navigation]"))console.log(message.text());});
  await pageA.addInitScript(()=>{
    window.navigation?.addEventListener("navigate",event=>queueMicrotask(()=>console.log("[discovery-navigation]",event.navigationType,event.destination?.url,event.defaultPrevented)));
    window.addEventListener("popstate",()=>console.log("[discovery-navigation] pop",location.href));
  });
  pageA.on("framenavigated",frame=>{if(frame===pageA.mainFrame())console.log(`A navigation: ${frame.url()}`);});
  pageA.on("dialog",async dialog=>{console.log(`A dialog: ${dialog.type()} ${dialog.message()}`);await dialog.dismiss();});
  const errors=[];for(const{page}of contexts.values())page.on("pageerror",error=>{errors.push(error.message);console.log(`Browser error: ${error.message}`);});
  async function request(person,method,endpoint,body){const response=await contexts.get(person.id).context.request.fetch(`${base}${endpoint}`,{method,headers:{Origin:base,"X-Discovery-Owner":person.id},...(body!==undefined?{data:body}:{})});return{status:response.status(),body:await response.json()};}
  async function publish(person){
    const saved=await request(person,"PUT","/api/discovery/profile",{publicName:person.publicName,avatarPreset:"leaf",bio:`A public introduction from ${person.publicName}`,intention:"LONG_TERM",interests:["Reading"],pace:null,areaId:"pilot-city",revision:0});assert.equal(saved.status,200);
    const result=await request(person,"POST","/api/discovery/profile/publish",{draftRevision:1,adultAttested:true});assert.equal(result.status,200);person.profileId=result.body.value.published.id;
  }
  await pageA.goto(`${base}/discover/profile`);await pageA.getByLabel("Public name",{exact:true}).fill(a.publicName);await pageA.getByLabel("Short introduction").fill("A public introduction from A");
  assert.equal(await pageA.getByRole("button",{name:"Refresh when ready",exact:true}).count(),0,"Initial quiet notification connection must not fill the page with a false activity banner");
  await pageA.getByRole("button",{name:"Save private draft",exact:true}).click();await pageA.getByText("Private draft saved. It has not been published.").waitFor();
  await pageA.getByLabel(/I confirm I am 18 or older/).check();await pageA.getByRole("button",{name:"Publish profile",exact:true}).click();await pageA.getByText(/^Profile published/).waitFor();
  a.profileId=(await prisma.discoveryProfile.findUniqueOrThrow({where:{ownerId:a.id}})).id;
  for(const person of [b,c,d])await publish(person);
  await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"profile"});
  await pageB.goto(`${base}/discover`);await pageB.getByRole("heading",{name:"Find someone to build with."}).waitFor();await pageB.getByRole("region",{name:"Selected person"}).waitFor();
  assert(!await pageB.locator("main").innerText().then(text=>text.includes("PRIVATE")));
  await checkDiscoveryLayout(pageB,{screenshotDir:artifacts,name:"browse"});
  await pageA.goto(`${base}/connections?profile=${b.profileId}`);await pageA.getByLabel("A short hello (optional)").fill("A browser starter hello");await pageA.getByRole("button",{name:"Send starter invitation",exact:true}).click();
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
  await pageA.getByRole("button",{name:"Your space",exact:true}).click();await pageA.getByRole("textbox",{name:"Your private reflection",exact:true}).fill("SOLO REFLECTION A");await pageA.getByRole("button",{name:"Save only for me",exact:true}).click();await pageA.getByText("Your saved reflection is private.").waitFor();assert(!JSON.stringify((await request(b,"GET",`/api/discovery/connections/${connectionId}`)).body).includes("SOLO REFLECTION A"));
  await checkDiscoveryLayout(pageA,{screenshotDir:artifacts,name:"private-reflection"});
  const dInvite=await request(d,"POST","/api/discovery/connections",{targetProfileId:a.profileId,topicKey:"support",hello:"Existing space remains",requestId:randomUUID()});assert.equal(dInvite.status,200);const dId=dInvite.body.value.id;
  assert.equal((await request(a,"POST",`/api/discovery/connections/${dId}/accept`,{})).status,200);assert.equal((await request(d,"POST",`/api/discovery/connections/${dId}/readiness`,{ready:true,consentVersion:1})).status,409);assert.equal(JSON.stringify(await prisma.relationship.findUnique({where:{id:oldRelationship.id},include:{members:true}})),oldSnapshot);
  await pageA.goto(`${base}${connectionUrl}`);await pageA.getByText("Build together · a separate mutual choice",{exact:true}).click();await pageA.getByRole("button",{name:"I choose to build together",exact:true}).click();await pageA.getByRole("button",{name:"Withdraw my choice",exact:true}).waitFor();
  await pageB.reload();await pageB.getByRole("button",{name:"I choose to build together",exact:true}).click();await pageB.getByRole("button",{name:"Open our shared space",exact:true}).waitFor({timeout:3000});
  const promoted=await prisma.discoveryConnection.findUniqueOrThrow({where:{id:connectionId}});assert.equal(promoted.state,"PROMOTED");assert.equal(await prisma.relationshipMember.count({where:{relationshipId:promoted.relationshipId}}),2);assert.equal((await prisma.discoveryConnection.findUniqueOrThrow({where:{id:secondId}})).state,"DECLINED");
  await pageB.getByText("Safety & contact controls",{exact:true}).click();await pageB.getByLabel("Optional context",{exact:true}).fill("Browser safety review");await pageB.getByRole("button",{name:"Send report",exact:true}).click();await pageB.getByText("Report received for moderator review. We cannot promise a response time.",{exact:true}).waitFor();
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
