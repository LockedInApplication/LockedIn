import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Home from "./page";

it("keeps signup, direct invitations, sign-in and app entry points in the editorial layout", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/href="\/signup"/g)).toHaveLength(2);
  expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>Join LockedIn<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/connections\?compose=invite"[^>]*>Invite someone<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
  expect(html).toMatch(/<a[^>]*href="\/journey"[^>]*>Open LockedIn<\/a>/);
  expect(html).toMatch(/<summary[^>]*aria-label="Navigation"/);
  expect(html).toContain('href="#main-content"');
  expect(html).toMatch(/<main id="main-content" tabindex="-1"/);
  for (const section of ["how-it-works", "trust"]) {
    expect(html).toContain(`href="#${section}"`);
    expect(html).toContain(`id="${section}"`);
  }
  expect(html).toContain('id="preview"');
  expect(html).not.toContain('href="#preview"');
});

it("renders all editorial content before JavaScript with no demo controls", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/data-home-reveal=""/g)).toHaveLength(7);
  expect(html).toContain("A good chat can");
  expect(html).toContain("A space for just you two.");
  expect(html).toMatch(/<img(?=[^>]*src="\/home\/editorial-coffee\.webp")(?=[^>]*loading="lazy")[^>]*>/);
  expect(html).not.toMatch(/<(?:form|button|input)\b/);
});

it("shows clearly labeled Discovery and Atlas examples with no interactive controls", () => {
  const html = renderToStaticMarkup(<Home />);
  const preview = html.match(/<section\b[^>]*id="app-preview"[^>]*>.*?<\/section>/)?.[0];
  expect(preview).toContain("fictional profile and a sample Atlas chapter");
  expect(preview).toContain('aria-labelledby="discovery-preview-caption"');
  expect(preview).toContain('aria-labelledby="atlas-preview-caption"');
  expect(preview).toContain("People nearby");
  expect(preview).toContain("A Sunday I’d happily repeat…");
  expect(preview).toContain("The Atlas of Us");
  expect(preview).toContain("A shared landmark");
  expect(preview).toContain("For us, “Support” means…");
  for (const landmark of ["Support", "Space", "Quality time"]) {
    expect(preview).toContain(`<strong>${landmark}</strong>`);
  }
  expect(preview).not.toContain("Roadmap");
  expect(preview).toMatch(/<img(?=[^>]*src="\/home\/discovery-preview-maya\.webp")(?=[^>]*loading="lazy")[^>]*>/);
  expect(preview).not.toMatch(/<(?:a|form|button|input)\b/);
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
