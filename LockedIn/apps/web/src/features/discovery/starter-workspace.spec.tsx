import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import BuildTogetherPanel from "./BuildTogetherPanel";
import type {DiscoveryConnectionView} from "./discovery.types";
const connection:DiscoveryConnectionView={id:"c",state:"ACCEPTED",topic:{key:"support",text:"What helps you feel supported?"},hello:"Hello",inviter:"self",senderSnapshot:{publicName:"Alias",avatarPreset:"leaf"},partner:{publicName:"Other alias",avatarPreset:"sun"},ownDraft:{text:"Private draft",revision:1},sharedResponses:[{id:"s",author:"partner",text:"Explicitly shared words",version:1,sharedAt:"2026-01-01"}],readiness:{mine:false,theirs:true,consentVersion:1},promotedRelationshipId:null,canAccept:false,canShare:true,canClose:true,canChooseBuild:true};
it("explains the mutual choice and keeps one-sided readiness revocable",()=>{
  const html=renderToStaticMarkup(createElement(BuildTogetherPanel,{connection:{...connection,readiness:{mine:true,theirs:false,consentVersion:1}},busy:false,currentRelationshipId:null,onChoose:()=>{},onOpen:()=>{}}));
  expect(html).toContain("Withdraw my choice");expect(html).toContain("does not imply exclusivity");expect(html).not.toContain("Private drafts");
});
