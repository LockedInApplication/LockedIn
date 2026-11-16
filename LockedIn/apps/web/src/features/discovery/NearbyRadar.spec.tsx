import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import NearbyRadar from "./NearbyRadar";
import type {PublicDiscoveryProfile} from "./discovery.types";
const candidates:PublicDiscoveryProfile[]=[{id:"chosen-a",publicName:"Chosen alias",avatarPreset:"leaf",bio:"Public bio",intention:"LONG_TERM",interests:[],pace:null,areaId:"pilot-city"}];
it("uses only server candidates and clearly labels the arrangement as illustrative",()=>{
  const html=renderToStaticMarkup(createElement(NearbyRadar,{candidates,selectedId:"chosen-a",onSelect:()=>{}}));
  expect(html).toContain("Chosen alias");expect(html).toContain("not exact position or distance");expect(html).toContain('aria-pressed="true"');
});
it("shows an honest empty area without invented people or scan results",()=>{
  const html=renderToStaticMarkup(createElement(NearbyRadar,{candidates:[],selectedId:null,onSelect:()=>{}}));
  expect(html).toContain("No people to show");expect(html).not.toContain("Chosen alias");expect(html).not.toContain("aria-pressed");
});
