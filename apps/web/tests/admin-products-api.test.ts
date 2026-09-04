import { describe, expect, it, vi } from "vitest";

import {
  appendAdminMultiProduct,
  createAdminMultiProduct,
  deleteAdminProduct,
  deleteAdminProductImage,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchAdminMultiProduct,
  updateAdminMultiProductGroup,
  uploadAdminProductImage,
  type AdminProduct,
  type AdminProductWrite,
} from "@/lib/admin-products";

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

describe("admin products API client", () => {
  it("fetches a strict admin product list", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [product], total: 1 }), { status: 200 }),
    );

    await expect(fetchAdminProducts("phase3", fetcher)).resolves.toEqual({
      items: [product],
      total: 1,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products?q=phase3", {
      headers: { accept: "application/json" },
    });
  });

  it("accepts the product metadata used by the admin form", async () => {
    const metadataProduct = {
      ...product,
      shortDescriptionTh: "คำโปรยสั้น",
      shortDescriptionEn: "Short summary",
      deliveryType: "MANUAL",
      warrantyDays: 30,
      stockWarningThreshold: 2,
      status: "HIDDEN",
      sortOrder: 37,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [metadataProduct], total: 1 }), { status: 200 }),
    );

    await expect(fetchAdminProducts("", fetcher)).resolves.toEqual({
      items: [metadataProduct],
      total: 1,
    });
  });

  it("accepts safe image metadata without exposing a storage path", async () => {
    const imageProduct = {
      ...product,
      hasImage: true,
      imageContentType: "image/jpeg",
      imageSizeBytes: 1234,
      imageWidth: 640,
      imageHeight: 480,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [imageProduct], total: 1 }), { status: 200 }),
    );

    await expect(fetchAdminProducts("", fetcher)).resolves.toEqual({
      items: [imageProduct],
      total: 1,
    });
  });

  it("rejects inconsistent image metadata states", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        items: [{ ...product, hasImage: true }],
        total: 1,
      }), { status: 200 }),
    );

    await expect(fetchAdminProducts("", fetcher)).rejects.toThrow("response was invalid");

    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ ...product, hasImage: true, imageContentType: "image/jpeg" }],
      total: 1,
    }), { status: 200 }));
    await expect(fetchAdminProducts("", fetcher)).rejects.toThrow("response was invalid");
  });

  it("fetches one product by id for mutation reconciliation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(product), { status: 200 }),
    );

    await expect(fetchAdminProduct(product.id, fetcher)).resolves.toEqual(product);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/37", {
      headers: { accept: "application/json" },
    });
  });

  it("uploads an image as multipart FormData without setting the boundary", async () => {
    const file = new File(["synthetic image bytes"], "cover.jpg", { type: "image/jpeg" });
    const responseProduct = {
      ...product,
      hasImage: true,
      imageContentType: "image/jpeg",
      imageSizeBytes: file.size,
      imageWidth: 640,
      imageHeight: 480,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(responseProduct), { status: 200 }),
    );

    await expect(uploadAdminProductImage(product.id, file, product.version, fetcher)).resolves.toEqual(responseProduct);

    const [input, init] = fetcher.mock.calls[0];
    expect(input).toBe("/api/v1/admin/products/37/image?version=0");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ accept: "application/json" });
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toMatchObject({
      name: "cover.jpg",
      type: "image/jpeg",
    });
  });

  it("deletes an image with the optimistic-lock version", async () => {
    const responseProduct = {
      ...product,
      hasImage: false,
      imageContentType: null,
      imageSizeBytes: null,
      imageWidth: null,
      imageHeight: null,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(responseProduct), { status: 200 }),
    );

    await expect(deleteAdminProductImage(product.id, product.version, fetcher)).resolves.toEqual(responseProduct);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/37/image?version=0", {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
  });

  it("deletes with the server version and reports sanitized errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ type: "about:blank", title: "Product conflict", status: 409 }), {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
    );

    await expect(deleteAdminProduct(product.id, product.version, fetcher)).rejects.toMatchObject({
      status: 409,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/37?version=0", {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
  });

  it("accepts the empty 204 hard-delete response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteAdminProduct(product.id, product.version, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/37?version=0", {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
  });

  it("creates multiple multi-option children through the atomic admin endpoint", async () => {
    const first: AdminProductWrite = {
      slug: "phase3-multi-one",
      nameTh: "แพ็กเกจหนึ่ง",
      nameEn: "First package",
      shortDescriptionTh: "คำโปรยหนึ่ง",
      shortDescriptionEn: "First summary",
      descriptionTh: "รายละเอียดหนึ่ง",
      descriptionEn: "First details",
      selectionMode: "MULTI_OPTION",
      optionGroup: "phase3-multi",
      optionLabelTh: "แพ็กเกจหนึ่ง",
      optionLabelEn: "First package",
      priceMinor: 100,
      currency: "THB",
      stockQuantity: 3,
      deliveryType: "INSTANT",
      warrantyDays: 0,
      stockWarningThreshold: 1,
      status: "ACTIVE",
      sortOrder: 501,
      version: 0,
    };
    const second = { ...first, slug: "phase3-multi-two", nameTh: "แพ็กเกจสอง", nameEn: "Second package", optionLabelTh: "แพ็กเกจสอง", optionLabelEn: "Second package", sortOrder: 502 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [product, { ...product, id: 38, slug: second.slug }], total: 2 }), { status: 201 }),
    );

    await expect(createAdminMultiProduct([first, second], fetcher, {
      nameTh: "แพ็กเกจรวม",
      nameEn: "Shared package",
      shortDescriptionTh: "คำโปรยรวม",
      shortDescriptionEn: "Shared summary",
      version: 0,
    })).resolves.toMatchObject({ total: 2 });
    expect(fetcher).toHaveBeenCalledWith("/api/v1/admin/products/multi", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        group: {
          nameTh: "แพ็กเกจรวม",
          nameEn: "Shared package",
          shortDescriptionTh: "คำโปรยรวม",
          shortDescriptionEn: "Shared summary",
          version: 0,
        },
        items: [first, second],
      }),
    });
  });

  it("reads and updates an existing multi-option group, then appends a child atomically", async () => {
    const group = {
      optionGroup: "phase3-multi",
      nameTh: "แพ็กเกจรวม",
      nameEn: "Shared package",
      shortDescriptionTh: "คำโปรยรวม",
      shortDescriptionEn: "Shared summary",
      updatedAt: "2026-08-25T14:00:00Z",
      updatedBy: "admin-subject",
      version: 0,
      items: [product],
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(group), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...group, version: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [product], total: 1 }), { status: 201 }));

    await expect(fetchAdminMultiProduct("phase3-multi", fetcher)).resolves.toEqual(group);
    await expect(updateAdminMultiProductGroup("phase3-multi", { ...group, version: 0 }, fetcher)).resolves.toMatchObject({ version: 1 });
    const child: AdminProductWrite = {
      slug: "phase3-multi-three",
      nameTh: "แพ็กเกจรวม",
      nameEn: "Shared package",
      shortDescriptionTh: "คำโปรยรวม",
      shortDescriptionEn: "Shared summary",
      descriptionTh: "รายละเอียด",
      descriptionEn: "Details",
      selectionMode: "MULTI_OPTION",
      optionGroup: "phase3-multi",
      optionLabelTh: "สาม",
      optionLabelEn: "Three",
      priceMinor: 300,
      currency: "THB",
      stockQuantity: 3,
      deliveryType: "INSTANT",
      warrantyDays: 0,
      stockWarningThreshold: 1,
      status: "ACTIVE",
      sortOrder: 503,
      version: 0,
    };
    await expect(appendAdminMultiProduct("phase3-multi", [child], { ...group, version: 1 }, fetcher)).resolves.toMatchObject({ total: 1 });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/v1/admin/products/multi/phase3-multi", {
      headers: { accept: "application/json" },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/v1/admin/products/multi/phase3-multi", expect.objectContaining({ method: "PATCH" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/v1/admin/products/multi/phase3-multi/children", expect.objectContaining({ method: "POST" }));
  });

  it("reads a group containing children from multiple append batches", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      ...product,
      id: index + 1,
      slug: `phase3-multi-${index + 1}`,
      optionGroup: "phase3-multi",
      selectionMode: "MULTI_OPTION" as const,
      optionLabelTh: `ตัวเลือก ${index + 1}`,
      optionLabelEn: `Option ${index + 1}`,
    }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        optionGroup: "phase3-multi",
        nameTh: "แพ็กเกจรวม",
        nameEn: "Shared package",
        shortDescriptionTh: "คำโปรยรวม",
        shortDescriptionEn: "Shared summary",
        updatedAt: "2026-08-25T14:00:00Z",
        updatedBy: "admin-subject",
        version: 1,
        items,
      }), { status: 200 }),
    );

    await expect(fetchAdminMultiProduct("phase3-multi", fetcher)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: 101 })]),
    });
  });
});
