import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const globals = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8").replace('@import "tailwindcss";', "");
const admin = readFileSync(fileURLToPath(new URL("../app/admin/admin.css", import.meta.url)), "utf8");

// Synthetic source-CSS geometry only. Real React interactions are covered in Vitest.
function fixture(task: "setup" | "stock") {
  return `<style>${globals}\n${admin}</style><main><div class="admin-workspace"><section class="admin-fulfillment-console">
    <div class="admin-fulfillment-loader"><label for="sku">รหัสสินค้า (SKU)</label><input id="sku" value="37"><button class="primary-button">โหลดการส่งมอบ</button></div>
    <fieldset class="admin-form-fields"><div class="admin-fulfillment-workflow">
      <div class="admin-fulfillment-task-nav"><button aria-pressed="${task === "setup"}">ตั้งค่าสิ่งที่ลูกค้าได้รับ</button><button aria-pressed="${task === "stock"}" ${task === "setup" ? "disabled" : ""}>จัดการคลังส่งมอบ</button></div>
      <div class="admin-fulfillment-grid" data-task="${task}"><div class="admin-fulfillment-main">
        <section class="admin-fulfillment-card" ${task !== "setup" ? "hidden" : ""} id="setup"><h3>2. ตั้งค่าสิ่งที่ลูกค้าได้รับ</h3>
          <div class="admin-custom-select-field"><span>ชนิดข้อมูลที่ลูกค้าได้รับ</span><button class="admin-select-trigger"><span class="admin-select-value"><strong>คีย์สิทธิ์ใช้งาน</strong><span>(LICENSE_KEY)</span></span></button></div>
          <label for="provider">ผู้ให้บริการ</label><input id="provider" value="SYNTHETIC">
          <section class="admin-disclosure"><h3><button>คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล</button></h3><div hidden><button>เพิ่มขั้นตอน</button></div></section><button class="primary-button">บันทึกการส่งมอบ</button>
        </section>
        <section class="admin-fulfillment-card" ${task !== "stock" ? "hidden" : ""} id="stock"><div class="admin-card-heading"><h3>3. เติมคลังส่งมอบ</h3><span class="admin-fulfillment-count">พร้อมส่งมอบ 1</span></div><p aria-label="รูปแบบที่บันทึกแล้ว">คีย์สิทธิ์ใช้งาน (License key) · SYNTHETIC</p><p>คลังข้อมูลแยกจากจำนวนสต็อกในเมนูสินค้า</p><button class="secondary-button" aria-expanded="true">ปิดเพิ่มข้อมูลส่งมอบ</button><div class="admin-fulfillment-secret-form"><label for="secret">คีย์สิทธิ์ใช้งาน</label><input id="secret" type="password"><button class="primary-button">เพิ่มข้อมูลส่งมอบ</button></div></section>
      </div><aside class="admin-fulfillment-sidebar" ${task !== "stock" ? "hidden" : ""}><section class="admin-fulfillment-card"><h3>คลังข้อมูลส่งมอบ</h3><section class="admin-disclosure"><h3><button>ตรวจสอบรายการและข้อมูลลับ</button></h3><div hidden>ข้อมูลปิดอยู่</div></section></section></aside></div>
    </div></fieldset></section></div></main>`;
}

for (const width of [320, 390, 768, 1024, 1200, 1440]) {
  for (const task of ["setup", "stock"] as const) {
    test(`fulfillment source-CSS ${task} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(fixture(task));
      await expect(page.locator(task === "setup" ? "#stock" : "#setup")).toBeHidden();
      await expect(page.getByText("(LICENSE_KEY)", { exact: true })).toBeHidden();
      const metrics = await page.evaluate(() => {
        const grid = document.querySelector(".admin-fulfillment-grid")!;
        const bad = [...document.querySelectorAll("button, input")].filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || box.height < 44);
        });
        return { overflow: document.documentElement.scrollWidth > innerWidth, bad: bad.map((node) => node.textContent), columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length };
      });
      expect(metrics.overflow).toBe(false);
      expect(metrics.bad).toEqual([]);
      expect(metrics.columns).toBe(task === "stock" && width >= 1200 ? 2 : 1);
      if (task === "setup") {
        const disabled = page.getByRole("button", { name: "จัดการคลังส่งมอบ" });
        expect(await disabled.evaluate((node) => getComputedStyle(node).cursor)).toBe("not-allowed");
      } else if (width >= 1200) {
        const main = (await page.locator("#stock").boundingBox())!;
        const aside = (await page.locator("aside").boundingBox())!;
        expect(main.x + main.width).toBeLessThanOrEqual(aside.x);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/fulfillment-${task}-${width}.png`, fullPage: true });
    });
  }
}
