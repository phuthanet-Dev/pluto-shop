import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const adminPath = fileURLToPath(new URL("../app/admin/admin.css", import.meta.url));
const globals = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8").replace('@import "tailwindcss";', "");
const admin = existsSync(adminPath) ? readFileSync(adminPath, "utf8") : "";
const longName = "สินค้าทดสอบสำหรับผู้ดูแลพร้อมรายละเอียดตัวเลือกภาษาไทยที่ยาว";

// Synthetic HTML exercises current source CSS only, NOT server auth or React workflows.
function fixture() {
  return `<style>${globals}\n${admin}</style><main id="main-content"><div class="admin-workspace">
    <header class="admin-workspace-header"><strong>Phuto Shop · หลังบ้าน</strong><div><a href="#">ไปหน้าร้าน</a><a href="#">ออกจากระบบ</a></div></header>
    <nav class="admin-workspace-nav" aria-label="ส่วนงานผู้ดูแล"><button aria-pressed="true">สินค้า</button><button aria-pressed="false">การส่งมอบ</button></nav>
    <section class="admin-products-console"><div class="admin-form-heading"><h2>เพิ่มสินค้า</h2><button class="text-button">กลับไปรายการสินค้า</button></div>
      <form class="admin-product-form"><fieldset class="admin-form-fields"><div class="admin-form-layout is-multi"><div class="admin-form-main">
        <section class="admin-panel admin-configuration-card"><h3>รูปแบบสินค้า</h3><div class="admin-config-grid">
          <div class="admin-config-field"><div class="admin-custom-select-field"><span class="admin-field-label">โหมดตัวเลือก</span><button class="admin-select-trigger" type="button"><span class="admin-select-value"><strong>สินค้าหลายตัวเลือก</strong><span>(MULTI_OPTION)</span></span><svg class="admin-select-chevron" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg></button></div></div>
          <label class="admin-config-field"><span class="admin-field-label">กลุ่มตัวเลือก</span><input data-testid="option-group" value="synthetic-group-with-long-technical-identity" /><span class="admin-field-helper">ใช้รหัสเดิมเพื่อรักษาลิงก์ของกลุ่ม</span></label>
        </div></section>
        <fieldset class="admin-group-card-fields"><legend>ข้อมูลที่แสดงบนหน้าร้าน</legend><div class="admin-sidebar-heading"><h3>ข้อมูลที่แสดงบนหน้าร้าน</h3><span class="admin-shared-badge">ใช้ร่วมกันทุกตัวเลือก</span></div>
          <div class="admin-group-card-section"><label class="admin-localized-field"><span class="admin-language-badge">TH</span><span class="admin-language-name">ภาษาไทย</span><input value="${longName}" /></label><label class="admin-localized-field"><span class="admin-language-badge">EN</span><span class="admin-language-name">ภาษาอังกฤษ</span><input value="Synthetic product" /></label></div>
        </fieldset>
        <section class="admin-panel admin-options-panel"><h3>ตัวเลือกสินค้า</h3><fieldset class="admin-multi-child-card"><legend>ตัวเลือกที่ 1</legend><section class="admin-disclosure"><h3><button type="button" aria-expanded="true" aria-controls="child-fields">ตัวเลือกที่ 1 · ${longName} · 50.00 บาท</button></h3><div id="child-fields"><div class="admin-form-grid">
          <label>ชื่อ (ภาษาไทย)<input value="${longName}" /></label><label>ชื่อ (ภาษาอังกฤษ)<input value="Synthetic option" /></label>
          <label class="admin-form-wide">คำอธิบายสินค้า (ภาษาไทย)<textarea rows="4">รายละเอียดทดสอบ ไม่ใช่ข้อมูลจริง</textarea></label><label class="admin-form-wide">คำอธิบายสินค้า (ภาษาอังกฤษ)<textarea rows="4">Synthetic description</textarea></label>
          <div class="admin-custom-select-field" data-testid="delivery"><span class="admin-field-label">รูปแบบการส่งมอบ</span><button type="button" class="admin-select-trigger"><span class="admin-select-value"><strong>ส่งมอบทันที</strong><span>(INSTANT)</span></span></button></div><label data-testid="warranty">วันรับประกัน<input value="1" /></label>
          <label class="admin-form-wide">รหัส URL<input data-testid="last-field" value="synthetic-sku-long-id" /></label>
        </div></div></section></fieldset></section>
      </div></div></fieldset><div class="admin-form-actions"><button type="button" class="secondary-button">ยกเลิก</button><button type="submit" class="primary-button" disabled>บันทึกสินค้า</button></div></form>
      <div class="admin-table-wrap"><table class="admin-product-table"><caption>ตารางจัดการสินค้า</caption><thead><tr><th>สินค้า</th><th>ราคา</th><th>สต็อก</th><th>ส่งมอบ</th><th>ลำดับ</th><th>สถานะ</th><th>การทำงาน</th></tr></thead><tbody><tr><th scope="row"><strong>${longName}</strong><span>${"synthetic-slug-".repeat(9)}</span></th><td data-label="ราคา">50.00</td><td data-label="สต็อก">5</td><td data-label="ส่งมอบ">ทันที</td><td data-label="ลำดับ">1</td><td data-label="สถานะ"><span class="admin-status active">ใช้งาน</span></td><td class="admin-row-actions"><button class="text-button admin-icon-button">แก้ไข</button><button class="text-button admin-icon-button">แก้ไขข้อมูลกลุ่ม</button><button class="text-button admin-icon-button">เพิ่มตัวเลือก</button></td></tr></tbody></table></div>
    </section></div></main>`;
}

