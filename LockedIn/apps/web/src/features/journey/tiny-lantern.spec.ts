import { expect, it } from "vitest";
import { claimTinyLanternWelcome, tinyLanternTip } from "./tiny-lantern";

it("shows the welcome once for each account and shared space", () => {
  const values = new Map<string, string>();
  const storage = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
  expect(claimTinyLanternWelcome(storage, "u1", "r1")).toBe(true);
  expect(claimTinyLanternWelcome(storage, "u1", "r1")).toBe(false);
  expect(claimTinyLanternWelcome(storage, "u2", "r1")).toBe(true);
  expect(claimTinyLanternWelcome(storage, "u1", "r2")).toBe(true);
});

it("does not mix IDs containing separators", () => {
  const storage = () => ({
    getItem: (key: string) => key === saved ? "1" : null,
    setItem: (key: string) => { saved = key; },
  });
  let saved: string;
  expect(claimTinyLanternWelcome(storage, "a:b", "c")).toBe(true);
  expect(claimTinyLanternWelcome(storage, "a", "b:c")).toBe(true);
});

it("falls back to manual help when storage cannot be opened, read, or written", () => {
  const denied = () => { throw new Error("Storage unavailable"); };
  expect(claimTinyLanternWelcome(denied, "u", "r")).toBe(false);
  expect(claimTinyLanternWelcome(() => ({ getItem: denied, setItem: () => {} }), "u", "r")).toBe(false);
  expect(claimTinyLanternWelcome(() => ({ getItem: () => null, setItem: denied }), "u", "r")).toBe(false);
});

it("explains the optional date and private answers in the corresponding views", () => {
  expect(tinyLanternTip("roadmap")).toBe("Suggest an idea. You don’t have to pick a day yet.");
  expect(tinyLanternTip("conversations")).toBe("Answer privately. You decide what to share.");
  expect(tinyLanternTip("home")).not.toMatch(/locked in/i);
});
