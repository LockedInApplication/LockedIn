import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./page";

it("gives the homepage one primary signup link and keeps invite, sign-in and app entry points", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/href="\/signup"/g)).toHaveLength(1);
  expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>Join LockedIn<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/connections\?compose=invite"[^>]*>Invite someone you know<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/journey"[^>]*>Open LockedIn<\/a>/);
  expect(html).toContain('href="#main-content"');
  expect(html).toMatch(/<main id="main-content" tabindex="-1"/);
  for (const section of ["how-it-works", "preview", "trust"]) {
    expect(html).toContain(`href="#${section}"`);
    expect(html).toContain(`id="${section}"`);
  }
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

it("loads a responsive, high-priority hero from local assets without reading decorative imagery aloud", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html).toContain('srcSet="/home/blue-hour-portrait.webp"');
  expect(html).toContain('/home/blue-hour-1024.webp 1024w, /home/blue-hour-1536.webp 1536w');
  const photo = html.match(/<img[^>]*src="\/home\/blue-hour-1536\.webp"[^>]*>/)?.[0];
  expect(photo).toContain('alt=""');
  expect(photo).toContain('loading="eager"');
  expect(photo).toMatch(/fetchpriority="high"/i);
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
