import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marketplace, productDisplayKey } from "@/components/marketplace";
import { useCartStore } from "@/stores/cart";
import { productResponse } from "./fixtures";

let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => search,
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const fetcher = vi.fn<typeof fetch>();

describe("cart and product details", () => {
  beforeEach(() => {
    search = new URLSearchParams();
    fetcher.mockReset();
    fetcher.mockImplementation(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    useCartStore.setState({ cartIds: [], quantities: {}, mode: "guest", hasHydrated: false });
    useCartStore.persist.clearStorage();
  });

  it("keeps product-card keys unique across single products and option groups", () => {
    expect(productDisplayKey({ id: 37, selectionMode: "SINGLE_OPTION", optionGroup: null })).toBe("single:37");
    expect(productDisplayKey({ id: 37, selectionMode: "MULTI_OPTION", optionGroup: "37" })).toBe("multi:37");
  });

  it("hydrates a persisted cart and shows it in an accessible cart drawer", async () => {
    window.localStorage.setItem(
      "pluto-shop-cart",
      JSON.stringify({ state: { cartIds: [1] }, version: 0 }),
    );
    const user = userEvent.setup();

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    await screen.findByText("Pluto Glyph Set");
    expect(screen.queryByRole("button", { name: /favorite/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cart" }));

    const drawer = screen.getByRole("dialog", { name: "Cart" });
    expect(
      await within(drawer).findByText("Pluto Glyph Set"),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" }),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" }),
    ).toBeInTheDocument();
    await user.click(
      within(drawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" }),
    );
    expect(within(drawer).getByText("×2")).toBeInTheDocument();
    expect(within(drawer).getByTestId("cart-line-total")).toHaveTextContent(/THB\s+2,598\.00/);
    expect(within(drawer).getByTestId("cart-total")).toHaveTextContent(/THB\s+2,598\.00/);

    await user.click(within(drawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" }));
    await waitFor(() =>
      expect(within(drawer).getByText("Your cart is empty.")).toBeInTheDocument(),
    );
  });

  it("shows the empty cart message immediately when there are no items", async () => {
    const user = userEvent.setup();

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });
    await screen.findByText("Pluto Glyph Set");

    await user.click(screen.getByRole("button", { name: "Cart" }));

    const drawer = screen.getByRole("dialog", { name: "Cart" });
    expect(within(drawer).getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("groups authenticated account actions in an accessible dropdown", async () => {
    const user = userEvent.setup();
    const authFetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            sub: "user-1",
            email: "dev@example.com",
            name: "Dev User",
            roles: ["CUSTOMER"],
          },
        }),
        { status: 200 },
      ),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [], removedProductIds: [], version: 0 }), { status: 200 }),
    );
    render(
      <Marketplace locale="en" fetcher={fetcher} authFetcher={authFetcher} cartFetcher={cartFetcher} />,
      { wrapper: Wrapper },
    );

    const accountTrigger = await screen.findByRole("button", {
      name: "Account menu for Dev User",
    });
    expect(within(accountTrigger).getByText("Dev", { selector: ".account-trigger-label" })).toBeInTheDocument();
    expect(
      within(accountTrigger).queryByText("Dev User", { selector: ".account-trigger-label" }),
    ).not.toBeInTheDocument();
    expect(accountTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(cartFetcher).toHaveBeenCalledWith("/api/v1/cart", {
        headers: { accept: "application/json" },
      }),
    );
    await user.click(accountTrigger);

    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(menu).toBeInTheDocument();
    expect(document.querySelector(".account-summary strong")).toHaveTextContent("Dev User");
    expect(within(menu).getByRole("menuitem", { name: "Log out" })).toHaveAttribute(
      "href",
      "/api/auth/logout?callbackUrl=%2Fen",
    );
    expect(within(menu).getByRole("menuitem", { name: "เปลี่ยนเป็นภาษาไทย" })).toHaveAttribute(
      "href",
      "/th",
    );
    expect(document.querySelector(".locale-switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(accountTrigger).toHaveFocus();
  });

  it("keeps guest login actions inside the account dropdown", async () => {
    const user = userEvent.setup();
    const authFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
    );

    render(<Marketplace locale="en" fetcher={fetcher} authFetcher={authFetcher} />, {
      wrapper: Wrapper,
    });

    const accountTrigger = await screen.findByRole("button", { name: "Account menu" });
    accountTrigger.focus();
    await user.keyboard("{Enter}");

    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(menu).getByRole("menuitem", { name: "Log in" })).toHaveAttribute(
      "href",
      "/api/auth/login?callbackUrl=%2Fen",
    );
    expect(within(menu).getByRole("menuitem", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/api/auth/signup?callbackUrl=%2Fen",
    );
    expect(within(menu).getByRole("menuitem", { name: "Log in" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: "Sign up" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(within(menu).getByRole("menuitem", { name: "เปลี่ยนเป็นภาษาไทย" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(accountTrigger).toHaveFocus();
  });

  it("keeps the admin console link inside the account dropdown for admins", async () => {
    const user = userEvent.setup();
    const authFetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            sub: "admin-1",
            email: "admin@example.com",
            name: "Admin User",
            roles: ["ADMIN"],
          },
        }),
        { status: 200 },
      ),
    );

    render(<Marketplace locale="en" fetcher={fetcher} authFetcher={authFetcher} />, {
      wrapper: Wrapper,
    });

    const accountTrigger = await screen.findByRole("button", {
      name: "Account menu for Admin User",
    });
    await user.click(accountTrigger);

    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(menu).getByRole("menuitem", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("starts PromptPay checkout from an authenticated cart and shows the QR dialog", async () => {
    const user = userEvent.setup();
    const authFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({
        authenticated: true,
        user: { sub: "payment-user", email: "payment@example.invalid", name: "Payment User", roles: ["CUSTOMER"] },
      }), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), { status: 200 }),
    );
    const paymentFetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment",
        amountMinor: 129900,
        currency: "THB",
        qrUrl: "https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
        payload: "000201010212",
        expiresAt: "2026-08-29T02:00:00Z",
        status: "PENDING",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment",
        amountMinor: 129900,
        currency: "THB",
        expiresAt: "2026-08-29T02:00:00Z",
        status: "PAID",
        message: "Payment completed",
      }), { status: 200 }));
    useCartStore.setState({ cartIds: [1], quantities: { "1": 1 }, mode: "account", hasHydrated: true });

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await screen.findByText("Pluto Glyph Set");
    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    expect(await within(drawer).findByText("Pluto Glyph Set")).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooserTitle = await screen.findByText("Choose a payment method");
    const chooser = chooserTitle.closest('[role="dialog"]');
    if (!(chooser instanceof HTMLElement)) throw new Error("Payment method dialog is not mounted");
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    expect(within(paymentDialog).getByRole("img", { name: "PromptPay QR code" })).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Market-test-payment")).toBeInTheDocument();
    expect(paymentFetcher).toHaveBeenCalledWith("/api/v1/checkout/promptpay", expect.objectContaining({ method: "POST" }));
    await user.click(within(paymentDialog).getByRole("button", { name: "Check payment" }));
    expect(await within(paymentDialog).findByRole("status")).toHaveTextContent("Payment completed");
    expect(useCartStore.getState().cartIds).toEqual([]);
  });

  it("does not show the bundle type label on product cards", async () => {
    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    await screen.findByText("Pluto Glyph Set");

    expect(document.querySelectorAll(".type-badge")).toHaveLength(0);
  });

  it("gives the mobile filter close button a localized filter label", async () => {
    const user = userEvent.setup();

    render(<Marketplace locale="th" fetcher={fetcher} />, { wrapper: Wrapper });
    await screen.findByText("ชุดไอคอนพลูโต");

    await user.click(screen.getByRole("button", { name: "ตัวกรอง" }));

    const drawer = screen.getByRole("dialog", { name: "ตัวกรอง" });
    expect(
      within(drawer).getByRole("button", { name: "ปิดตัวกรอง" }),
    ).toBeInTheDocument();
  });

  it("opens an Escape-closeable detail dialog with a cart action", async () => {
    const user = userEvent.setup();
    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    await screen.findByText("Pluto Glyph Set");
    const detailButton = screen.getByRole("button", {
      name: "View details for Pluto Glyph Set",
    });
    await user.click(detailButton);
    const dialog = screen.getByRole("dialog", { name: "Pluto Glyph Set" });
    expect(within(dialog).queryByText("SINGLE")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Icons for creative work")).toBeInTheDocument();
    expect(within(dialog).getByText(/THB\s+1,299\.00/, { selector: ".dialog-price" })).toBeInTheDocument();
    const quantity = within(dialog).getByRole("spinbutton", {
      name: "Quantity for Pluto Glyph Set",
    });
    expect(quantity).toHaveValue(1);
    expect(quantity).toHaveAttribute("max", "8");
    expect(within(dialog).getByTestId("detail-total")).toHaveTextContent(/THB\s+1,299\.00/);
    await user.click(
      within(dialog).getByRole("button", { name: "Increase Pluto Glyph Set quantity" }),
    );
    expect(quantity).toHaveValue(2);
    expect(within(dialog).getByTestId("detail-total")).toHaveTextContent(/THB\s+2,598\.00/);
    await user.clear(quantity);
    await user.type(quantity, "99");
    expect(quantity).toHaveValue(8);
    expect(within(dialog).getByTestId("detail-total")).toHaveTextContent(/THB\s+10,392\.00/);
    expect(
      within(dialog).getByRole("button", { name: "Increase Pluto Glyph Set quantity" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Add to cart" }));
    expect(within(dialog).getByRole("button", { name: "In cart" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Pluto Glyph Set" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Cart" }));
    expect(
      within(screen.getByRole("dialog", { name: "Cart" })).getByText("Pluto Glyph Set"),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Cart" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Cart" })).toHaveFocus();
  });

  it("opens an option chooser before detail for a multi-option product group", async () => {
    const user = userEvent.setup();
    const optionResponse = {
      ...productResponse,
      items: [
        {
          ...productResponse.items[0],
          id: 101,
          slug: "claude-full-access-1-day",
          nameTh: "Claude (Full Access)",
          nameEn: "Claude (Full Access)",
          descriptionTh: "เข้าถึง Claude แบบเต็มรูปแบบ",
          descriptionEn: "Full Claude access",
          shortDescriptionEn: "One-day access with its own delivery details",
          visualCode: "CLAUDE-FA",
          priceMinor: 232,
          stockQuantity: 137,
          selectionMode: "MULTI_OPTION",
          optionGroup: "claude-full-access",
          optionLabelTh: "Claude FA Unlimited [1 วัน]",
          optionLabelEn: "Claude FA Unlimited [1 Day]",
        },
        {
          ...productResponse.items[0],
          id: 102,
          slug: "claude-full-access-7-days",
          nameTh: "Claude (Full Access)",
          nameEn: "Claude (Full Access)",
          descriptionTh: "เข้าถึง Claude แบบเต็มรูปแบบ",
          descriptionEn: "Seven-day Claude access",
          shortDescriptionEn: "Seven-day access with its own delivery details",
          visualCode: "CLAUDE-FA",
          priceMinor: 847,
          stockQuantity: 13,
          selectionMode: "MULTI_OPTION",
          optionGroup: "claude-full-access",
          optionLabelTh: "Claude FA Unlimited [7 วัน]",
          optionLabelEn: "Claude FA Unlimited [7 Days]",
        },
        {
          ...productResponse.items[0],
          id: 103,
          slug: "claude-full-access-1-month",
          nameTh: "Claude (Full Access)",
          nameEn: "Claude (Full Access)",
          descriptionTh: "เข้าถึง Claude แบบเต็มรูปแบบ",
          descriptionEn: "Full Claude access",
          visualCode: "CLAUDE-FA",
          priceMinor: 1847,
          stockQuantity: 16,
          selectionMode: "MULTI_OPTION",
          optionGroup: "claude-full-access",
          optionLabelTh: "Claude FA Unlimited [1 เดือน]",
          optionLabelEn: "Claude FA Unlimited [1 Month]",
        },
      ],
      total: 3,
    } as unknown as typeof productResponse;
    fetcher.mockImplementation(async () => new Response(JSON.stringify(optionResponse), { status: 200 }));

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    await screen.findByText("Claude (Full Access)");
    await user.click(screen.getByRole("button", { name: "View details for Claude (Full Access)" }));

    const chooser = screen.getByRole("dialog", { name: "Claude (Full Access)" });
    expect(within(chooser).getByText(/3 products/)).toBeInTheDocument();
    const sevenDayChoice = within(chooser).getByRole("button", { name: "Claude FA Unlimited [7 Days]" });
    expect(sevenDayChoice).toHaveAttribute("aria-describedby", "option-description-102");
    expect(within(chooser).getByText("Seven-day access with its own delivery details")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Claude FA Unlimited [7 Days]" })).not.toBeInTheDocument();

    await user.click(sevenDayChoice);
    expect(await screen.findByRole("dialog", { name: "Claude FA Unlimited [7 Days]" })).toBeInTheDocument();
  });

  it("resolves cart IDs from the unfiltered API when active filters hide them", async () => {
    search = new URLSearchParams("q=motion");
    window.localStorage.setItem(
      "pluto-shop-cart",
      JSON.stringify({ state: { cartIds: [1] }, version: 0 }),
    );
    const motionProduct = {
      ...productResponse.items[0],
      id: 2,
      slug: "orbit-motion-kit",
      nameEn: "Orbit Motion Kit",
      nameTh: "ชุดโมชั่นออร์บิท",
      visualCode: "ORBIT-02",
      catalogOrder: 2,
    };
    const unfiltered = {
      items: [productResponse.items[0], motionProduct],
      total: 2,
      priceRange: productResponse.priceRange,
    };
    const filtered = {
      items: [motionProduct],
      total: 1,
      priceRange: productResponse.priceRange,
    };
    fetcher.mockImplementation(async (input) =>
      new Response(
        JSON.stringify(
          String(input).includes("q=motion") ? filtered : unfiltered,
        ),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });
    expect(await screen.findByText("Orbit Motion Kit")).toBeInTheDocument();
    expect(screen.queryByText("Pluto Glyph Set")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    expect(await within(drawer).findByText("Pluto Glyph Set")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/products",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
