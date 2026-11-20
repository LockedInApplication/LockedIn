import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MatchingEditor } from "./DiscoveryMatchPreferences";
import { currentDiscoveryValue, DiscoveryResource } from "./discovery-resource";
import type { DiscoveryMatchPreferencesView } from "./discovery.types";

vi.mock("./DiscoveryShell", () => ({ useDiscovery: () => ({ userId: "viewer", busy: false, setBusy: () => {}, installMatching: () => {} }) }));

const settings: DiscoveryMatchPreferencesView = {
  required: true,
  settings: { birthDate: "1995-11-16", gender: "WOMAN", meetGenders: ["NONBINARY", "WOMAN"], minAge: 23, maxAge: 42, revision: "a1" },
};

it("starts with no implied settings and requires explicit setup", () => {
  const html = renderToStaticMarkup(<MatchingEditor initial={{ required: true, settings: null }} canEdit onSaved={()=>{}}/>);
  expect(html).toContain("Open to all genders");
  expect(html).toContain("Any adult age");
  expect(html).not.toContain('checked=""');
  expect(html).toContain('type="submit" disabled=""');
  expect(html).not.toContain("Remove matching setup");
});

it("offers removal without showing private fields when editing is unavailable", () => {
  const html = renderToStaticMarkup(<MatchingEditor initial={{ ...settings, required: false }} canEdit={false} onSaved={()=>{}}/>);
  expect(html).toContain("Remove matching setup");
  expect(html).not.toContain("Date of birth");
  expect(html).not.toContain("1995-11-16");
});

it("only offers adult ages and keeps the oldest age at or above the youngest", () => {
  const html = renderToStaticMarkup(<MatchingEditor initial={settings} canEdit onSaved={()=>{}}/>);
  const youngest = html.match(/Youngest age<select[^>]*>(.*?)<\/select>/)?.[1] ?? "";
  const oldest = html.match(/Oldest age<select[^>]*>(.*?)<\/select>/)?.[1] ?? "";
  const availableAges = (picker: string) => Array.from(picker.matchAll(/<option value="(\d+)"/g), match => Number(match[1]));
  expect(availableAges(youngest)).toEqual(Array.from({ length: 103 }, (_, index) => index + 18));
  expect(availableAges(oldest)).toEqual(Array.from({ length: 98 }, (_, index) => index + 23));
  expect(youngest).toContain('value="23" selected=""');
  expect(oldest).toContain('value="42" selected=""');
});

it("requests confirmation when enrolling again in the correction window", () => {
  const html = renderToStaticMarkup(<MatchingEditor initial={{ required: true, settings: null, requiresBirthDateConfirmation: true }} canEdit onSaved={()=>{}}/>);
  expect(html).toContain("Confirm this birthday (one correction every 30 days)");
});

it("discards a late settings read after changing account or installing a newer edit", async () => {
  const requests = new DiscoveryResource<DiscoveryMatchPreferencesView>();
  const captured: string[] = [];
  let resolveOld!: (value: DiscoveryMatchPreferencesView) => void;
  const old = requests.load("viewer", "matching:a1", () => new Promise(resolve => {resolveOld=resolve;}), value => captured.push(value.settings!.birthDate), () => {});
  const profileAfterSwitch: DiscoveryMatchPreferencesView = { required: true, settings: null };
  await requests.load("new-owner", "matching:setup", async()=>profileAfterSwitch, value=>captured.push(value.settings ? "private data" : "empty"), () => {});
  resolveOld(settings);
  await old;
  expect(captured).toEqual(["empty"]);
  const oldState = { owner: "new-owner", key: "matching:a1", value: settings };
  expect(currentDiscoveryValue("new-owner", "matching:a2", oldState)).toBeNull();
  expect(currentDiscoveryValue("viewer", "matching:a1", oldState)).toBeNull();
});
