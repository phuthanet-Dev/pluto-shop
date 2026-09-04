import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  fetchAdminFulfillmentProfile: vi.fn(),
  updateAdminFulfillmentProfile: vi.fn(),
  fetchAdminInventory: vi.fn(),
  markAdminFulfillmentReady: vi.fn(),
  retryAdminFulfillment: vi.fn(),
  addAdminInventory: vi.fn(),
  revealAdminInventory: vi.fn(),
  quarantineAdminInventory: vi.fn(),
  revokeAdminInventory: vi.fn(),
}));

vi.mock("@/lib/admin-fulfillment", () => api);

import { AdminFulfillmentConsole } from "@/components/admin-fulfillment-console";

describe("AdminFulfillmentConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("loads a child product and keeps secret fields hidden until explicit reveal", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.change(screen.getByLabelText("รหัสสินค้า/child"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดข้อมูล fulfillment" }));

    await waitFor(() => expect(screen.getByLabelText("ชนิด fulfillment")).toHaveValue("LICENSE_KEY"));
    expect(screen.queryByText("synthetic-license", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เปิดเผยข้อมูลรายการ 11" }));

    await waitFor(() => expect(screen.getByText("synthetic-license")).toBeInTheDocument());
    expect(api.revealAdminInventory).toHaveBeenCalledWith(37, 11, "CUSTOMER_SUPPORT");
  });

  it("uses the selected typed schema when importing a license item", async () => {
    render(<AdminFulfillmentConsole />);
    fireEvent.change(screen.getByLabelText("รหัสสินค้า/child"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: "โหลดข้อมูล fulfillment" }));
    await waitFor(() => expect(screen.getByLabelText("ชนิด fulfillment")).toHaveValue("LICENSE_KEY"));

    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "synthetic-license-2" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม inventory" }));

    await waitFor(() => expect(api.addAdminInventory).toHaveBeenCalledWith(37, {
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      payload: { licenseKey: "synthetic-license-2" },
      publicMetadata: {},
    }));
  });

  it("lets an operator mark a paid manual fulfillment ready", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.change(screen.getByLabelText("รหัส fulfillment สำหรับ manual"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันพร้อมส่งมอบ" }));

    await waitFor(() => expect(api.markAdminFulfillmentReady).toHaveBeenCalledWith(88));
    expect(await screen.findByText("manual fulfillment #88 พร้อมส่งมอบแล้ว")).toBeInTheDocument();
  });

  it("lets an operator retry a failed fulfillment", async () => {
    render(<AdminFulfillmentConsole />);

    fireEvent.change(screen.getByLabelText("รหัส fulfillment สำหรับ manual"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "ลองส่งมอบซ้ำ" }));

    await waitFor(() => expect(api.retryAdminFulfillment).toHaveBeenCalledWith(88));
    expect(await screen.findByText("เริ่ม retry fulfillment #88 แล้ว")).toBeInTheDocument();
  });
});
