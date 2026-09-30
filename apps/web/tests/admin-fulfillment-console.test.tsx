import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  fetchAdminFulfillmentProfile: vi.fn(),
  updateAdminFulfillmentProfile: vi.fn(),
  fetchAdminInventory: vi.fn(),
  markAdminFulfillmentReady: vi.fn(),
  retryAdminFulfillment: vi.fn(),
  addAdminInventory: vi.fn(),
  importAdminInventory: vi.fn(),
  revealAdminInventory: vi.fn(),
  quarantineAdminInventory: vi.fn(),
  revokeAdminInventory: vi.fn(),
}));

vi.mock("@/lib/admin-fulfillment", () => api);

import { AdminFulfillmentConsole } from "@/components/admin-fulfillment-console";

async function openStock() {
  const button = await screen.findByRole("button", { name: "จัดการคลังส่งมอบ" });
  if (button.getAttribute("aria-pressed") !== "true") fireEvent.click(button);
}

async function openInventoryTools() {
  await openStock();
  const button = screen.getByRole("button", { name: "ตรวจสอบรายการและข้อมูลลับ" });
  if (button.getAttribute("aria-expanded") !== "true") fireEvent.click(button);
}

describe("AdminFulfillmentConsole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchAdminFulfillmentProfile.mockResolvedValue({
      productId: 37,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payloadSchemaVersion: 1,
      quantityPolicy: "ONE_PER_ORDER_LINE",
      version: 2,
      updatedAt: "2026-08-30T00:00:00Z",
      updatedBy: "synthetic-admin",
      availableCount: 1,
      reservedCount: 0,
      deliveredCount: 0,
      steps: [],
    });
    api.fetchAdminInventory.mockResolvedValue({
      items: [{
        id: 11,
        fulfillmentType: "LICENSE_KEY",
        provider: "SYNTHETIC",
        payloadSchemaVersion: 1,
        status: "AVAILABLE",
        publicMetadata: { region: "GLOBAL" },
        expiresAt: null,
        reservedUntil: null,
        createdAt: "2026-08-30T00:00:00Z",
        deliveredAt: null,
      }],
      total: 1,
      available: 1,
    });
    api.updateAdminFulfillmentProfile.mockResolvedValue({
      productId: 37,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payloadSchemaVersion: 1,
      quantityPolicy: "ONE_PER_ORDER_LINE",
      version: 3,
      updatedAt: "2026-08-30T00:00:00Z",
      updatedBy: "synthetic-admin",
      availableCount: 1,
      reservedCount: 0,
      deliveredCount: 0,
      steps: [],
    });
    api.addAdminInventory.mockResolvedValue({
      id: 12,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payloadSchemaVersion: 1,
      status: "AVAILABLE",
      publicMetadata: {},
      expiresAt: null,
      reservedUntil: null,
      createdAt: "2026-08-30T00:00:00Z",
      deliveredAt: null,
    });
    api.revealAdminInventory.mockResolvedValue({
      inventoryItemId: 11,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      fields: { licenseKey: "synthetic-license" },
    });
    api.markAdminFulfillmentReady.mockResolvedValue({
      fulfillmentId: 88,
      orderItemId: 92,
      productId: 37,
      fulfillmentType: "LICENSE_KEY",
      deliveryType: "MANUAL",
      status: "READY",
    });
    api.retryAdminFulfillment.mockResolvedValue({
      fulfillmentId: 88,
      orderItemId: 92,
      productId: 37,
      fulfillmentType: "LICENSE_KEY",
      deliveryType: "INSTANT",
      status: "READY",
    });
  });

  it("uses generic email/password wording while preserving single and bulk payloads and secret guards", async () => {
    const profile = await api.fetchAdminFulfillmentProfile();
    api.fetchAdminFulfillmentProfile.mockResolvedValue({ ...profile, fulfillmentType: "DISCORD_ACCOUNT" });
    const inventory = await api.fetchAdminInventory();
    api.fetchAdminInventory.mockResolvedValue({ ...inventory, items: [{ ...inventory.items[0], fulfillmentType: "DISCORD_ACCOUNT" }] });
    api.importAdminInventory.mockResolvedValue(inventory);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    const selector = await screen.findByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" });
    expect(selector).toHaveTextContent(/^อีเมล \/ รหัสผ่าน$/);
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole("option", { name: "อีเมล / รหัสผ่าน" }));
    expect(screen.queryByLabelText("ผู้ให้บริการ")).not.toBeInTheDocument();
    await openInventoryTools();
    expect(screen.getByLabelText("รูปแบบที่บันทึกแล้ว")).toHaveTextContent("อีเมล / รหัสผ่าน · SYNTHETIC");
    expect(container).not.toHaveTextContent(/discord/i);
    expect(api.revealAdminInventory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    expect(screen.getByLabelText("รหัสผ่าน")).toHaveAttribute("type", "password");
    fireEvent.change(screen.getByLabelText("อีเมล"), { target: { value: "synthetic@example.invalid" } });
    fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มข้อมูลส่งมอบ" }));
    await waitFor(() => expect(screen.getByLabelText("รหัสผ่าน")).toHaveValue(""));
    expect(screen.getByLabelText("อีเมล")).toHaveValue("");
    expect(api.addAdminInventory).toHaveBeenCalledWith(37, {
      fulfillmentType: "DISCORD_ACCOUNT", provider: "SYNTHETIC",
      payload: { email: "synthetic@example.invalid", password: "synthetic-password" }, publicMetadata: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "หลายรายการ" }));
    expect(screen.getByText(/ใช้ TAB คั่นอีเมลกับรหัสผ่าน/)).toBeVisible();
    expect(container).not.toHaveTextContent(/discord/i);
    const bulk = screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)");
    fireEvent.change(bulk, { target: { value: "synthetic@example.invalid\tsynthetic-bulk-password" } });
    fireEvent.click(screen.getByRole("button", { name: "นำเข้าหลายรายการ" }));
    await waitFor(() => expect(bulk).toHaveValue(""));
    expect(api.importAdminInventory).toHaveBeenCalledWith(37, [{
      fulfillmentType: "DISCORD_ACCOUNT", provider: "SYNTHETIC",
      payload: { email: "synthetic@example.invalid", password: "synthetic-bulk-password" }, publicMetadata: {},
    }]);
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("guides setup before stock and keeps optional steps out of the primary task", async () => {
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "ตั้งค่าสิ่งที่ลูกค้าได้รับ" });
    expect(screen.queryByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เพิ่มขั้นตอน" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล" }));
    expect(screen.getByRole("button", { name: "เพิ่มขั้นตอน" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "จัดการคลังส่งมอบ" }));
    expect(screen.queryByRole("button", { name: "บันทึกการส่งมอบ" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" })).not.toBeInTheDocument();
  });

  it("shows the saved stock format after saving setup without changing catalog delivery mode", async () => {
    const saved = await api.updateAdminFulfillmentProfile();
    api.updateAdminFulfillmentProfile.mockClear().mockResolvedValue({ ...saved, provider: "SYNTHETIC-NEW" });
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    fireEvent.change(screen.getByLabelText("ผู้ให้บริการ"), { target: { value: "SYNTHETIC-NEW" } });
    expect(screen.getByRole("button", { name: "จัดการคลังส่งมอบ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "จัดการคลังส่งมอบ" })).toBeEnabled());
    await openStock();
    expect(screen.getByLabelText("รูปแบบที่บันทึกแล้ว")).toHaveTextContent("คีย์สิทธิ์ใช้งาน (License key) · SYNTHETIC-NEW");
    expect(api.updateAdminFulfillmentProfile).toHaveBeenCalledWith(37, {
      fulfillmentType: "LICENSE_KEY", provider: "SYNTHETIC-NEW", payloadSchemaVersion: 1, version: 2, steps: [],
    });
    expect(screen.getByText(/ชำระเงินสำเร็จไม่ได้แปลว่าส่งมอบแล้ว/)).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" })).not.toBeInTheDocument();
  });

  it("confirms task exit before clearing a secret draft and clears revealed data on disclosure close", async () => {
    const navigation = vi.fn();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openInventoryTools();
    expect(api.revealAdminInventory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "เหตุผลเมื่อเปิดเผยข้อมูลลับ" }));
    fireEvent.click(screen.getByRole("option", { name: "ตรวจสอบคลังข้อมูล (INVENTORY_AUDIT)" }));
    fireEvent.click(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));
    await screen.findByText("synthetic-license");
    expect(api.revealAdminInventory).toHaveBeenCalledWith(37, 11, "INVENTORY_AUDIT");
    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบรายการและข้อมูลลับ" }));
    expect(screen.queryByText("synthetic-license")).not.toBeInTheDocument();
    await openInventoryTools();
    expect(screen.queryByText("synthetic-license")).not.toBeInTheDocument();
    expect(api.revealAdminInventory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)"), { target: { value: "synthetic-task-draft" } });
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าสิ่งที่ลูกค้าได้รับ" }));
    fireEvent.click(screen.getByRole("button", { name: "แก้ไขต่อ" }));
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toHaveValue("synthetic-task-draft");
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าสิ่งที่ลูกค้าได้รับ" }));
    fireEvent.click(screen.getByRole("button", { name: "ละทิ้งการแก้ไข" }));
    expect(screen.queryByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).not.toBeInTheDocument();
    expect(navigation).toHaveBeenLastCalledWith({ dirty: false, busy: false });
    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toHaveValue("");
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("does not label a manually changed SKU as the catalog selection", () => {
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "สินค้าจากแคตตาล็อก" }} />);
    expect(screen.getByText("เลือกแล้ว: สินค้าจากแคตตาล็อก · SKU #37")).toBeVisible();
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "38" } });
    expect(screen.queryByText("เลือกแล้ว: สินค้าจากแคตตาล็อก · SKU #37")).not.toBeInTheDocument();
    expect(api.fetchAdminFulfillmentProfile).not.toHaveBeenCalled();
  });

  it("preserves optional step metadata and drafts when the non-secret disclosure closes", async () => {
    const profile = await api.fetchAdminFulfillmentProfile();
    const step = { id: 7, stepOrder: 3, audience: "OPERATOR", titleTh: "ตรวจสอบ", titleEn: "Check", bodyTh: "รายละเอียด", bodyEn: "Details", linkUrl: "https://example.invalid/help", enabled: false };
    api.fetchAdminFulfillmentProfile.mockResolvedValue({ ...profile, steps: [step] });
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    expect(screen.getByLabelText("หัวข้อไทย")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล" }));
    fireEvent.change(screen.getByLabelText("หัวข้อไทย"), { target: { value: "ตรวจสอบเพิ่มเติม" } });
    fireEvent.click(screen.getByRole("button", { name: "คำแนะนำเพิ่มเติมสำหรับลูกค้าและผู้ดูแล" }));
    expect(screen.getByLabelText("หัวข้อไทย")).toHaveValue("ตรวจสอบเพิ่มเติม");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(api.updateAdminFulfillmentProfile).toHaveBeenCalledWith(37, expect.objectContaining({
      steps: [{ stepOrder: 3, audience: "OPERATOR", titleTh: "ตรวจสอบเพิ่มเติม", titleEn: "Check", bodyTh: "รายละเอียด", bodyEn: "Details", linkUrl: "https://example.invalid/help", enabled: false }],
    })));
  });

  it("explains an instruction-only product without offering secret imports", async () => {
    const profile = await api.fetchAdminFulfillmentProfile();
    api.fetchAdminFulfillmentProfile.mockResolvedValue({ ...profile, fulfillmentType: "MANUAL_INSTRUCTION", availableCount: 0 });
    api.fetchAdminInventory.mockResolvedValue({ items: [], total: 0, available: 0 });
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openStock();
    expect(screen.getByText("ชนิดนี้ไม่มีคลังข้อมูลลับ ให้ตั้งค่ารูปแบบและขั้นตอนสำหรับลูกค้าแทน")).toBeVisible();
    expect(screen.queryByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" })).not.toBeInTheDocument();
    expect(api.addAdminInventory).not.toHaveBeenCalled();
    expect(api.importAdminInventory).not.toHaveBeenCalled();
  });

  it("invalidates the loaded SKU as soon as the lookup identity changes", async () => {
    render(<AdminFulfillmentConsole />);
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "38" } });
    expect(screen.queryByRole("button", { name: "บันทึกการส่งมอบ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" })).not.toBeInTheDocument();
    api.fetchAdminFulfillmentProfile.mockRejectedValueOnce(new Error("failed load"));
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "บันทึกการส่งมอบ" })).not.toBeInTheDocument();
    expect(api.updateAdminFulfillmentProfile).not.toHaveBeenCalled();
  });

  it("ignores an older load resolving after the latest SKU", async () => {
    const fixture = await api.fetchAdminFulfillmentProfile();
    let resolveFirst: (value: unknown) => void = () => {};
    api.fetchAdminFulfillmentProfile.mockImplementation((id) => id === 37 ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve({ ...fixture, productId: id, provider: "LATEST" }));
    render(<AdminFulfillmentConsole />);
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "38" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await waitFor(() => expect(screen.getByLabelText("ผู้ให้บริการ")).toHaveValue("LATEST"));
    const { act } = await import("@testing-library/react");
    await act(async () => resolveFirst(fixture));
    expect(screen.getByLabelText("ผู้ให้บริการ")).toHaveValue("LATEST");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(api.updateAdminFulfillmentProfile).toHaveBeenCalledWith(38, expect.objectContaining({ version: 2 })));
  });

  it("clears sensitive drafts only after confirmed close and keeps modes exclusive", async () => {
    const navigation = vi.fn();
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    expect(screen.getByRole("heading", { name: "การส่งมอบ: ทดสอบ · SKU #37" })).toBeInTheDocument();
    expect(screen.queryByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).not.toBeInTheDocument();
    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)"), { target: { value: "synthetic-draft" } });
    expect(navigation).toHaveBeenLastCalledWith({ dirty: true, busy: false });
    fireEvent.click(screen.getByRole("button", { name: "ปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.click(screen.getByRole("button", { name: "แก้ไขต่อ" }));
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toHaveValue("synthetic-draft");
    fireEvent.click(screen.getByRole("button", { name: "ปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.click(screen.getByRole("button", { name: "ละทิ้งการแก้ไข" }));
    expect(screen.queryByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).not.toBeInTheDocument();
    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "หลายรายการ" }));
    expect(screen.queryByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)")).toBeInTheDocument();
  });

  it("confirms exact inventory targets without mutating on cancel", async () => {
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openInventoryTools();
    await screen.findByRole("button", { name: "กักกัน" });
    fireEvent.click(screen.getByRole("button", { name: "กักกัน" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("SKU #37 · รายการ #11");
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการดำเนินการ" }));
    expect(api.quarantineAdminInventory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("SKU #37 · รายการ #11");
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการดำเนินการ" }));
    expect(api.revokeAdminInventory).not.toHaveBeenCalled();
  });

  it("imports typed batches, refreshes stock after import and blocks navigation while pending", async () => {
    const profile = await api.fetchAdminFulfillmentProfile();
    const inventory = await api.fetchAdminInventory();
    const navigation = vi.fn();
    let finish: (value: unknown) => void = () => {};
    api.importAdminInventory.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.click(screen.getByRole("button", { name: "หลายรายการ" }));
    fireEvent.change(screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)"), { target: { value: "synthetic-one\nsynthetic-two" } });
    api.fetchAdminFulfillmentProfile.mockClear().mockResolvedValue({ ...profile, availableCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: "นำเข้าหลายรายการ" }));
    expect(api.importAdminInventory).toHaveBeenCalledWith(37, [
      { fulfillmentType: "LICENSE_KEY", provider: "SYNTHETIC", payload: { licenseKey: "synthetic-one" }, publicMetadata: {} },
      { fulfillmentType: "LICENSE_KEY", provider: "SYNTHETIC", payload: { licenseKey: "synthetic-two" }, publicMetadata: {} },
    ]);
    expect(api.fetchAdminFulfillmentProfile).not.toHaveBeenCalled();
    expect(navigation).toHaveBeenLastCalledWith({ dirty: true, busy: true });
    expect(screen.getByLabelText("รหัสสินค้า (SKU)")).toBeDisabled();
    const { act } = await import("@testing-library/react");
    await act(async () => finish(inventory));
    expect(screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)")).toHaveValue("");
    expect(screen.getByText("พร้อมส่งมอบ 3")).toBeInTheDocument();
  });

  it("rejects stale reveals after unmount and locks SKU changes during reveal", async () => {
    let finish: (value: unknown) => void = () => {};
    api.revealAdminInventory.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openInventoryTools();
    fireEvent.click(await screen.findByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));
    expect(screen.getByLabelText("รหัสสินค้า (SKU)")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "38" } });
    expect(screen.getByLabelText("รหัสสินค้า (SKU)")).toHaveValue("37");
    unmount();
    render(<AdminFulfillmentConsole />);
    const { act } = await import("@testing-library/react");
    await act(async () => finish({ inventoryItemId: 11, fields: { licenseKey: "stale-synthetic" } }));
    expect(screen.queryByText("stale-synthetic")).not.toBeInTheDocument();
  });

  it("loads a child product and keeps secret fields hidden until explicit reveal", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" })).toHaveTextContent("LICENSE_KEY"));
    expect(screen.queryByText("synthetic-license", { exact: false })).not.toBeInTheDocument();
    await openInventoryTools();
    expect(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" })).toBeInTheDocument();

    await openInventoryTools();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));

    await waitFor(() => expect(screen.getByText("synthetic-license")).toBeInTheDocument());
    expect(api.revealAdminInventory).toHaveBeenCalledWith(37, 11, "CUSTOMER_SUPPORT");
  });

  it("clears committed batch and revealed data even if summary refresh fails", async () => {
    const inventory = await api.fetchAdminInventory();
    api.importAdminInventory.mockResolvedValue(inventory);
    const navigation = vi.fn();
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openStock();
    fireEvent.click(await screen.findByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.click(screen.getByRole("button", { name: "หลายรายการ" }));
    await openInventoryTools();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));
    await screen.findByText("synthetic-license");
    fireEvent.change(screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)"), { target: { value: "synthetic-batch" } });
    fireEvent.change(screen.getByLabelText("ภูมิภาค (ข้อมูลไม่ลับ)"), { target: { value: "GLOBAL" } });
    api.fetchAdminFulfillmentProfile.mockRejectedValueOnce(new Error("synthetic refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "นำเข้าหลายรายการ" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("นำเข้าหลายรายการ (หนึ่งรายการต่อบรรทัด)")).toHaveValue("");
    expect(screen.queryByText("synthetic-license")).not.toBeInTheDocument();
    expect(navigation).toHaveBeenLastCalledWith({ dirty: false, busy: false });
    expect(screen.getByRole("status")).toHaveTextContent("ไม่ต้องนำเข้าซ้ำ");
  });

  it("rejects profile save responses belonging to another SKU", async () => {
    const saved = await api.updateAdminFulfillmentProfile();
    api.updateAdminFulfillmentProfile.mockResolvedValue({ ...saved, productId: 38, provider: "WRONG-SKU" });
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    fireEvent.click(await screen.findByRole("button", { name: "บันทึกการส่งมอบ" }));
    await waitFor(() => expect(screen.getByLabelText("รหัสสินค้า (SKU)")).not.toBeDisabled());
    expect(screen.getByLabelText("ผู้ให้บริการ")).toHaveValue("SYNTHETIC");
    expect(screen.getByRole("alert")).toHaveTextContent("ไม่ตรง");
  });

  it("closes custom selectors and reports busy while profile save is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    const saved = await api.updateAdminFulfillmentProfile();
    api.updateAdminFulfillmentProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const navigation = vi.fn();
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    fireEvent.click(screen.getByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการส่งมอบ" }));
    expect(navigation).toHaveBeenLastCalledWith({ dirty: false, busy: true });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("รหัสสินค้า (SKU)")).toBeDisabled();
    const { act } = await import("@testing-library/react");
    await act(async () => finish(saved));
    expect(navigation).toHaveBeenLastCalledWith({ dirty: false, busy: false });
  });

  it("uses Thai task and sensitive-field labels while preserving enum values", async () => {
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    expect(screen.getByRole("heading", { name: "2. ตั้งค่าสิ่งที่ลูกค้าได้รับ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" })).toHaveTextContent("คีย์สิทธิ์ใช้งาน");
    await openInventoryTools();
    expect(screen.getByText("พร้อมส่งมอบ")).toBeInTheDocument();
    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toBeInTheDocument();
    expect(screen.getByLabelText("ภูมิภาค (ข้อมูลไม่ลับ)")).toBeInTheDocument();
  });

  it("requires profile changes to be saved before importing inventory", async () => {
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await screen.findByRole("button", { name: "บันทึกการส่งมอบ" });
    fireEvent.change(screen.getByLabelText("ผู้ให้บริการ"), { target: { value: "SYNTHETIC-CHANGED" } });
    expect(screen.getByRole("button", { name: "จัดการคลังส่งมอบ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "จัดการคลังส่งมอบ" }));
    expect(screen.queryByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" })).not.toBeInTheDocument();
    expect(api.addAdminInventory).not.toHaveBeenCalled();
    expect(api.importAdminInventory).not.toHaveBeenCalled();
    expect(screen.getByText("บันทึกรูปแบบการส่งมอบก่อนเพิ่มข้อมูลเข้าคลัง")).toBeInTheDocument();
  });

  it("rejects reveal responses for a different inventory identity", async () => {
    api.revealAdminInventory.mockResolvedValue({ inventoryItemId: 12, fulfillmentType: "LICENSE_KEY", provider: "SYNTHETIC", fields: { licenseKey: "synthetic-wrong-target" } });
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openInventoryTools();
    fireEvent.click(await screen.findByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));
    await waitFor(() => expect(screen.getByLabelText("รหัสสินค้า (SKU)")).not.toBeDisabled());
    expect(screen.queryByText("synthetic-wrong-target")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ไม่ตรง");
  });

  it("clears a committed single-item draft even when the refresh fails", async () => {
    const navigation = vi.fn();
    render(<AdminFulfillmentConsole initialProduct={{ id: 37, nameTh: "ทดสอบ" }} onNavigationStateChange={navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await openStock();
    fireEvent.click(await screen.findByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)"), { target: { value: "synthetic-committed" } });
    fireEvent.change(screen.getByLabelText("ภูมิภาค (ข้อมูลไม่ลับ)"), { target: { value: "GLOBAL" } });
    api.fetchAdminFulfillmentProfile.mockRejectedValueOnce(new Error("synthetic refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มข้อมูลส่งมอบ" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)")).toHaveValue("");
    expect(screen.getByLabelText("ภูมิภาค (ข้อมูลไม่ลับ)")).toHaveValue("");
    expect(navigation).toHaveBeenLastCalledWith({ dirty: false, busy: false });
    expect(api.addAdminInventory).toHaveBeenCalledTimes(1);
  });

  it("uses the selected typed schema when importing a license item", async () => {
    render(<AdminFulfillmentConsole />);
    fireEvent.change(screen.getByLabelText("รหัสสินค้า (SKU)"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดการส่งมอบ" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "ชนิดข้อมูลที่ลูกค้าได้รับ" })).toHaveTextContent("LICENSE_KEY"));

    await openStock();
    fireEvent.click(screen.getByRole("button", { name: "เปิดเพิ่มข้อมูลส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("คีย์สิทธิ์ใช้งาน (License key)"), { target: { value: "synthetic-license-2" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มข้อมูลส่งมอบ" }));

    await waitFor(() => expect(api.addAdminInventory).toHaveBeenCalledWith(37, {
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payload: { licenseKey: "synthetic-license-2" },
      publicMetadata: {},
    }));
  });

  it("lets an operator mark a paid manual fulfillment ready", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.click(screen.getByRole("button", { name: "เครื่องมือแก้ปัญหาการส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("รหัส fulfillment สำหรับ manual"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันพร้อมส่งมอบ" }));
    expect(api.markAdminFulfillmentReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันดำเนินการ" }));

    await waitFor(() => expect(api.markAdminFulfillmentReady).toHaveBeenCalledWith(88));
    expect(await screen.findByText("manual fulfillment #88 พร้อมส่งมอบแล้ว")).toBeInTheDocument();
  });

  it("lets an operator retry a failed fulfillment", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.click(screen.getByRole("button", { name: "เครื่องมือแก้ปัญหาการส่งมอบ" }));
    fireEvent.change(screen.getByLabelText("รหัส fulfillment สำหรับ manual"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "ลองส่งมอบซ้ำ" }));
    expect(api.retryAdminFulfillment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันดำเนินการ" }));

    await waitFor(() => expect(api.retryAdminFulfillment).toHaveBeenCalledWith(88));
    expect(await screen.findByText("เริ่ม retry fulfillment #88 แล้ว")).toBeInTheDocument();
  });
});
