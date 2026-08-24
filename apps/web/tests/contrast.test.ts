import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string): string {
  const selectorStart = css.indexOf(selector);
  if (selectorStart === -1) throw new Error(`Missing CSS selector: ${selector}`);

  const bodyStart = css.indexOf("{", selectorStart);
  const bodyEnd = css.indexOf("}", bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error(`Incomplete CSS rule: ${selector}`);
  }

  return css.slice(bodyStart + 1, bodyEnd);
}

function resolveColor(value: string): string {
  const variable = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!variable) return value;

  const declaration = ruleBody(":root").match(
    new RegExp(`^\\s*${variable}:\\s*(#[0-9a-f]{6});`, "im"),
  );
  if (!declaration) throw new Error(`Missing CSS variable: ${variable}`);
  return declaration[1];
}

function ruleColor(selector: string): string {
  const declaration = ruleBody(selector).match(
    /^\s*color:\s*(#[0-9a-f]{6}|var\(--[\w-]+\));/im,
  );
  if (!declaration) throw new Error(`Missing text color: ${selector}`);
  return resolveColor(declaration[1]);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("product card titles", () => {
  it("reserve two lines for exact source names in the four-column grid", () => {
    const rowRule = ruleBody(".card-title-row {");
    const titleRule = ruleBody(".card-title-row h2");
    expect(rowRule).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(titleRule).toContain("-webkit-line-clamp: 2");
    expect(titleRule).toContain("white-space: normal");
  });
});

describe("small text contrast", () => {
  it("meets WCAG AA on each actual dark surface", () => {
    const textSurfaces = [
      [".breadcrumb", "#07070a"],
      [".search-shell input::placeholder", "#0b0b10"],
      [".field-hint,", "#0d0d12"],
      [".price-range-note", "#07070a"],
      [".card-description", "#0d0d12"],
      [".card-meta {", "#0d0d12"],
      [".site-footer", "#07070a"],
    ] as const;

    for (const [selector, background] of textSurfaces) {
      expect(
        contrastRatio(ruleColor(selector), background),
        `${selector} contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
