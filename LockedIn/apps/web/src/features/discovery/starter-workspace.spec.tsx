import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import StarterConversation from "./StarterConversation";
import BuildTogetherPanel from "./BuildTogetherPanel";
import type {DiscoveryConnectionView} from "./discovery.types";
const connection:DiscoveryConnectionView={id:"c",state:"ACCEPTED",topic:{key:"support",text:"What helps you feel supported?"},hello:"Hello",inviter:"self",senderSnapshot:{publicName:"Alias",avatarPreset:"leaf"},partner:{publicName:"Other alias",avatarPreset:"sun"},ownDraft:{text:"Private draft",revision:1},sharedResponses:[{id:"s",author:"partner",text:"Explicitly shared words",version:1,sharedAt:"2026-01-01"}],readiness:{mine:false,theirs:true,consentVersion:1},promotedRelationshipId:null,canAccept:false,canShare:true,canClose:true,canChooseBuild:true};
it("puts the chosen conversation first and distinguishes saved private text from sharing",()=>{
  const html=renderToStaticMarkup(createElement(StarterConversation,{connection,text:"Private draft",busy:false,onChange:()=>{},onSave:()=>{},onShare:()=>{}}));
  expect(html).toContain("What helps you feel supported?");expect(html).toContain("Save privately");expect(html).toContain("Share saved response");expect(html).toContain("Explicitly shared words");expect(html).toContain("Private draft");
});
it("closed history cannot expose actionable save/share controls",()=>{
  const html=renderToStaticMarkup(createElement(StarterConversation,{connection:{...connection,state:"CLOSED",canShare:false,canClose:false,canChooseBuild:false},text:"Private draft",busy:false,onChange:()=>{},onSave:()=>{},onShare:()=>{}}));
  expect(html).toContain("Read-only history");expect(html).not.toContain("Share saved response");expect(html).not.toContain("Save privately");
});
it("explains the mutual choice and keeps one-sided readiness revocable",()=>{
  const html=renderToStaticMarkup(createElement(BuildTogetherPanel,{connection:{...connection,readiness:{mine:true,theirs:false,consentVersion:1}},busy:false,currentRelationshipId:null,onChoose:()=>{},onOpen:()=>{}}));
  expect(html).toContain("Withdraw my choice");expect(html).toContain("does not imply exclusivity");expect(html).toContain("Private drafts are not imported");
});
