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

  it.each([["th", "อีเมล / รหัสผ่าน"], ["en", "Email / password"]])("shows generic received-data wording in %s without revealing secrets", async (locale, label) => {
    const fixture = await api.fetchCustomerFulfillment();
    api.fetchCustomerFulfillment.mockResolvedValue({ ...fixture, lines: [{ ...fixture.lines[0], fulfillmentType: "DISCORD_ACCOUNT", customerSteps: [] }] });
    api.revealCustomerFulfillment.mockResolvedValue({
      inventoryItemId: 44, fulfillmentType: "DISCORD_ACCOUNT", provider: "SYNTHETIC",
      fields: { email: "synthetic@example.invalid", password: "synthetic-password" },
    });
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<CustomerFulfillmentPanel orderId={91} locale={locale} />);
    expect(await screen.findByText(label)).toBeVisible();
    expect(container).not.toHaveTextContent(/discord/i);
    expect(screen.queryByText("synthetic-password")).not.toBeInTheDocument();
    expect(api.revealCustomerFulfillment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: locale === "th" ? "เปิดเผยข้อมูลสินค้า 92" : "Reveal item data 92" }));
    expect(await screen.findByText("synthetic-password")).toBeVisible();
    expect(screen.getByText("synthetic@example.invalid")).toBeVisible();
    expect(api.revealCustomerFulfillment).toHaveBeenCalledWith(91, 92);
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
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
