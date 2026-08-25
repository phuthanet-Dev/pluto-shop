import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminProduct } from "@/lib/admin-products";
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
    await user.click(screen.getByRole("button", { name: "บันทึกสินค้า" }));

    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledWith(expect.objectContaining({
        slug: "new-phase3-product",
        visualCode: "P3-NEW",
        nameEn: "New product",
        priceMinor: 0,
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
