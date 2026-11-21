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

it("keeps Courtyard typography elsewhere and uses locally served Roboto on the homepage", () => {
  expect(css).toMatch(/--font-sans:\s*"Figtree"/);
  expect(css).toMatch(/--font-display:\s*var\(--font-sans\)/);
  expect(home).toMatch(/\.page\s*\{[^}]*font-family: "Roboto"/);
  expect(home).toContain('/fonts/roboto-latin-400-700.woff2');
  expect(home).not.toContain("Barlow Condensed");
});

it("animates the story cards only when motion is allowed", () => {
  expect(home.match(/animation:\s*storySlide\b/g)).toHaveLength(1);
  expect(home).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^}]*\}\s*\.storyCard\.arrive\s*\{[^}]*animation: storySlide/);
});

it("keeps the homepage CTA and section copy contrast-safe", () => {
  for (const color of ["home-action", "home-action-hover"]) {
    expect(contrast("#ffffff", rootColor(home, color))).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(rootColor(home, "home-muted"), rootColor(home, "home-frost"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rootColor(home, "home-ice"), rootColor(home, "home-night"))).toBeGreaterThanOrEqual(4.5);
});

it("keeps the idle field outline visible against both the card and the page", () => {
  const outline = rootColor(css, "stone-300");
  for (const surface of ["paper", "cream"]) {
    expect(contrast(outline, rootColor(css, surface))).toBeGreaterThanOrEqual(3);
  }
});
