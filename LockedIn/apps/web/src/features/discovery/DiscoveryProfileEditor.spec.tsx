import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DiscoveryProfileEditor from "./DiscoveryProfileEditor";
it("does not ask for a city when Discovery uses a private device check",()=>{
  const html=renderToStaticMarkup(createElement(DiscoveryProfileEditor,{initial:{draft:null,revision:0,published:null,publicationVersion:0,paused:false,adultAttested:false,suspended:false},areas:[],onDirty:()=>{},onSave:async()=>{},onPublish:async()=>{},...{worldwideDiscovery:true}}));
  expect(html).not.toMatch(/Discovery city|Profile city/);
  expect(html).toContain("Other people only see Nearby");
});
it("separates saving from publishing and previews only deliberately chosen public fields",()=>{
  const html=renderToStaticMarkup(createElement(DiscoveryProfileEditor,{initial:{draft:null,revision:0,published:null,publicationVersion:0,paused:false,adultAttested:false,suspended:false},areas:[{id:"pilot-city",label:"Pilot city"}],onDirty:()=>{},onSave:async()=>{},onPublish:async()=>{}}));
  expect(html).toContain("Save private draft");expect(html).toContain("Publish profile");expect(html).toContain("Review and publish");expect(html).toContain("18 or older");expect(html).not.toContain('type="email"');expect(html).not.toContain("geolocation");
});
