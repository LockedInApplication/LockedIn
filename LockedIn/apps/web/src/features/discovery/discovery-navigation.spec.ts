import {expect,it} from "vitest";
import {safeDiscoveryDestination} from "./discovery-navigation";
it("allows known local destinations but never external or arbitrary return URLs",()=>{
  for(const url of ["https://evil.test","//evil.test","/\\evil.test","/admin","javascript:alert(1)"])expect(safeDiscoveryDestination(url)).toBeNull();
  expect(safeDiscoveryDestination("/connections/known-id")).toBe("/connections/known-id");
  expect(safeDiscoveryDestination("/discover/profile")).toBe("/discover/profile");
  expect(safeDiscoveryDestination("/discover/matching")).toBe("/discover/matching");
  expect(safeDiscoveryDestination("/messages/chat-id?date=a")).toBe("/messages/chat-id?date=a");
  expect(safeDiscoveryDestination("/connections?compose=invite")).toBe("/connections?compose=invite");
  expect(safeDiscoveryDestination("/journey?view=atlas")).toBe("/journey?view=atlas");
  expect(safeDiscoveryDestination("/verify-email?pending=1")).toBe("/verify-email?pending=1");
});
