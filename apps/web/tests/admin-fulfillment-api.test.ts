import { describe, expect, it, vi } from "vitest";

import {
  fetchAdminInventory,
  revealAdminInventory,
} from "@/lib/admin-fulfillment";

describe("admin fulfillment API contract", () => {
  it("rejects an inventory list that contains secret storage fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 1,
        fulfillmentType: "LICENSE_KEY",
        provider: "SYNTHETIC",
        payloadSchemaVersion: 1,
        status: "AVAILABLE",
        publicMetadata: {},
        expiresAt: null,
        reservedUntil: null,
        deliveredAt: null,
        createdAt: "2026-08-30T00:00:00Z",
        secretCiphertext: "must-not-be-here",
      }],
      total: 1,
      available: 1,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(fetchAdminInventory(37, fetcher)).rejects.toThrow("response was invalid");
  });

  it("uses the explicit reveal route only for an authorized action", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      inventoryItemId: 11,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      fields: { licenseKey: "synthetic-license" },
    }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }));

    await revealAdminInventory(37, 11, "INVENTORY_AUDIT", fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/admin/products/37/fulfillment/inventory/11/reveal",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
