import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminProductsApiError, type AdminProduct } from "@/lib/admin-products";
import { AdminProductsConsole } from "@/components/admin-products-console";

const product: AdminProduct = {
  id: 37,
  slug: "phase3-test-product",
  nameTh: "สินค้า Phase 3",
  nameEn: "Phase 3 Product",
  shortDescriptionTh: "คำโปรยสั้น",
  shortDescriptionEn: "Short summary",
  descriptionTh: "คำอธิบาย",
  descriptionEn: "Description",
  selectionMode: "SINGLE_OPTION",
  optionGroup: null,
  optionLabelTh: null,
  optionLabelEn: null,
  priceMinor: 12345,
  currency: "THB",
  stockQuantity: 5,
  deliveryType: "INSTANT",
  warrantyDays: 30,
  stockWarningThreshold: 5,
  status: "ACTIVE",
  sortOrder: 37,
  hasImage: false,
  imageContentType: null,
  imageSizeBytes: null,
  imageWidth: null,
  imageHeight: null,
  updatedAt: "2026-08-25T14:00:00Z",
  updatedBy: "admin-subject",
  version: 0,
};

const mocks = vi.hoisted(() => ({
  fetchAdminProducts: vi.fn(),
  fetchAdminProduct: vi.fn(),
  fetchAdminMultiProduct: vi.fn(),
  createAdminProduct: vi.fn(),
  createAdminMultiProduct: vi.fn(),
  appendAdminMultiProduct: vi.fn(),
  updateAdminMultiProductGroup: vi.fn(),
  updateAdminProduct: vi.fn(),
  deleteAdminProduct: vi.fn(),
  uploadAdminProductImage: vi.fn(),
  deleteAdminProductImage: vi.fn(),
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
    mocks.fetchAdminProduct.mockReset().mockResolvedValue(product);
    mocks.fetchAdminMultiProduct.mockReset();
    mocks.createAdminProduct.mockReset().mockResolvedValue(product);
    mocks.createAdminMultiProduct.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.appendAdminMultiProduct.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.updateAdminMultiProductGroup.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.updateAdminProduct.mockReset().mockResolvedValue(product);
    mocks.deleteAdminProduct.mockReset().mockResolvedValue(undefined);
    mocks.uploadAdminProductImage.mockReset().mockResolvedValue({ ...product, hasImage: true, imageContentType: "image/jpeg", imageSizeBytes: 123, imageWidth: 10, imageHeight: 10, version: 1 });
    mocks.deleteAdminProductImage.mockReset().mockResolvedValue({ ...product, version: 1 });
    mocks.scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: mocks.scrollIntoView,
    });

  });

  it("renders the product table and opens the create form", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    expect(await screen.findByRole("row", { name: /สินค้า Phase 3/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แก้ไข สินค้า Phase 3" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลบ สินค้า Phase 3" }).querySelector("svg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    expect(screen.getByRole("heading", { name: "เพิ่มสินค้า" })).toBeInTheDocument();
    expect(screen.getByLabelText("รหัส URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เพิ่มสินค้า" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยกเลิก" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกสินค้า" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ค้นหา" }).querySelector("svg")).toBeInTheDocument();
  });

  it("uses a custom keyboard-accessible selection mode dropdown", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    const selectionTrigger = screen.getByRole("combobox", { name: "โหมดตัวเลือก" });
    expect(selectionTrigger).toHaveTextContent("สินค้าตัวเลือกเดียว (SINGLE_OPTION)");

    await user.click(selectionTrigger);
    expect(screen.getByRole("listbox", { name: "โหมดตัวเลือก" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));
    expect(selectionTrigger).toHaveTextContent("สินค้าหลายตัวเลือก (MULTI_OPTION)");
    expect(screen.getByLabelText("กลุ่มตัวเลือก")).toBeInTheDocument();
    expect(screen.getByLabelText("ชื่อ option (ภาษาไทย)")).toBeInTheDocument();
    expect(screen.getByLabelText("ชื่อ option (ภาษาอังกฤษ)")).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "โหมดตัวเลือก" })).not.toBeInTheDocument();

    selectionTrigger.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}{Enter}");
    expect(selectionTrigger).toHaveTextContent("สินค้าตัวเลือกเดียว (SINGLE_OPTION)");
  });

  it("does not expose removed visual code or legacy product type controls", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    expect(screen.queryByLabelText("รหัสภาพ")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "ประเภท" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "โหมดตัวเลือก" })).toBeInTheDocument();
  });

  it("uses custom keyboard-accessible dropdowns for delivery and status", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    const deliveryTrigger = screen.getByRole("combobox", { name: "รูปแบบการส่งมอบ" });
    const statusTrigger = screen.getByRole("combobox", { name: "สถานะสินค้า" });

    await user.click(deliveryTrigger);
    expect(screen.getByRole("listbox", { name: "รูปแบบการส่งมอบ" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "ดำเนินการด้วยตนเอง (MANUAL)" }));
    expect(deliveryTrigger).toHaveTextContent("ดำเนินการด้วยตนเอง (MANUAL)");

    statusTrigger.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(statusTrigger).toHaveTextContent("ซ่อนจากแคตตาล็อก (HIDDEN)");
  });

  it("does not expose the removed bundle item count field", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    expect(screen.queryByLabelText(/จำนวนรายการในชุด/u)).not.toBeInTheDocument();
  });

  it("adds multiple child product editors when multi-option mode is selected", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    await user.click(screen.getByRole("combobox", { name: "โหมดตัวเลือก" }));
    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));

    expect(screen.getByRole("group", { name: "รายการย่อยที่ 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "รายการย่อยใหม่ที่ 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการย่อย" }));
    expect(screen.getByRole("group", { name: "รายการย่อยใหม่ที่ 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลบรายการย่อยใหม่ที่ 3" })).toBeInTheDocument();
  });

  it("asks for shared card data once instead of repeating it for every child", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    await user.click(screen.getByRole("combobox", { name: "โหมดตัวเลือก" }));
    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));

    expect(screen.getByLabelText("ชื่อบน product card (ภาษาไทย)")).toBeInTheDocument();
    expect(screen.getByLabelText("ชื่อบน product card (ภาษาอังกฤษ)")).toBeInTheDocument();
    expect(screen.getByLabelText("คำโปรยบน product card (ภาษาไทย)")).toBeInTheDocument();
    expect(screen.getByLabelText("คำโปรยบน product card (ภาษาอังกฤษ)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/ชื่อสินค้า \(ภาษาไทย\)/u)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/คำโปรยสั้น \(ภาษาไทย\)/u)).not.toBeInTheDocument();
  });

  it("organizes multi-option editing into configuration, options, and shared-card regions", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    await user.click(screen.getByRole("combobox", { name: "โหมดตัวเลือก" }));
    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));

    const form = document.querySelector(".admin-product-form");
    expect(form?.querySelector(".admin-form-layout.is-multi")).toBeInTheDocument();
    expect(form?.querySelector(".admin-configuration-card")).toBeInTheDocument();
    expect(form?.querySelector(".admin-options-panel")).toBeInTheDocument();
    expect(form?.querySelector(".admin-form-sidebar .admin-group-card-fields")).toBeInTheDocument();
    expect(screen.getByLabelText("คำโปรยบน product card (ภาษาไทย)")).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText("คำโปรยบน product card (ภาษาอังกฤษ)")).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("loads an existing multi-option group and offers adding another child", async () => {
    const user = userEvent.setup();
    const multiProduct = {
      ...product,
      selectionMode: "MULTI_OPTION" as const,
      optionGroup: "phase3-multi",
      optionLabelTh: "ตัวเลือกหนึ่ง",
      optionLabelEn: "Option one",
    } as AdminProduct;
    mocks.fetchAdminProducts.mockResolvedValue({ items: [multiProduct], total: 1 });
    mocks.fetchAdminMultiProduct.mockResolvedValue({
      optionGroup: "phase3-multi",
      nameTh: "แพ็กเกจรวม",
      nameEn: "Shared package",
      shortDescriptionTh: "คำโปรยรวม",
      shortDescriptionEn: "Shared summary",
      updatedAt: "2026-08-25T14:00:00Z",
      updatedBy: "admin-subject",
      version: 0,
      items: [multiProduct],
    });

    render(<AdminProductsConsole />);

    expect(await screen.findByRole("button", { name: "เพิ่มรายการย่อยในกลุ่ม phase3-multi" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการย่อยในกลุ่ม phase3-multi" }));

    expect(await screen.findByRole("heading", { name: "เพิ่มรายการย่อยในกลุ่ม" })).toBeInTheDocument();
    expect(screen.getByLabelText("ชื่อบน product card (ภาษาไทย)")).toHaveValue("แพ็กเกจรวม");
    expect(screen.getByRole("group", { name: "รายการสินค้าย่อย" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการย่อย" }));
    expect(screen.getByRole("button", { name: "ลบรายการย่อยใหม่ที่ 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ลบรายการย่อยใหม่ที่ 2" }));

    const fields = (name: string) => screen.getByLabelText(name);
    fireEvent.change(fields("รหัส URL"), { target: { value: "phase3-multi-three" } });
    fireEvent.change(fields("คำอธิบายสินค้า (ภาษาไทย)"), { target: { value: "รายละเอียดสาม" } });
    fireEvent.change(fields("คำอธิบายสินค้า (ภาษาอังกฤษ)"), { target: { value: "Third details" } });
    fireEvent.change(fields("ชื่อ option (ภาษาไทย)"), { target: { value: "ตัวเลือกสาม" } });
    fireEvent.change(fields("ชื่อ option (ภาษาอังกฤษ)"), { target: { value: "Option three" } });
    mocks.appendAdminMultiProduct.mockResolvedValue({ items: [], total: 1 });
    await user.click(screen.getByRole("button", { name: "บันทึกและเพิ่มรายการย่อย" }));

    await waitFor(() => expect(mocks.appendAdminMultiProduct).toHaveBeenCalledWith(
      "phase3-multi",
      [expect.objectContaining({ slug: "phase3-multi-three", nameTh: "แพ็กเกจรวม" })],
      expect.objectContaining({ nameTh: "แพ็กเกจรวม", version: 0 }),
    ));
  });

  it("updates shared card data with the group version", async () => {
    const user = userEvent.setup();
    const multiProduct = {
      ...product,
      selectionMode: "MULTI_OPTION" as const,
      optionGroup: "phase3-multi",
      optionLabelTh: "ตัวเลือกเดิม",
      optionLabelEn: "Existing option",
    } as AdminProduct;
    const group = {
      optionGroup: "phase3-multi",
      nameTh: "แพ็กเกจรวม",
      nameEn: "Shared package",
      shortDescriptionTh: "คำโปรยรวม",
      shortDescriptionEn: "Shared summary",
      updatedAt: "2026-08-25T14:00:00Z",
      updatedBy: "admin-subject",
      version: 4,
      items: [multiProduct],
    };
    mocks.fetchAdminProducts.mockResolvedValue({ items: [multiProduct], total: 1 });
    mocks.fetchAdminMultiProduct.mockResolvedValue(group);
    mocks.updateAdminMultiProductGroup.mockResolvedValue({ ...group, version: 5 });
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไขข้อมูลกลุ่ม phase3-multi" }));
    const cardName = await screen.findByLabelText("ชื่อบน product card (ภาษาไทย)");
    await user.clear(cardName);
    await user.type(cardName, "แพ็กเกจใหม่");
    await user.click(screen.getByRole("button", { name: "บันทึกข้อมูลกลุ่ม" }));

    await waitFor(() => expect(mocks.updateAdminMultiProductGroup).toHaveBeenCalledWith(
      "phase3-multi",
      expect.objectContaining({ nameTh: "แพ็กเกจใหม่", version: 4 }),
    ));
  });

  it("uses the catalog-wide maximum sort order when a search hides higher products", async () => {
    const user = userEvent.setup();
    const visibleProduct = { ...product, sortOrder: 10, slug: "visible-product" };
    const hiddenProduct = { ...product, id: 99, sortOrder: 900, slug: "hidden-product" };
    mocks.fetchAdminProducts.mockImplementation(async (search = "") => search
      ? { items: [visibleProduct], total: 1 }
      : { items: [visibleProduct, hiddenProduct], total: 2 });
    render(<AdminProductsConsole />);

    await screen.findByRole("row", { name: /visible-product/ });
    await user.type(screen.getByLabelText("ค้นหาสินค้า"), "visible");
    await user.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(mocks.fetchAdminProducts).toHaveBeenCalledWith("visible"));

    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    expect(screen.getByLabelText("ลำดับแสดงผล")).toHaveValue(901);
  });

  it("submits every multi child through the atomic batch API", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);
    await user.click(screen.getByRole("button", { name: "เพิ่มสินค้า" }));
    await user.click(screen.getByRole("combobox", { name: "โหมดตัวเลือก" }));
    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));

    fireEvent.change(screen.getByLabelText("กลุ่มตัวเลือก"), { target: { value: "multi-plan" } });
    fireEvent.change(screen.getByLabelText("ชื่อบน product card (ภาษาไทย)"), { target: { value: "แพ็กเกจรวม" } });
    fireEvent.change(screen.getByLabelText("ชื่อบน product card (ภาษาอังกฤษ)"), { target: { value: "Shared package" } });
    fireEvent.change(screen.getByLabelText("คำโปรยบน product card (ภาษาไทย)"), { target: { value: "คำโปรยรวม" } });
    fireEvent.change(screen.getByLabelText("คำโปรยบน product card (ภาษาอังกฤษ)"), { target: { value: "Shared summary" } });

    const fillChild = (prefix: string, slug: string, label: string) => {
      const field = (name: string) => screen.getByLabelText(prefix ? `${prefix} · ${name}` : name);
      const values = {
        "รหัส URL": slug,
        "คำอธิบายสินค้า (ภาษาไทย)": `คำอธิบาย ${label}`,
        "คำอธิบายสินค้า (ภาษาอังกฤษ)": `Description ${label}`,
        "ชื่อ option (ภาษาไทย)": `ตัวเลือก ${label}`,
        "ชื่อ option (ภาษาอังกฤษ)": `Option ${label}`,
      };
      Object.entries(values).forEach(([name, value]) => fireEvent.change(field(name), { target: { value } }));
    };

    fillChild("", "multi-plan-one", "หนึ่ง");
    fillChild("รายการย่อยใหม่ที่ 2", "multi-plan-two", "สอง");
    await user.click(screen.getByRole("button", { name: "บันทึกสินค้า" }));

    await waitFor(() => {
      expect(mocks.createAdminMultiProduct).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ slug: "multi-plan-one", optionGroup: "multi-plan", nameTh: "แพ็กเกจรวม" }),
          expect.objectContaining({ slug: "multi-plan-two", optionGroup: "multi-plan", nameTh: "แพ็กเกจรวม" }),
        ]),
        expect.any(Function),
        expect.objectContaining({ nameTh: "แพ็กเกจรวม", version: 0 }),
      );
    });
    expect(mocks.createAdminProduct).not.toHaveBeenCalled();
  });

  it("does not offer an unsaved second child while editing one product", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    await user.click(screen.getByRole("combobox", { name: "โหมดตัวเลือก" }));
    await user.click(screen.getByRole("option", { name: "สินค้าหลายตัวเลือก (MULTI_OPTION)" }));

    expect(screen.getByRole("group", { name: "รายการย่อยที่ 1" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "รายการย่อยที่ 2" })).not.toBeInTheDocument();
    expect(screen.getByText("แก้ไขรายการย่อยนี้ทีละรายการจากตารางด้านล่าง เพื่อรักษา version และสต็อกของแต่ละรายการ")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText("ชื่อสินค้า (ภาษาไทย)"), "สินค้าใหม่");
    await user.type(screen.getByLabelText("ชื่อสินค้า (ภาษาอังกฤษ)"), "New product");
    await user.type(screen.getByLabelText("คำโปรยสั้น (ภาษาไทย)"), "คำโปรยใหม่");
    await user.type(screen.getByLabelText("คำโปรยสั้น (ภาษาอังกฤษ)"), "New summary");
    await user.type(screen.getByLabelText("คำอธิบายสินค้า (ภาษาไทย)"), "คำอธิบายใหม่");
    await user.type(screen.getByLabelText("คำอธิบายสินค้า (ภาษาอังกฤษ)"), "New description");
    await user.clear(screen.getByLabelText("ราคา (บาท)"));
    await user.type(screen.getByLabelText("ราคา (บาท)"), "1299.50");
    await user.click(screen.getByRole("button", { name: "บันทึกสินค้า" }));

    await waitFor(() =>
      expect(mocks.createAdminProduct).toHaveBeenCalledWith(expect.objectContaining({
        slug: "new-phase3-product",
        nameEn: "New product",
        shortDescriptionTh: "คำโปรยใหม่",
        shortDescriptionEn: "New summary",
        priceMinor: 129950,
        stockQuantity: 0,
        currency: "THB",
        deliveryType: "INSTANT",
        warrantyDays: 0,
        stockWarningThreshold: 5,
        status: "ACTIVE",
        version: 0,
      })),
    );
  });

  it("offers image upload controls only after a product exists", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    expect(screen.queryByLabelText("รูปสินค้า")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    expect(screen.getByLabelText("รูปสินค้า")).toHaveAttribute("accept", "image/jpeg,image/png");
    expect(screen.queryByText("บันทึกสินค้าแล้วจึงอัปโหลดรูปสินค้าได้")).not.toBeInTheDocument();
  });

  it("uploads a selected product image with the current product version", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);
    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    const file = new File(["image-bytes"], "cover.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText("รูปสินค้า"), file);
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));

    await waitFor(() => expect(mocks.uploadAdminProductImage).toHaveBeenCalledWith(product.id, file, product.version));
    expect(await screen.findByRole("status")).toHaveTextContent("อัปโหลดรูปสินค้าแล้ว");
  });

  it("confirms image removal before calling the versioned delete API", async () => {
    const user = userEvent.setup();
    const imageProduct = { ...product, hasImage: true, imageContentType: "image/jpeg" as const, imageSizeBytes: 123, imageWidth: 10, imageHeight: 10 };
    mocks.fetchAdminProducts.mockResolvedValue({ items: [imageProduct], total: 1 });
    render(<AdminProductsConsole />);
    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    await user.click(screen.getByRole("button", { name: "ลบรูปสินค้า" }));

    const confirmation = screen.getByRole("dialog", { name: "ยืนยันการลบรูปสินค้า" });
    await user.click(within(confirmation).getByRole("button", { name: "ลบรูปสินค้า" }));
    await waitFor(() => expect(mocks.deleteAdminProductImage).toHaveBeenCalledWith(product.id, product.version));
  });

  it("rejects a client-side image type outside the server allowlist", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);
    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    fireEvent.change(screen.getByLabelText("รูปสินค้า"), { target: { files: [new File(["gif"], "cover.gif", { type: "image/gif" })] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("รองรับเฉพาะ JPEG และ PNG");
    expect(mocks.uploadAdminProductImage).not.toHaveBeenCalled();
  });

  it("blocks product mutations while an image mutation is pending", async () => {
    const user = userEvent.setup();
    let resolveUpload: ((value: AdminProduct) => void) | undefined;
    mocks.uploadAdminProductImage.mockImplementation(() => new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    await user.upload(screen.getByLabelText("รูปสินค้า"), new File(["image-bytes"], "cover.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "กำลังอัปโหลด…" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกสินค้า" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ลบ สินค้า Phase 3" })).toBeDisabled();
    expect(screen.getByLabelText("รหัส URL")).toBeDisabled();

    resolveUpload?.({
      ...product,
      hasImage: true,
      imageContentType: "image/jpeg",
      imageSizeBytes: 123,
      imageWidth: 10,
      imageHeight: 10,
      version: 1,
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("อัปโหลดรูปสินค้าแล้ว"));
  });

  it("refreshes the product version before retrying an ambiguous image upload failure", async () => {
    const user = userEvent.setup();
    const latestProduct = {
      ...product,
      hasImage: true,
      imageContentType: "image/jpeg" as const,
      imageSizeBytes: 123,
      imageWidth: 10,
      imageHeight: 10,
      version: 1,
    };
    mocks.fetchAdminProducts.mockReset().mockResolvedValue({ items: [product], total: 1 });
    mocks.fetchAdminProduct.mockReset().mockResolvedValue(latestProduct);
    mocks.uploadAdminProductImage.mockReset()
      .mockRejectedValueOnce(new AdminProductsApiError(502, "Admin product service unavailable"))
      .mockResolvedValueOnce(latestProduct);
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    const file = new File(["image-bytes"], "cover.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("รูปสินค้า"), file);
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));

    await waitFor(() => expect(mocks.fetchAdminProduct).toHaveBeenCalledWith(product.id));
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));
    await waitFor(() => expect(mocks.uploadAdminProductImage).toHaveBeenLastCalledWith(product.id, file, 1));
  });

  it("ignores an in-flight stale product list after an image update", async () => {
    const user = userEvent.setup();
    const latestProduct = {
      ...product,
      hasImage: true,
      imageContentType: "image/jpeg" as const,
      imageSizeBytes: 123,
      imageWidth: 10,
      imageHeight: 10,
      version: 1,
    };
    const staleResolvers: Array<(value: { items: typeof product[]; total: number }) => void> = [];
    let fetchCount = 0;
    mocks.fetchAdminProducts.mockReset().mockImplementation(() => {
      fetchCount += 1;
      if (fetchCount === 1) return Promise.resolve({ items: [product], total: 1 });
      return new Promise((resolve) => staleResolvers.push(resolve));
    });
    mocks.uploadAdminProductImage.mockReset().mockResolvedValue(latestProduct);
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    await user.type(await screen.findByLabelText("ค้นหาสินค้า"), "stale");
    await user.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(staleResolvers).toHaveLength(2));

    const firstFile = new File(["first-image"], "first.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("รูปสินค้า"), firstFile);
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));
    await waitFor(() => expect(mocks.uploadAdminProductImage).toHaveBeenLastCalledWith(product.id, firstFile, 0));

    staleResolvers.forEach((resolve) => resolve({ items: [product], total: 1 }));
    await user.click(screen.getByRole("button", { name: "ปิดฟอร์มสินค้า" }));
    await user.click(screen.getByRole("button", { name: "แก้ไข สินค้า Phase 3" }));
    const secondFile = new File(["second-image"], "second.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("รูปสินค้า"), secondFile);
    await user.click(screen.getByRole("button", { name: "อัปโหลดรูปสินค้า" }));

    await waitFor(() => expect(mocks.uploadAdminProductImage).toHaveBeenLastCalledWith(product.id, secondFile, 1));
  });

  it("requires confirmation before hard-deleting a product", async () => {
    const user = userEvent.setup();
    render(<AdminProductsConsole />);

    await user.click(await screen.findByRole("button", { name: "ลบ สินค้า Phase 3" }));
    const confirmation = screen.getByRole("dialog", { name: "ยืนยันการลบสินค้า" });
    expect(confirmation).toHaveTextContent("สินค้า Phase 3");
    await user.click(within(confirmation).getByRole("button", { name: "ลบสินค้า" }));
    await waitFor(() =>
      expect(mocks.deleteAdminProduct).toHaveBeenCalledWith(product.id, product.version),
    );
  });
});
