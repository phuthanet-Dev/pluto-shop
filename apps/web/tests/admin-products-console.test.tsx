import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminProductsApiError, type AdminProduct } from "@/lib/admin-products";
import { AdminProductsConsole } from "@/components/admin-products-console";

const product: AdminProduct = {
  id: 37,
  slug: "phase3-test-product",
  nameTh: "สินค้า Phase 3",
  nameEn: "Phase 3 Product",
  descriptionTh: "คำอธิบาย",
  descriptionEn: "Description",
  visualCode: "P3-TEST",
  type: "SINGLE",
  priceMinor: 12345,
  currency: "THB",
  stockQuantity: 5,
  bundleItemCount: null,
  instantDelivery: true,
  catalogOrder: 37,
  active: true,
  updatedAt: "2026-08-25T14:00:00Z",
  updatedBy: "admin-subject",
  version: 0,
};

const mocks = vi.hoisted(() => ({
  fetchAdminProducts: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  archiveAdminProduct: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock("@/lib/admin-products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-products")>("@/lib/admin-products");
  return {
    ...actual,
    ...mocks,
  };
});

describe("AdminProductsConsole", () => {
  beforeEach(() => {
    mocks.fetchAdminProducts.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.createAdminProduct.mockReset().mockResolvedValue(product);
    mocks.updateAdminProduct.mockReset().mockResolvedValue(product);
    mocks.archiveAdminProduct.mockReset().mockResolvedValue({ ...product, active: false, version: 1 });
    mocks.scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: mocks.scrollIntoView,
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("renders the product table and opens the create form", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    expect(await screen.findByRole("row", { name: /สินค้า Phase 3/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แก้ไข สินค้า Phase 3" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เก็บถาวร สินค้า Phase 3" }).querySelector("svg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    expect(screen.getByRole("heading", { name: "เพิ่มสินค้า" })).toBeInTheDocument();
    expect(screen.getByLabelText("รหัส URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เพิ่มสินค้า" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยกเลิก" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกสินค้า" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ค้นหา" }).querySelector("svg")).toBeInTheDocument();
  });

  it("uses a custom keyboard-accessible product type dropdown", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    const typeTrigger = screen.getByRole("combobox", { name: "ประเภทสินค้า" });
    expect(typeTrigger).toHaveTextContent("สินค้าเดี่ยว (SINGLE)");

    await user.click(typeTrigger);
    expect(screen.getByRole("listbox", { name: "ประเภทสินค้า" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ชุดสินค้า (BUNDLE)" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "ชุดสินค้า (BUNDLE)" }));
    expect(typeTrigger).toHaveTextContent("ชุดสินค้า (BUNDLE)");
    expect(screen.queryByRole("listbox", { name: "ประเภทสินค้า" })).not.toBeInTheDocument();

    typeTrigger.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(typeTrigger).toHaveTextContent("สินค้าเดี่ยว (SINGLE)");
  });

  it("scrolls the edit form into view when editing a product", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    await waitFor(() =>
      expect(mocks.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }),
    );
  });

  it("offers a fresh login when the admin session expires", async () => {
    mocks.fetchAdminProducts.mockRejectedValue(new AdminProductsApiError(401, "Unauthorized"));
    render(<AdminProductsConsole />);

    expect(await screen.findByRole("link", { name: "เข้าสู่ระบบใหม่" })).toHaveAttribute(
      "href",
      "/api/auth/login?callbackUrl=%2Fadmin",
    );
  });

  it("submits a new product with server-compatible fields", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);
    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    await user.type(screen.getByLabelText("รหัส URL"), "new-phase3-product");
    await user.type(screen.getByLabelText("รหัสภาพ"), "P3-NEW");
    await user.type(screen.getByLabelText("ชื่อสินค้า (ภาษาไทย)"), "สินค้าใหม่");
    await user.type(screen.getByLabelText("ชื่อสินค้า (ภาษาอังกฤษ)"), "New product");
    await user.type(screen.getByLabelText("คำอธิบายสินค้า (ภาษาไทย)"), "คำอธิบายใหม่");
    await user.type(screen.getByLabelText("คำอธิบายสินค้า (ภาษาอังกฤษ)"), "New description");
    await user.clear(screen.getByLabelText("ราคา (บาท)"));
    await user.type(screen.getByLabelText("ราคา (บาท)"), "1299.50");
    await user.click(screen.getByRole("button", { name: "บันทึกสินค้า" }));

    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledWith(expect.objectContaining({
        slug: "new-phase3-product",
        visualCode: "P3-NEW",
        nameEn: "New product",
        priceMinor: 129950,
        stockQuantity: 0,
        currency: "THB",
        version: 0,
      })),
    );
  });

  it("requires confirmation before archiving a product", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "เก็บถาวร สินค้า Phase 3" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.archiveAdminProduct).toHaveBeenCalledWith(product.id, product.version),
    );
  });
});
