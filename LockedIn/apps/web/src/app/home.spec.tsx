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
  for (const section of ["how-it-works", "trust"]) {
    expect(html).toContain(`href="#${section}"`);
    expect(html).toContain(`id="${section}"`);
  }
  expect(html).toContain('id="preview"');
  expect(html).not.toContain('href="#preview"');
});

it("shows both stories in the initial HTML without demo controls", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/<article[^>]+data-home-story=""/g)).toHaveLength(2);
  expect(html).toContain("What record are you looking for?");
  expect(html).toContain("Coffee this Saturday?");
  for (const photo of ["story-record-shop", "story-coffee-date"]) {
    expect(html).toMatch(new RegExp(`<img(?=[^>]*src="/home/${photo}\\.webp")(?=[^>]*loading="lazy")[^>]*>`));
  }
  expect(html).not.toMatch(/<(?:form|button|input)\b/);
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
