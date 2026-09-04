import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const styles = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
).replace('@import "tailwindcss";', "");

function formFixture() {
  return `
    <style>${styles}</style>
    <main id="main-content" class="admin-page">
      <form class="admin-product-form">
        <fieldset class="admin-form-fields">
          <div class="admin-form-layout">
            <div class="admin-form-main">
              <section class="admin-panel admin-options-panel">
                <fieldset class="admin-multi-child-card">
                  <legend>รายการย่อยที่ 1</legend>
                  <div class="admin-form-grid">
                    <div class="admin-custom-select-field">
                      <span class="admin-field-label">โหมดตัวเลือก</span>
                      <button class="admin-select-trigger" type="button">
                        <span class="admin-select-value"><strong>สินค้าหลายตัวเลือก</strong><span>(MULTI_OPTION)</span></span>
                        <svg class="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
                      </button>
                    </div>
                    <label class="admin-form-wide">
                      กลุ่มตัวเลือก
                      <input value="gmail" readonly />
                    </label>
                    <label>
                      รายละเอียดตัวเลือก
                      <textarea rows="6">ข้อความรายละเอียดที่ทำให้ grid row สูง</textarea>
                    </label>
                  </div>
                </fieldset>
              </section>
            </div>
            <aside class="admin-form-sidebar">
              <fieldset class="admin-multi-child-card admin-group-card-fields">
                <legend>ข้อมูลบน Product Card</legend>
                <p class="admin-form-help">กรอกครั้งเดียวแล้วใช้เป็นชื่อและคำโปรยบน product card ของทุกตัวเลือกในกลุ่ม</p>
                <label>ชื่อบน product card (ภาษาไทย)<input value="Gmail" readonly /></label>
                <label>ชื่อบน product card (ภาษาอังกฤษ)<input value="Gmail" readonly /></label>
              </fieldset>
            </aside>
          </div>
        </fieldset>
      </form>
    </main>
  `;
}

function premiumFormFixture() {
  return `
    <style>${styles}</style>
    <main id="main-content" class="admin-page">
      <section class="admin-products-console">
      <form class="admin-product-form">
        <div class="admin-form-layout">
          <div class="admin-form-main">
            <section class="admin-panel admin-configuration-card">
              <div class="admin-config-grid">
                <div class="admin-config-field"><span class="admin-field-label">โหมดตัวเลือก</span><button class="admin-select-trigger" type="button">MULTI_OPTION</button></div>
                <label class="admin-config-field"><span class="admin-field-label">กลุ่มตัวเลือก</span><input value="gmail" readonly /><span class="admin-field-helper">ชื่อสำหรับใช้จัดกลุ่มตัวเลือกสินค้า</span></label>
              </div>
            </section>
            <section class="admin-panel admin-options-panel">
              <div class="admin-options-empty-state">
                <strong>ยังไม่มีรายการตัวเลือก</strong>
                <p>เพิ่มตัวเลือกสินค้าเพื่อให้ลูกค้าเลือกจาก Product Card</p>
              </div>
            </section>
          </div>
          <aside class="admin-form-sidebar">
            <fieldset class="admin-multi-child-card admin-group-card-fields">
              <legend>ข้อมูลร่วมของกลุ่ม</legend>
              <p class="admin-form-help">ข้อมูลนี้จะถูกใช้ร่วมกับทุกตัวเลือกในกลุ่ม</p>
              <label>ชื่อบน product card<input value="Gmail" readonly /></label>
            </fieldset>
          </aside>
        </div>
        <div class="admin-form-actions"><button class="secondary-button" type="button" disabled>ยกเลิก</button><button class="primary-button" type="submit" disabled>บันทึก</button></div>
      </form>
      </section>
    </main>
  `;
}

