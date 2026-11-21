import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./page";

it("keeps the public journey and signup entry points alongside the demo", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('href="/journey"');
  expect(html).toContain('href="/signup"');
  expect(html).toContain('href="/login"');
  for (const section of ["how-it-works", "preview", "trust"]) {
    expect(html).toContain(`href="#${section}"`);
    expect(html).toContain(`id="${section}"`);
  }
  expect(html).toMatch(/src="\/lockedin-coffee-hello\.webp"/);
});

it("renders a labeled, private-by-design demo with no submission form", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/type="radio"/g)).toHaveLength(3);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toContain("What sounds like you?");
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("Where would we grab coffee first?");
  expect(html).toContain("Nothing is sent or saved.");
  expect(html).not.toContain("<form");
});

it("offers a native control for pausing homepage motion", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*aria-label="Pause homepage motion"/);
});

it("gives the footer privacy link a focusable destination with a matching label", () => {
  const html = renderToStaticMarkup(<Home />);
  const footer = html.match(/<footer\b[^>]*>(.*?)<\/footer>/)?.[1];
  const target = footer?.match(/<a\b[^>]*href="#([^"]+)"[^>]*>Privacy &amp; choice<\/a>/)?.[1];
  expect(target).toBe("trust");
  const section = html.match(/<section\b[^>]*id="trust"[^>]*>.*?<\/section>/)?.[0];
  expect(section).toMatch(/^<section\b[^>]*tabindex="-1"/);
  expect(section).toContain("Privacy &amp; choice");
});
