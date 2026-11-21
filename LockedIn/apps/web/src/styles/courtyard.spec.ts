import { fileURLToPath } from "node:url";
import { compile } from "sass";
import { expect, it } from "vitest";

function rootColor(css: string, name: string) {
  const value = css.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})\\b`, "i"))?.[1];
  expect(value, `missing color token ${name}`).toBeDefined();
  return value!.toLowerCase();
}

function contrast(a: string, b: string) {
  function luminance(color: string) {
    const channels = color.slice(1).match(/../g)!.map(pair => parseInt(pair, 16) / 255);
    return channels.reduce((total, channel, index) =>
      total + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const css = compile(fileURLToPath(new URL("./_globals.scss", import.meta.url))).css;
const home = compile(fileURLToPath(new URL("../app/page.module.scss", import.meta.url))).css;

it("uses the selected Courtyard canvas and contrast-safe text and buttons", () => {
  expect(rootColor(css, "cream")).toBe("#f1f2e8");
  expect(rootColor(css, "action")).toBe("#365848");
  expect(contrast(rootColor(css, "ink"), rootColor(css, "cream"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rootColor(css, "on-action"), rootColor(css, "action"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rootColor(css, "focus-ring"), rootColor(css, "paper"))).toBeGreaterThanOrEqual(3);
});

it("applies Figtree to controls and lets homepage headings inherit the same display font", () => {
  expect(css).toMatch(/--font-sans:\s*"Figtree"/);
  expect(css).toMatch(/--font-display:\s*var\(--font-sans\)/);
  expect(home).toMatch(/\.page h1,\s*\.page h2\s*\{[^}]*font-family: var\(--font-display\)/);
});

it("keeps the idle field outline visible against both the card and the page", () => {
  const outline = rootColor(css, "stone-300");
  for (const surface of ["paper", "cream"]) {
    expect(contrast(outline, rootColor(css, surface))).toBeGreaterThanOrEqual(3);
  }
});
