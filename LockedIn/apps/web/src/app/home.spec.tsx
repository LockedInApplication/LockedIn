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
