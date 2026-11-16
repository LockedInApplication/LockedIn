import {expect,it} from "vitest";
import {safeDiscoveryDestination,discoveryEntry} from "./discovery-navigation";
it("allows known local destinations but never external or arbitrary return URLs",()=>{
  for(const url of ["https://evil.test","//evil.test","/\\evil.test","/admin","javascript:alert(1)"])expect(safeDiscoveryDestination(url)).toBeNull();
  expect(safeDiscoveryDestination("/connections/known-id")).toBe("/connections/known-id");
  expect(safeDiscoveryDestination("/discover/profile")).toBe("/discover/profile");
  expect(safeDiscoveryDestination("/journey?view=atlas")).toBe("/journey?view=atlas");
});
it("keeps the new-entry UI absent when disabled but retains a history destination",()=>{
  expect(discoveryEntry({canDiscover:false,hasHistory:false})).toBeNull();
  expect(discoveryEntry({canDiscover:false,hasHistory:true})?.path).toBe("/connections");
  expect(discoveryEntry({canDiscover:true,hasHistory:false})?.path).toBe("/discover");
});
