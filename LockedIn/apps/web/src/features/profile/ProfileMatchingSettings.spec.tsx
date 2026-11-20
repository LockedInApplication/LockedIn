import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import ProfileMatchingSettings from "./ProfileMatchingSettings";

const state = vi.hoisted(()=>({ value: null as unknown }));
vi.mock("@/features/discovery/use-discovery-resource",()=>({useDiscoveryResource:()=>state}));

it.each([
  { canDiscover: false, hasHistory: false, matching: { required: true, complete: true } },
  { canDiscover: false, hasHistory: false, hasSavedMatchingSettings: true },
])("allows settings management with saved data regardless of admission or flag state", capability => {
  state.value=capability;
  expect(renderToStaticMarkup(<ProfileMatchingSettings userId="owner" onOpen={()=>{}}/>)).toContain("Manage matching preferences");
});

it("does not put optional Discovery setup in settings for someone with no saved data",()=>{
  state.value={canDiscover:true,matching:{required:true,complete:false}};
  expect(renderToStaticMarkup(<ProfileMatchingSettings userId="owner" onOpen={()=>{}}/>)).toBe("");
});