for (const width of [320, 390, 768, 1024, 1200, 1440]) {
  test(`source-CSS fixture: ordered, compact, contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(fixture());
    const metrics = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
      const control = document.querySelector(".admin-config-grid .admin-select-trigger")!;
      return {
        trigger: box(".admin-config-grid .admin-select-trigger"), group: box("[data-testid='option-group']"),
        delivery: box("[data-testid='delivery'] button"), warranty: box("[data-testid='warranty'] input"),
        shared: box(".admin-group-card-fields"), options: box(".admin-options-panel"),
        columns: getComputedStyle(document.querySelector(".admin-form-grid")!).gridTemplateColumns.split(" ").length,
        fontSize: getComputedStyle(control).fontSize,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        badControls: [...document.querySelectorAll(".admin-workspace button, .admin-workspace input")].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.height < 44 || rect.left < 0 || rect.right > innerWidth + 1;
        }).map((element) => element.textContent),
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.badControls).toEqual([]);
    expect(metrics.trigger.height).toBeLessThanOrEqual(60);
    expect(metrics.group.height).toBeLessThanOrEqual(60);
    expect(metrics.fontSize).toBe("16px");
    expect(metrics.shared.bottom).toBeLessThanOrEqual(metrics.options.top);
    expect(metrics.columns).toBe(width < 768 ? 1 : 2);
    if (width >= 768) {
      expect(metrics.trigger.right).toBeLessThanOrEqual(metrics.group.left);
      expect(metrics.delivery.right).toBeLessThanOrEqual(metrics.warranty.left);
    }
    const last = page.getByTestId("last-field");
    await last.focus();
    await last.scrollIntoViewIfNeeded();
    const fieldBox = (await last.boundingBox())!;
    const footerBox = (await page.locator(".admin-form-actions").boundingBox())!;
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(footerBox.y);
    await expect(page.getByRole("table", { name: "ตารางจัดการสินค้า" })).toBeVisible();
    await expect(page.getByRole("button", { name: "แก้ไข", exact: true })).toHaveCount(1);
    if (width < 768) {
      expect(await page.locator('td[data-label="ราคา"]').evaluate((cell) => getComputedStyle(cell, "::before").content)).toBe('"ราคา"');
    }
  });
}

test("source-CSS fixture: disabled states, focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // 1440x900 at 200% browser zoom has a 720x450 CSS-pixel viewport.
  await page.setViewportSize({ width: 720, height: 450 });
  await page.setContent(fixture());
  const disabled = page.getByRole("button", { name: "บันทึกสินค้า" });
  const state = await disabled.evaluate((button) => {
    const style = getComputedStyle(button);
    return { opacity: Number(style.opacity), background: style.backgroundColor, cursor: style.cursor, shadow: style.boxShadow, transition: style.transitionDuration };
  });
  expect(state.opacity).toBeLessThan(1);
  expect(state.background).not.toBe("rgb(173, 139, 255)");
  expect(state.cursor).toBe("not-allowed");
  expect(state.shadow).toBe("none");
  expect(state.transition).toBe("0s");
  await page.getByTestId("option-group").focus();
  expect(await page.getByTestId("option-group").evaluate((input) => getComputedStyle(input).outlineWidth)).toBe("2px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("source-CSS fixture: admin overrides do not alter an outside control", async ({ page }) => {
  await page.setContent(`<style>${globals}</style><button class="secondary-button">หน้าร้าน</button>`);
  const before = await page.locator("button").evaluate((button) => ({ color: getComputedStyle(button).color, font: getComputedStyle(button).fontSize, height: button.getBoundingClientRect().height }));
  await page.addStyleTag({ content: admin });
  expect(await page.locator("button").evaluate((button) => ({ color: getComputedStyle(button).color, font: getComputedStyle(button).fontSize, height: button.getBoundingClientRect().height }))).toEqual(before);
});
