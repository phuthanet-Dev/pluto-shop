import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth-server", () => ({ getAccessToken: vi.fn().mockResolvedValue("synthetic-token") }));
import { AdminFulfillmentConsole } from "@/components/admin-fulfillment-console";
import { PUT } from "@/app/api/v1/admin/products/[id]/fulfillment/route";
import { updateAdminFulfillmentProfile } from "@/lib/admin-fulfillment";

const fixture = { productId: 37, fulfillmentType: "NONE", provider: null as string | null,
  payloadSchemaVersion: 1, quantityPolicy: "ONE_PER_ORDER_LINE", version: 1,
  updatedAt: "2026-08-30T00:00:00Z", updatedBy: null, availableCount: 0,
  reservedCount: 0, deliveredCount: 0, steps: [] };
let loaded = { ...fixture };
const upstream = vi.fn();
const saves = vi.fn();
async function load() {
  render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
  fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
  await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
}
async function choose(label: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" }));
  fireEvent.click(screen.getByRole("option", { name: label }));
}
describe("actual fulfillment form through PUT BFF", () => {
  beforeEach(() => {
    loaded = { ...fixture }; upstream.mockReset(); saves.mockReset();
    vi.stubEnv("SITE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("INTERNAL_API_URL", "http://api:8080");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://api:8080")) {
        const body = JSON.parse(await new Response(init?.body).text());
        upstream(body);
        return Response.json({ ...loaded, ...body, version: loaded.version + 1 });
      }
      if (init?.method === "PUT") {
        saves(JSON.parse(String(init.body)));
        return PUT(new Request(`http://127.0.0.1:3000${url}`, { ...init,
          headers: { ...init.headers, origin: "http://127.0.0.1:3000" } }), { params: Promise.resolve({ id: "37" }) });
      }
      return Response.json(url.endsWith("/inventory") ? { items: [], total: 0, available: 0 } : loaded);
    }));
  });
  it("turns BFF field errors into Thai instructions without echoing values", async () => {
    await expect(updateAdminFulfillmentProfile(37, { fulfillmentType: "DISCORD_ACCOUNT", provider: "synthetic secret!", payloadSchemaVersion: 1, version: 1, steps: [] }))
      .rejects.toThrow("ผู้ให้บริการ");
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(["DISCORD", "SYNTHETIC", "SYNTHETIC-NEW"])("preserves stored account provider %s", async (provider) => {
    loaded = { ...fixture, fulfillmentType: "DISCORD_ACCOUNT", provider, availableCount: 1 };
    await load();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(upstream).toHaveBeenCalledWith(expect.objectContaining({ provider })));
  });
  it("saves instructions without a provider", async () => {
    await load(); await choose("ขั้นตอนดำเนินการด้วยตนเอง (MANUAL_INSTRUCTION)");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(upstream).toHaveBeenCalledWith(expect.objectContaining({ provider: null })));
  });
  it("rejects missing providers for other secret types without inventing SYNTHETIC", async () => {
    await load(); await choose("คีย์สิทธิ์ใช้งาน (License key) (LICENSE_KEY)");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ผู้ให้บริการ");
    expect(saves).not.toHaveBeenCalled();
  });
  it("blocks incomplete optional steps locally with actionable Thai field names", async () => {
    await load(); await choose("อีเมล / รหัสผ่าน");
    fireEvent.click(screen.getByRole("button", { name: "คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล" }));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มขั้นตอน" }));
    fireEvent.change(screen.getByLabelText("หัวข้อไทย"), { target: { value: "คำแนะนำ" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ขั้นตอนที่ 1: หัวข้ออังกฤษ");
    expect(saves).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ลบขั้นตอน" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    expect(await screen.findByText("บันทึก fulfillment profile แล้ว")).toBeVisible();
  });
  it("saves email/password selected from NONE without typing a provider", async () => {
    await load(); await choose("อีเมล / รหัสผ่าน");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(upstream).toHaveBeenCalledWith({ fulfillmentType: "DISCORD_ACCOUNT", provider: "DISCORD", payloadSchemaVersion: 1, version: 1, steps: [] }));
    expect(await screen.findByText("บันทึก fulfillment profile แล้ว")).toBeVisible();
    expect(screen.queryByLabelText("ผู้ให้บริการ")).not.toBeInTheDocument();
  });
});
