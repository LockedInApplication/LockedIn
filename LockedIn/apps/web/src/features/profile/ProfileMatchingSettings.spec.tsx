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
  const markup = renderToStaticMarkup(<ProfileMatchingSettings userId="owner" onOpen={()=>{}}/>);
  expect(markup).toMatch(/^<li><button type="button"/);
  const titleId = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
  const descriptionId = markup.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(titleId).toBeTruthy();
  expect(descriptionId).toBeTruthy();
  expect(markup).toContain(`id="${titleId}">Manage matching preferences</span>`);
  expect(markup).toContain(`id="${descriptionId}">Review who you’re open to meeting.</span>`);
  expect(markup).toContain('<svg aria-hidden="true"');
});

it("does not put optional Discovery setup in settings for someone with no saved data",()=>{
  state.value={canDiscover:true,matching:{required:true,complete:false}};
  expect(renderToStaticMarkup(<ProfileMatchingSettings userId="owner" onOpen={()=>{}}/>)).toBe("");
});
