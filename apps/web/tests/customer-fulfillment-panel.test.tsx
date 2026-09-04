import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  fetchCustomerFulfillment: vi.fn(),
  revealCustomerFulfillment: vi.fn(),
}));

vi.mock("@/lib/admin-fulfillment", () => api);

import { CustomerFulfillmentPanel } from "@/components/customer-fulfillment-panel";

describe("CustomerFulfillmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchCustomerFulfillment.mockResolvedValue({
      orderId: 91,
      orderStatus: "PAID",
      lines: [{
        orderItemId: 92,
        productId: 37,
        fulfillmentType: "LICENSE_KEY",
        deliveryType: "INSTANT",
        status: "READY",
        revealAvailable: true,
        customerSteps: [{
          id: 1,
          stepOrder: 1,
          audience: "CUSTOMER",
          titleTh: "เปิดหน้า activation",
          titleEn: "Open activation",
          bodyTh: "ใช้ license ที่ได้รับ",
          bodyEn: "Use the delivered license",
          linkUrl: null,
          enabled: true,
        }],
      }],
    });
    api.revealCustomerFulfillment.mockResolvedValue({
      inventoryItemId: 44,
      fulfillmentType: "LICENSE_KEY",
      provider: "SYNTHETIC",
      fields: { licenseKey: "synthetic-license" },
    });
  });

  it("does not render secret fields until the customer explicitly reveals them", async () => {
    render(<CustomerFulfillmentPanel orderId={91} locale="th" />);

    expect(await screen.findByText("เปิดหน้า activation")).toBeInTheDocument();
    expect(screen.queryByText("synthetic-license")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เปิดเผยข้อมูลสินค้า 92" }));

    await waitFor(() => expect(screen.getByText("synthetic-license")).toBeInTheDocument());
    expect(api.revealCustomerFulfillment).toHaveBeenCalledWith(91, 92);
  });
});
