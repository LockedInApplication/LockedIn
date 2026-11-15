import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "sass";
import { describe, expect, it } from "vitest";

const features = fileURLToPath(new URL("../../", import.meta.url));
const entrypoint = fileURLToPath(new URL("../../../app/journey/journey.module.scss", import.meta.url));

describe("Journey Sass extraction", () => {
  it("compiles exactly the baseline cascade, including mobile and reduced-motion rules", () => {
    const result = compile(entrypoint);
    expect(createHash("sha256").update(result.css).digest("hex")).toBe(
      "7d1813255b7a546593d709d9c769f357ff45d72978674f1b79f99653a43bfe35",
    );
    expect([...result.css.matchAll(/@media[^\{]+/g)].map((match) => match[0].trim())).toEqual([
      "@media (max-width: 900px)", "@media (max-width: 640px)",
      "@media (max-width: 900px)", "@media (max-width: 640px)",
      "@media (max-width: 900px)", "@media (max-width: 700px)",
      "@media (prefers-reduced-motion: reduce)",
      "@media (max-width: 860px)", "@media (max-width: 650px)",
      "@media (prefers-reduced-motion: reduce)",
    ]);
  });

  it("loads each feature-owned partial into the same compiled module", () => {
    const loaded = compile(entrypoint).loadedUrls.map((url) => fileURLToPath(url));
    for (const [feature, partial] of [
      ["journey", "journey-shell"], ["invitations", "invitations"],
      ["conversations", "conversations"], ["check-ins", "check-ins"],
      ["atlas", "atlas"], ["roadmap", "roadmap"],
    ]) {
      expect(loaded).toContain(`${features}${feature}/styles/_${partial}.scss`);
    }
  });

  it("includes every statically referenced Journey class", () => {
    const css = compile(entrypoint).css;
    const classes = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
    const files = readdirSync(features, { recursive: true }).filter((file) => String(file).endsWith(".tsx"));
    for (const file of files) {
      const source = readFileSync(`${features}${file}`, "utf8");
      for (const match of source.matchAll(/styles\.([A-Za-z_]\w*)/g)) {
        expect(classes.has(match[1]), `${file}: ${match[1]}`).toBe(true);
      }
    }
  });
});
