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
    expect(
      existsSync(resolve(webRoot, "public/icons/icons8-cart.gif")),
    ).toBe(true);
  });

  it("uses the local cart icon instead of an emoji or remote runtime URL", () => {
    expect(css).toContain('url("/icons/icons8-shopping-cart.png")');
    expect(css).toContain('url("/icons/icons8-cart.gif")');
    expect(css).toContain(".cart-trigger:hover .cart-icon");
    expect(css).toContain(".cart-button:not(:disabled):hover .cart-icon");
    expect(component).toContain('className="cart-icon"');
    expect(component).not.toContain("🛒");
    expect(component).not.toContain("img.icons8.com");
  });

  it("stores the animated hover GIF with transparency on every frame", () => {
    const gif = readFileSync(resolve(webRoot, "public/icons/icons8-cart.gif"));
    const gceOffsets: number[] = [];

    for (let index = 0; index < gif.length - 3; index += 1) {
      if (gif[index] === 0x21 && gif[index + 1] === 0xf9 && gif[index + 2] === 0x04) {
        gceOffsets.push(index);
      }
    }

    expect(gceOffsets.length).toBeGreaterThan(1);
    for (const offset of gceOffsets) {
      expect(gif[offset + 3] & 1).toBe(1);
    }
  });
});