function compactControlFixture() {
  return `
    <style>${styles}</style>
    <main id="main-content" class="admin-page">
      <section class="admin-products-console">
        <form class="admin-product-form">
          <fieldset class="admin-form-fields">
            <div class="admin-form-layout is-multi">
              <div class="admin-form-main">
                <section class="admin-panel admin-configuration-card">
                  <div class="admin-config-grid">
                    <div class="admin-config-field">
                      <div class="admin-custom-select-field">
                        <span class="admin-field-label">โหมดตัวเลือก</span>
                        <button class="admin-select-trigger" type="button">
                          <span class="admin-select-value"><strong>สินค้าหลายตัวเลือก</strong><span>(MULTI_OPTION)</span></span>
                          <svg class="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
                        </button>
                      </div>
                    </div>
                    <label class="admin-config-field">
                      <span class="admin-field-label">กลุ่มตัวเลือก</span>
                      <input data-testid="option-group" value="gmail" readonly />
                    </label>
                  </div>
                </section>
                <section class="admin-panel admin-options-panel">
                  <fieldset class="admin-multi-child-card">
                    <legend>รายการย่อยที่ 1</legend>
                    <div class="admin-form-grid">
                      <label>รหัส URL<input value="gmail-old" readonly /></label>
                      <label class="admin-form-wide">คำอธิบายสินค้า (ภาษาไทย)<textarea rows="4">Gmail [Old]</textarea></label>
                      <label class="admin-form-wide">คำอธิบายสินค้า (ภาษาอังกฤษ)<textarea rows="4">Gmail [Old]</textarea></label>
                      <label>ชื่อ option (ภาษาไทย)<input value="Gmail [Old]" readonly /></label>
                      <label>ชื่อ option (ภาษาอังกฤษ)<input value="Gmail [Old]" readonly /></label>
                      <label>ราคา (บาท)<input value="50.00" readonly /></label>
                      <label>จำนวนสต็อก<input value="0" readonly /></label>
                      <div class="admin-custom-select-field" data-testid="delivery-field">
                        <span class="admin-field-label">รูปแบบการส่งมอบ</span>
                        <button class="admin-select-trigger" type="button">
                          <span class="admin-select-value"><strong>ส่งมอบทันที</strong><span>(INSTANT)</span></span>
                          <svg class="admin-select-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
                        </button>
                      </div>
                      <label data-testid="warranty-field">วันรับประกัน<input value="1" readonly /></label>
                      <label>เกณฑ์เตือนสต็อก<input value="5" readonly /></label>
                      <label>ลำดับแสดงผล<input value="2" readonly /></label>
                      <div class="admin-custom-select-field">
                        <span class="admin-field-label">สถานะสินค้า</span>
                        <button class="admin-select-trigger" type="button">แสดงสินค้า (ACTIVE)</button>
                      </div>
                    </div>
                  </fieldset>
                </section>
              </div>
              <aside class="admin-form-sidebar">
                <fieldset class="admin-group-card-fields">
                  <legend>ข้อมูลบน Product Card</legend>
                  <label>ชื่อบน product card<input value="Gmail" readonly /></label>
                </fieldset>
              </aside>
            </div>
          </fieldset>
        </form>
      </section>
    </main>
  `;
}

test("keeps child-grid controls compact beside the shared card", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, desktop: true },
    { width: 390, height: 844, desktop: false },
  ]) {
    await page.setViewportSize(viewport);
    await page.setContent(formFixture());

    const metrics = await page.locator(".admin-form-grid").evaluate((grid) => {
      const trigger = grid.querySelector<HTMLElement>(".admin-select-trigger");
      const optionGroup = grid.querySelector<HTMLElement>(".admin-form-wide input");
      const groupCard = grid.ownerDocument.querySelector<HTMLElement>(".admin-form-sidebar .admin-group-card-fields");
      if (!trigger || !optionGroup || !groupCard) throw new Error("form fixture is incomplete");

      const triggerBox = trigger.getBoundingClientRect();
      const optionGroupBox = optionGroup.getBoundingClientRect();
      return {
        triggerHeight: triggerBox.height,
        optionGroupHeight: optionGroupBox.height,
        groupCardHeight: groupCard.getBoundingClientRect().height,
        triggerTop: triggerBox.top,
        optionGroupTop: optionGroupBox.top,
        gridScrollWidth: grid.scrollWidth,
        gridClientWidth: grid.clientWidth,
      };
    });

    expect(metrics.triggerHeight, `trigger height at ${viewport.width}px`).toBeLessThanOrEqual(60);
    expect(metrics.optionGroupHeight, `input height at ${viewport.width}px`).toBeLessThanOrEqual(60);
    expect(metrics.groupCardHeight, `shared card fixture at ${viewport.width}px`).toBeGreaterThan(60);
    expect(metrics.gridScrollWidth, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(metrics.gridClientWidth);
    if (viewport.desktop) {
      expect(Math.abs(metrics.triggerTop - metrics.optionGroupTop)).toBeLessThanOrEqual(1);
    }
  }
});

