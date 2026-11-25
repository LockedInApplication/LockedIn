import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compile } from "sass";
import { describe, expect, it } from "vitest";

const features = fileURLToPath(new URL("../../", import.meta.url));
const entrypoint = fileURLToPath(new URL("../../../app/journey/journey.module.scss", import.meta.url));

describe("Journey Sass extraction", () => {
  it("compiles the editorial cascade, including mobile and reduced-motion rules", () => {
    const result = compile(entrypoint);
    expect(createHash("sha256").update(result.css).digest("hex")).toBe(
      "c10c10556a2f4e40cdd5aaefd86458ce2ebb1bef674dcedead1ed0a4b428d8c5",
    );
    expect([...result.css.matchAll(/@media[^\{]+/g)].map((match) => match[0].trim())).toEqual([
      "@media (max-width: 900px)", "@media (max-width: 640px)",
      "@media (max-width: 900px)", "@media (max-width: 640px)",
      "@media (max-width: 879px)", "@media (min-width: 880px)",
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
      // This assertion owns the Journey Sass module, not unrelated feature modules.
      if (!/import\s+styles\s+from\s+["']@\/app\/journey\/journey\.module\.scss["']/.test(source)) continue;
      for (const match of source.matchAll(/styles\.([A-Za-z_]\w*)/g)) {
        expect(classes.has(match[1]), `${file}: ${match[1]}`).toBe(true);
      }
    }
  });
});
