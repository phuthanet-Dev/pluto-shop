import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
const css = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");
const component = readFileSync(resolve(webRoot, "components/marketplace.tsx"), "utf8");

describe("Icons8 shopping cart asset", () => {
  it("ships the requested cart icon locally", () => {
    expect(
      existsSync(resolve(webRoot, "public/icons/icons8-shopping-cart.png")),
    ).toBe(true);
  });

  it("uses the local cart icon instead of an emoji or remote runtime URL", () => {
    expect(css).toContain('url("/icons/icons8-shopping-cart.png")');
    expect(component).toContain('className="cart-icon"');
    expect(component).not.toContain("🛒");
    expect(component).not.toContain("img.icons8.com");
  });
});