test("keeps adjacent admin controls inside their grid tracks", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1200, height: 900 },
    { width: 1024, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.setContent(compactControlFixture());

    const metrics = await page.locator(".admin-product-form").evaluate((form) => {
      const selection = form.querySelector<HTMLElement>(".admin-config-grid .admin-select-trigger");
      const optionGroup = form.querySelector<HTMLElement>("[data-testid='option-group']");
      const delivery = form.querySelector<HTMLElement>("[data-testid='delivery-field'] .admin-select-trigger");
      const warranty = form.querySelector<HTMLElement>("[data-testid='warranty-field'] input");
      if (!selection || !optionGroup || !delivery || !warranty) throw new Error("compact control fixture is incomplete");

      const selectionBox = selection.getBoundingClientRect();
      const optionGroupBox = optionGroup.getBoundingClientRect();
      const deliveryBox = delivery.getBoundingClientRect();
      const warrantyBox = warranty.getBoundingClientRect();
      return {
        selectionRight: selectionBox.right,
        optionGroupLeft: optionGroupBox.left,
        deliveryRight: deliveryBox.right,
        warrantyLeft: warrantyBox.left,
        gridOverflow: Array.from(form.querySelectorAll<HTMLElement>(".admin-form-grid, .admin-config-grid"))
          .some((grid) => grid.scrollWidth > grid.clientWidth),
      };
    });

    expect(metrics.selectionRight, `selection control overlap at ${viewport.width}px`).toBeLessThanOrEqual(metrics.optionGroupLeft + 1);
    expect(metrics.deliveryRight, `delivery control overlap at ${viewport.width}px`).toBeLessThanOrEqual(metrics.warrantyLeft + 1);
    expect(metrics.gridOverflow, `grid overflow at ${viewport.width}px`).toBe(false);
  }
});

test("composes the premium group form without a large center gap", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900, desktop: true },
    { width: 1200, height: 900, desktop: true },
    { width: 1024, height: 900, desktop: false },
    { width: 390, height: 844, desktop: false },
  ]) {
    await page.setViewportSize(viewport);
    await page.setContent(premiumFormFixture());

    const metrics = await page.locator(".admin-product-form").evaluate((form) => {
      const layout = form.querySelector<HTMLElement>(".admin-form-layout");
      const main = form.querySelector<HTMLElement>(".admin-form-main");
      const sidebar = form.querySelector<HTMLElement>(".admin-form-sidebar");
      const options = form.querySelector<HTMLElement>(".admin-options-panel");
      const config = form.querySelector<HTMLElement>(".admin-config-grid");
      const actions = form.querySelector<HTMLElement>(".admin-form-actions");
      if (!layout || !main || !sidebar || !options || !config || !actions) throw new Error("premium form fixture is incomplete");

      const layoutBox = layout.getBoundingClientRect();
      const mainBox = main.getBoundingClientRect();
      const sidebarBox = sidebar.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      return {
        columns: getComputedStyle(layout).gridTemplateColumns,
        gap: getComputedStyle(layout).columnGap,
        mainWidth: mainBox.width,
        sidebarWidth: sidebarBox.width,
        mainBottom: mainBox.bottom,
        layoutTop: layoutBox.top,
        sidebarTop: sidebarBox.top,
        optionsHeight: options.getBoundingClientRect().height,
        configScrollWidth: config.scrollWidth,
        configClientWidth: config.clientWidth,
        layoutBottom: layoutBox.bottom,
        actionsTop: actionsBox.top,
      };
    });

    expect(metrics.optionsHeight, `option list height at ${viewport.width}px`).toBeGreaterThanOrEqual(220);
    expect(metrics.actionsTop, `actions follow content at ${viewport.width}px`).toBeGreaterThanOrEqual(metrics.layoutBottom - 1);
    if (viewport.desktop) {
      expect(metrics.columns.split(" ")).toHaveLength(2);
      expect(metrics.gap).toBe("24px");
      expect(metrics.mainWidth).toBeGreaterThan(metrics.sidebarWidth);
      expect(metrics.sidebarWidth).toBeGreaterThanOrEqual(360);
      expect(metrics.sidebarWidth).toBeLessThanOrEqual(400);
      expect(Math.abs(metrics.sidebarTop - metrics.layoutTop)).toBeLessThanOrEqual(1);
      expect(metrics.configScrollWidth, `configuration containment at ${viewport.width}px`).toBeLessThanOrEqual(metrics.configClientWidth);
    } else {
      expect(metrics.columns.split(" ")).toHaveLength(1);
      expect(metrics.sidebarTop).toBeGreaterThanOrEqual(metrics.mainBottom - 1);
    }
  }
});

test("gives disabled admin actions a visibly inactive state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(premiumFormFixture());

  const styles = await page.locator(".admin-form-actions").evaluate((actions) => {
    const primary = actions.querySelector<HTMLButtonElement>(".primary-button");
    const secondary = actions.querySelector<HTMLButtonElement>(".secondary-button");
    if (!primary || !secondary) throw new Error("disabled action fixture is incomplete");
    const primaryStyle = getComputedStyle(primary);
    const secondaryStyle = getComputedStyle(secondary);
    return {
      primaryBackground: primaryStyle.backgroundColor,
      primaryOpacity: primaryStyle.opacity,
      secondaryOpacity: secondaryStyle.opacity,
      secondaryCursor: secondaryStyle.cursor,
    };
  });

  expect(styles.primaryBackground).not.toBe("rgb(173, 139, 255)");
  expect(Number(styles.primaryOpacity)).toBeLessThan(1);
  expect(Number(styles.secondaryOpacity)).toBeLessThan(1);
  expect(styles.secondaryCursor).toBe("not-allowed");
});
