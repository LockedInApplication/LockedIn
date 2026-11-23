import { fileURLToPath } from "node:url";
import { compile } from "sass";
import { expect, it } from "vitest";

function tokenColor(css: string, name: string): string {
  const value = css.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6}|var\\(--[a-z-]+\\))\\s*;`, "i"))?.[1];
  if (!value) throw new Error(`Missing color token ${name}`);
  return value.startsWith("var(") ? tokenColor(css, value.slice(6, -1)) : value.toLowerCase();
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
const member = compile(fileURLToPath(new URL("../features/journey/workspace-header.module.scss", import.meta.url))).css;

it("uses pure white for the public and signed-in light surfaces", () => {
  expect(tokenColor(css, "paper")).toBe("#ffffff");
  expect(tokenColor(css, "cream")).toBe("#ffffff");
  expect(tokenColor(home + css, "home-frost")).toBe("#ffffff");
  expect(tokenColor(member + css, "member-surface")).toBe("#ffffff");
  expect(tokenColor(home + css, "home-ink")).not.toBe("#ffffff");
});

it("uses the homepage neutrals throughout and preserves contrast for Courtyard accents", () => {
  expect(tokenColor(css, "cream")).toBe(tokenColor(css, "brand-canvas"));
  expect(tokenColor(css, "paper")).toBe(tokenColor(css, "brand-paper"));
  expect(contrast(tokenColor(css, "ink"), tokenColor(css, "cream"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokenColor(css, "on-action"), tokenColor(css, "action"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokenColor(css, "focus-ring"), tokenColor(css, "paper"))).toBeGreaterThanOrEqual(3);
  expect(contrast(tokenColor(css, "forest"), tokenColor(css, "stone-50"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokenColor(css, "accent"), tokenColor(css, "cream"))).toBeGreaterThanOrEqual(4.5);
});

it("shares neutral grays for secondary text, dividers, and outlines", () => {
  for (const name of ["brand-muted", "brand-muted-on-dark", "brand-rule", "brand-outline"]) {
    expect(tokenColor(css, name)).toMatch(/^#([0-9a-f]{2})\1\1$/);
  }
  for (const [stylesheet, name, shared] of [
    [home, "home-muted", "brand-muted"],
    [home, "home-rule", "brand-rule"],
    [member, "member-muted", "brand-muted"],
    [member, "member-divider", "brand-rule"],
    [css, "stone-100", "brand-rule"],
    [css, "stone-300", "brand-outline"],
    [css, "stone-500", "brand-muted"],
  ]) {
    expect(tokenColor(stylesheet + css, name)).toBe(tokenColor(css, shared));
  }
  expect(contrast(tokenColor(css, "brand-muted"), tokenColor(css, "paper"))).toBeGreaterThanOrEqual(4.5);
});

it("keeps the homepage's local Instrument fonts separate from the app's typography", () => {
  expect(css).toMatch(/--font-sans:\s*"Roboto"/);
  expect(css).toMatch(/--font-display:\s*var\(--font-sans\)/);
  expect(css).toMatch(/--font-serif:\s*"Source Serif 4"/);
  expect(home).toMatch(/\.page\s*\{[^}]*font-family: var\(--home-heading\)/);
  expect(home).toContain('--home-heading: "Instrument Sans", var(--font-sans)');
  expect(home).toContain('--home-italic: "Instrument Serif", var(--font-serif)');
  expect(css).toContain("/fonts/roboto-latin-400-700.woff2");
  expect(css).toContain("/fonts/source-serif-4-latin-500-700.woff2");
  expect(css).not.toContain("Instrument Sans");
  expect(home).toContain("/fonts/instrument-sans-latin-400-700.woff2");
  expect(home).toContain("/fonts/instrument-serif-latin-italic.woff2");
});

it("animates the editorial sections only when motion is allowed", () => {
  const allowed = home.split("@media (prefers-reduced-motion: no-preference)")[1]?.split("@media")[0];
  for (const name of ["editorialSlide", "settle"]) {
    expect(allowed).toContain(`animation: ${name}`);
    expect(home.match(new RegExp(`animation:\\s*${name}\\b`, "g"))).toHaveLength(1);
  }
});

it("keeps the homepage CTA and section copy contrast-safe", () => {
  for (const color of ["home-action", "home-action-hover"]) {
    expect(contrast("#ffffff", tokenColor(home + css, color))).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(tokenColor(home + css, "home-muted"), tokenColor(home + css, "home-frost"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokenColor(home + css, "home-accent"), tokenColor(home + css, "home-frost"))).toBeGreaterThanOrEqual(4.5);
});

it("keeps the idle field outline visible against both the card and the page", () => {
  const outline = tokenColor(css, "stone-300");
  for (const surface of ["paper", "cream"]) {
    expect(contrast(outline, tokenColor(css, surface))).toBeGreaterThanOrEqual(3);
  }
});
