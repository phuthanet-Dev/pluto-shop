import assert from "node:assert/strict";

const webBaseUrl = process.env.PLUTO_WEB_BASE_URL ?? "http://127.0.0.1:3000";
const apiBaseUrl = process.env.PLUTO_API_BASE_URL ?? webBaseUrl;

// Extracted row-major from the user-provided read-only reference screenshot.
// Tuple: exact English name, source USD, bundle flag, shown stock/bundle count.
const expectedCatalog = [
  ["Creator Launch Kit", 29, true, 4],
  ["Aurora UI Component Library", 34, false, 88],
  ["Social Post Template Collection", 18, true, 6],
  ["Minimal Brand Guidelines", 24, false, 70],
  ["Editorial Presentation Deck", 16, true, 3],
  ["Invoice & Quote Template Bundle", 9, false, 200],
  ["Freelance Project Starter Pack", 14, true, 5],
  ["Podcast Cover Art Templates", 12, false, 82],
  ["Motion Title Graphics Pack", 28, true, 4],
  ["Cinematic Color Presets", 19, false, 140],
  ["Abstract 3D Shapes Collection", 22, true, 3],
  ["Essential Interface Icon Set", 15, false, 180],
  ["Modern Resume & Portfolio Kit", 13, true, 4],
  ["Daily Focus Planner", 7, false, 230],
  ["Travel Journal Page Bundle", 8, true, 3],
  ["Recipe Book Layout Template", 18, false, 76],
  ["Personal Budget Spreadsheet", 11, false, 210],
  ["Small Business Finance Dashboard", 27, true, 2],
  ["Project Planning Workspace", 21, false, 99],
  ["Online Course Workbook", 17, true, 3],
  ["Website Wireframe Library", 32, false, 49],
  ["Email Campaign Template Set", 14, true, 5],
  ["Video Thumbnail Design Pack", 12, false, 160],
  ["Sound Effects Starter Library", 23, true, 4],
  ["Ambient Audio Loop Collection", 16, false, 58],
  ["Lifestyle Stock Photo Bundle", 36, true, 6],
  ["Handwritten Font Pair", 19, false, 125],
  ["Editorial Serif Display Font", 25, true, 2],
  ["Monoline Illustration Kit", 20, false, 77],
  ["Gradient Background Collection", 10, true, 8],
  ["E-commerce Product Mockups", 31, false, 52],
  ["Packaging Mockup Essentials", 26, true, 4],
  ["Mobile App Showcase Scenes", 24, false, 80],
  ["Creative Business Card Pack", 9, true, 5],
  ["Newsletter Layout System", 18, false, 90],
  ["Digital Product Launch Checklist", 6, false, 240],
];

assert.equal(expectedCatalog.length, 36, "The source catalog fixture must contain 36 entries");

async function fetchJson(url, expectedStatus = 200) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  assert.equal(response.status, expectedStatus, `${url} returned ${response.status}`);
  return { body: await response.json(), contentType: response.headers.get("content-type") ?? "" };
}

const catalogUrl = new URL("/api/v1/products", apiBaseUrl);
const { body: catalog } = await fetchJson(catalogUrl);
assert.equal(catalog.total, expectedCatalog.length);
assert.equal(catalog.items.length, expectedCatalog.length);
assert.deepEqual(catalog.priceRange, {
  minMinor: Math.min(...expectedCatalog.map((entry) => entry[1] * 35 * 100)),
  maxMinor: Math.max(...expectedCatalog.map((entry) => entry[1] * 35 * 100)),
  currency: "THB",
});

for (const [index, expected] of expectedCatalog.entries()) {
  const [nameEn, usd, isBundle, shownCount] = expected;
  const item = catalog.items[index];
  assert.ok(item, `Missing catalog item ${index + 1}`);
  assert.equal(item.catalogOrder, index + 1, `Catalog order mismatch at ${index + 1}`);
  assert.equal(item.nameEn, nameEn, `English name mismatch at ${index + 1}`);
  assert.equal(item.priceMinor, usd * 35 * 100, `THB price mismatch at ${index + 1}`);
  assert.equal(item.currency, "THB");
  assert.equal(item.instantDelivery, true);
  assert.match(item.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  assert.ok(item.nameTh.trim().length > 0, `Missing Thai name at ${index + 1}`);
  assert.ok(item.descriptionTh.trim().length > 0, `Missing Thai description at ${index + 1}`);
  assert.ok(item.descriptionEn.trim().length > 0, `Missing English description at ${index + 1}`);

  if (isBundle) {
    assert.equal(item.stockQuantity, 1, `Bundle availability sentinel mismatch at ${index + 1}`);
  } else {
    assert.equal(item.stockQuantity, shownCount, `Stock mismatch at ${index + 1}`);
  }
}

const auroraUrl = new URL("/api/v1/products", apiBaseUrl);
auroraUrl.searchParams.set("q", "Aurora");
const { body: aurora } = await fetchJson(auroraUrl);
assert.equal(aurora.total, 1);
assert.equal(aurora.items[0]?.nameEn, "Aurora UI Component Library");

const lowestPriceUrl = new URL("/api/v1/products", apiBaseUrl);
lowestPriceUrl.searchParams.set("maxPriceMinor", "21000");
const { body: lowestPrice } = await fetchJson(lowestPriceUrl);
assert.equal(lowestPrice.total, 1);
assert.equal(lowestPrice.items[0]?.nameEn, "Digital Product Launch Checklist");

for (const [inStock, expectedTotal] of [["true", 36], ["false", 0]]) {
  const stockUrl = new URL("/api/v1/products", apiBaseUrl);
  stockUrl.searchParams.set("inStock", inStock);
  const { body } = await fetchJson(stockUrl);
  assert.equal(body.total, expectedTotal, `inStock=${inStock} mismatch`);
}

const invalidUrl = new URL("/api/v1/products", apiBaseUrl);
invalidUrl.searchParams.set("maxPriceMinor", "-1");
const invalid = await fetchJson(invalidUrl, 400);
assert.match(invalid.contentType, /^application\/problem\+json(?:;|$)/u);
assert.equal(invalid.body.status, 400);

const proxiedUrl = new URL("/api/v1/products", webBaseUrl);
const { body: proxied } = await fetchJson(proxiedUrl);
assert.equal(proxied.total, 36, "Next.js same-origin API proxy did not return the real catalog");

console.log("Verified the exact 36-item source catalog, filters, Problem Details, and same-origin proxy.");
