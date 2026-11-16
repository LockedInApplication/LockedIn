import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import DiscoveryProfileEditor from "./DiscoveryProfileEditor";
it("separates saving from publishing and previews only deliberately chosen public fields",()=>{
  const html=renderToStaticMarkup(createElement(DiscoveryProfileEditor,{initial:{draft:null,revision:0,published:null,publicationVersion:0,paused:false,adultAttested:false,suspended:false},areas:[{id:"pilot-city",label:"Pilot city"}],onDirty:()=>{},onSave:async()=>{},onPublish:async()=>{}}));
  expect(html).toContain("Save private draft");expect(html).toContain("Publish profile");expect(html).toContain("Public preview");expect(html).toContain("18 or older");expect(html).not.toContain('type="email"');expect(html).not.toContain("geolocation");
});
