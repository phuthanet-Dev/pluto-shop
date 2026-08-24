import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
const css = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

const fontFiles = [
  "LINESeedSans-W-Rg.woff2",
  "LINESeedSans-W-Bd.woff2",
  "LINESeedSans-W-He.woff2",
  "LINESeedSansTH-W-Rg.woff2",
  "LINESeedSansTH-W-Bd.woff2",
  "LINESeedSansTH-W-He.woff2",
];

describe("LINE Seed Sans web fonts", () => {
  it("ships the Latin and Thai WOFF2 faces used by the app", () => {
    for (const file of fontFiles) {
      expect(existsSync(resolve(webRoot, "public/fonts/line-seed", file))).toBe(true);
    }
  });

  it("registers both scripts and uses LINE Seed Sans as the body family", () => {
    expect(css).toContain('font-family: "LINE Seed Sans";');
    expect(css).toContain('url("/fonts/line-seed/LINESeedSans-W-Rg.woff2")');
    expect(css).toContain('url("/fonts/line-seed/LINESeedSansTH-W-Rg.woff2")');
    expect(css).toContain("unicode-range: U+0E00-0E7F;");
    expect(css).toContain('font-family: "LINE Seed Sans",');
  });
});
