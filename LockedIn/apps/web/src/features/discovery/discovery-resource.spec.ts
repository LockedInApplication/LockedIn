import {afterEach,expect,it,vi} from "vitest";
import {discoveryRequest} from "./discovery.client";
import {currentDiscoveryValue,DiscoveryResource} from "./discovery-resource";
afterEach(()=>vi.unstubAllGlobals());
it("checks the authenticated owner envelope and includes the intended owner on mutations",async()=>{
  vi.stubGlobal("fetch",async(_url:string,init:RequestInit)=>new Response(JSON.stringify(new Headers(init.headers).get("X-Discovery-Owner")==="a"?{ownerId:"a",value:{saved:true}}:{error:"Wrong owner"}),{status:new Headers(init.headers).get("X-Discovery-Owner")==="a"?200:409}));
  expect(await discoveryRequest("a","/api/discovery/reflection",{method:"PUT",body:JSON.stringify({text:"Private",revision:0})})).toEqual({saved:true});
  vi.stubGlobal("fetch",async()=>new Response(JSON.stringify({ownerId:"b",value:{text:"Other account"}})));
  await expect(discoveryRequest("a","/api/discovery/reflection")).rejects.toThrow(/account/i);
});
it("aborts obsolete loads and refuses late previous-owner or previous-connection data",async()=>{
  const resource=new DiscoveryResource<string>(),values:string[]=[],errors:unknown[]=[];
  let resolveOld:(value:string)=>void=()=>{},oldSignal:AbortSignal|undefined;
  const old=resource.load("a","connection-1",signal=>{oldSignal=signal;return new Promise(resolve=>{resolveOld=resolve;});},value=>values.push(value),error=>errors.push(error));
  await resource.load("b","connection-2",async()=>"Current private text",value=>values.push(value),error=>errors.push(error));
  resolveOld("OLD PRIVATE TEXT");await old;
  expect(oldSignal?.aborted).toBe(true);expect(values).toEqual(["Current private text"]);expect(errors).toEqual([]);
  expect(currentDiscoveryValue("b","connection-2",{owner:"a",key:"connection-1",value:"Secret"})).toBeNull();
  expect(currentDiscoveryValue("b","connection-2",{owner:"b",key:"connection-2",value:"Mine"})).toBe("Mine");
  resource.dispose();
});
