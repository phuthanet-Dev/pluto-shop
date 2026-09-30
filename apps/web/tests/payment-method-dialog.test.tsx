import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Marketplace } from "@/components/marketplace";
import { useCartStore } from "@/stores/cart";
import { productResponse } from "./fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function authFetcher() {
  return vi.fn<typeof fetch>(async () =>
    new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          sub: "payment-method-user",
          email: "payment@example.invalid",
          name: "Payment User",
          roles: [],
        },
      }),
      { status: 200 },
    ),
  );
}

async function findPaymentMethodDialog() {
  return waitFor(() => {
    const title = screen.getByText("Choose a payment method");
    const dialog = title.closest('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error("Payment method dialog is not mounted");
    return dialog;
  });
}

describe("payment method dialog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-08-29T12:00:00+07:00"), shouldAdvanceTime: true });
    useCartStore.setState({
      cartIds: [1],
      quantities: { 1: 1 },
      mode: "guest",
      hasHydrated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the chooser and enables TrueMoney voucher redemption", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const paymentFetcher = vi.fn<typeof fetch>();
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/api/v1/products")) {
        return new Response(JSON.stringify(productResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );

    render(
      <Marketplace
        locale="en"
        trueWalletEnabled
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));

    const chooser = await findPaymentMethodDialog();
    const promptPay = within(chooser).getByRole("button", { name: "Pay with PromptPay" });
    const trueMoney = within(chooser).getByRole("button", { name: "Pay with TrueMoney Wallet" });

    expect(promptPay).toBeInTheDocument();
    expect(within(chooser).getByTestId("promptpay-logo")).toBeInTheDocument();
    expect(within(chooser).getByTestId("truemoney-logo")).toBeInTheDocument();
    expect(within(chooser).getByTestId("promptpay-logo").querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/promptpay-logo.svg"),
    );
    expect(within(chooser).getByTestId("truemoney-logo").querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/icons/truemoney-wallet.svg"),
    );
    expect(within(chooser).queryByText("Select how you want to pay for this order.")).not.toBeInTheDocument();
    expect(within(chooser).getByRole("button", { name: "Refund steps" })).toBeInTheDocument();
    await user.click(within(chooser).getByRole("button", { name: "Refund steps" }));
    const refundDialog = await screen.findByRole("dialog", { name: "Refund request steps" });
    expect(within(refundDialog).getAllByRole("listitem")).toHaveLength(3);
    expect(within(refundDialog).getByText(/Funds added to the system cannot be refunded/u)).toBeInTheDocument();
    await user.click(within(refundDialog).getByRole("button", { name: "Understood" }));
    await waitFor(() => expect(refundDialog).not.toBeVisible());
    expect(trueMoney).not.toBeDisabled();
    await user.click(trueMoney);
    expect(within(chooser).getByLabelText("TrueMoney voucher link")).toBeInTheDocument();
    expect(paymentFetcher).not.toHaveBeenCalled();
  });

  it("keeps TrueMoney unavailable when the server feature flag is false", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/api/v1/products")) {
        return new Response(JSON.stringify(productResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={vi.fn<typeof fetch>()}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    const trueMoney = within(chooser).getByRole("button", { name: "Pay with TrueMoney Wallet" });

    expect(trueMoney).toBeDisabled();
    expect(within(trueMoney).getByText("Unavailable")).toBeInTheDocument();
  });

  it.each([
    { locale: "th" as const, name: "หน้าชำระเงิน Phuto Shop TrueMoney Wallet", title: "เติมเงินด้วย TrueMoney Wallet" },
    { locale: "en" as const, name: "Phuto Shop TrueMoney Wallet payment", title: "Pay with TrueMoney Wallet" },
  ])("exposes the branded TrueMoney dialog accessible name in $locale", async ({ locale, name, title }) => {
    const activePaymentFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        paymentMethod: "TRUEWALLET",
        orderId: 19,
        transactionId: "tw-brand-review",
        amountMinor: 129900,
        currency: "THB",
        status: "REVIEW",
        message: "Payment requires manual review",
        qrUrl: null,
        payload: null,
        expiresAt: null,
      }), { status: 200 }),
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );

    render(
      <Marketplace
        locale={locale}
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={vi.fn<typeof fetch>()}
        activePaymentRecoveryEnabled
        activePaymentFetcher={activePaymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    // Wait for recovery to mount the real Radix dialog before checking its name.
    expect(await screen.findByText(title)).toBeVisible();
    const dialog = screen.getByRole("dialog", { name });
    expect(within(dialog).getByText(title, { exact: true })).toBeVisible();
  });

  it("keeps TrueMoney review state and cart lock after dismissing a recovered payment", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const activePaymentFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        paymentMethod: "TRUEWALLET",
        orderId: 19,
        transactionId: "tw-active-review",
        amountMinor: 129900,
        currency: "THB",
        status: "REVIEW",
        message: "Payment requires manual review",
        qrUrl: null,
        payload: null,
        expiresAt: null,
      }), { status: 200 }),
    );
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/api/v1/products")) {
        return new Response(JSON.stringify(productResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={vi.fn<typeof fetch>()}
        activePaymentRecoveryEnabled
        activePaymentFetcher={activePaymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    const paymentDialog = await screen.findByRole("dialog", { name: "Phuto Shop TrueMoney Wallet payment" });
    expect(within(paymentDialog).getByText("Payment requires manual review")).toBeInTheDocument();
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Close payment" }));
    await waitFor(() => expect(paymentDialog).not.toBeVisible());

    await user.click(screen.getByRole("button", { name: "Cart" }));
    expect(screen.getByText("This cart is temporarily locked while the payment is being checked. Wait for the result or contact support before editing it.")).toBeInTheDocument();
    expect(activePaymentFetcher).toHaveBeenCalledWith("/api/v1/payments/active", expect.objectContaining({ method: "GET" }));
  });

  it("renders the PromptPay QR payment card with amount, timer, and actions", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );
    const paymentFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment",
        amountMinor: 1098,
        currency: "THB",
        qrUrl: "https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
        payload: "000201010212",
        expiresAt: "2099-08-29T02:00:00Z",
        status: "PENDING",
      }), { status: 200 }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Phuto Shop PromptPay payment" });
    expect(paymentDialog.querySelector("img.payment-payee-logo")).toHaveAttribute(
      "src",
      expect.stringContaining("favicon.svg"),
    );
    const qrCode = within(paymentDialog).getByRole("img", { name: "PromptPay QR code" });
    expect(qrCode).toBeInTheDocument();
    expect(qrCode).not.toHaveClass("payment-qr-image-blurred");
    expect(qrCode).toHaveAttribute("loading", "eager");
    expect(within(paymentDialog).getByText("Amount due")).toBeInTheDocument();
    expect(within(paymentDialog).getByText(/10\.98/u)).toBeInTheDocument();
    const accountCard = within(paymentDialog).getByRole("region", { name: "PromptPay account verification" });
    expect(within(accountCard).getByText("ภูธเนศ สง่าชาติ")).toBeInTheDocument();
    expect(within(accountCard).getByText("0842191195")).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Copy payment payload" })).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Time remaining")).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Automatic status check every 5 seconds")).toBeInTheDocument();
    expect(within(paymentDialog).getByTestId("payment-countdown")).toHaveTextContent(/^\d{2}:\d{2}$/u);
    expect(within(paymentDialog).getByRole("button", { name: "Check payment" })).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Send for review instead" })).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Close payment" })).toBeInTheDocument();
    await user.click(within(paymentDialog).getByRole("button", { name: "Copy payment payload" }));
    await waitFor(() =>
      expect(within(paymentDialog).getByRole("button", { name: "Copy payment payload" })).toHaveTextContent("Copied"),
    );
    expect(writeText).toHaveBeenCalledWith("000201010212");

    paymentFetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment",
        amountMinor: 1098,
        currency: "THB",
        expiresAt: "2099-08-29T02:00:00Z",
        status: "REVIEW",
        message: "Cancellation requires provider reconciliation",
      }), { status: 200 }),
    );
    await user.click(within(paymentDialog).getByRole("button", { name: "Send for review instead" }));

    const confirmation = await screen.findByRole("dialog", { name: "Send payment for provider review?" });
    expect(within(confirmation).getByText(/provider reconciliation/u)).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "Send for review" }));

    await waitFor(() => {
      expect(paymentDialog.querySelector(".payment-state-card")).toHaveTextContent("Payment requires manual review");
    });
    expect(paymentDialog.querySelector(".payment-state-card p")).toBeNull();
    expect(within(paymentDialog).getByText("Payment requires manual review", { exact: true })).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("img", { name: "PromptPay QR code" })).not.toHaveClass("payment-qr-image-blurred");
    expect(paymentFetcher).toHaveBeenLastCalledWith("/api/v1/payments/promptpay/Market-test-payment/cancel", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(within(paymentDialog).getByRole("button", { name: "Check payment" })).toBeInTheDocument();
    expect(within(paymentDialog).queryByRole("button", { name: "Send for review instead" })).not.toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Close payment window" })).toBeInTheDocument();

    await user.click(within(paymentDialog).getByRole("button", { name: "Close payment window" }));
    await user.click(screen.getByRole("button", { name: "Cart" }));
    const lockedDrawer = screen.getByRole("dialog", { name: "Cart" });
    expect(within(lockedDrawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).toBeDisabled();
    expect(within(lockedDrawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).toBeDisabled();
  });

  it("offers a fresh login when checkout authorization expires", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );
    const paymentFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ type: "about:blank", title: "Unauthorized", status: 401 }), { status: 401 }),
    );

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    expect(await within(chooser).findByText("Your payment session expired. Please log in again.")).toBeInTheDocument();
    const reloginLink = within(chooser).getByRole("link", { name: "Log in" });
    expect(reloginLink).toHaveClass("payment-relogin-link");
    expect(reloginLink).toHaveAttribute(
      "href",
      "/api/auth/login?callbackUrl=%2Fen",
    );
  });

  it("blurs the QR code when payment status expires", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );
    const paymentFetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment-expired",
        amountMinor: 1098,
        currency: "THB",
        qrUrl: "https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
        payload: "000201010212",
        expiresAt: "2099-08-29T02:00:00Z",
        status: "PENDING",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment-expired",
        amountMinor: 1098,
        currency: "THB",
        expiresAt: "2026-08-29T02:00:00Z",
        status: "EXPIRED",
        message: "Payment QR code expired",
      }), { status: 200 }));

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Phuto Shop PromptPay payment" });
    await user.click(within(paymentDialog).getByRole("button", { name: "Check payment" }));

    expect(await within(paymentDialog).findByText("This QR code has expired")).toBeInTheDocument();
    expect(paymentDialog.querySelector("img.payment-qr-image")).toHaveClass("payment-qr-image-blurred");
  });

  it("locks cart editing while a PromptPay payment is pending", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const availableProduct = {
      ...productResponse.items[0],
      id: 2,
      slug: "nebula-glyphs",
      nameTh: "ชุดไอคอนเนบิวลา",
      nameEn: "Nebula Glyph Set",
      catalogOrder: 2,
    };
    const availableProductResponse = {
      ...productResponse,
      items: [...productResponse.items, availableProduct],
      total: 2,
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(availableProductResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );
    const paymentFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({
        orderId: 17,
        transactionId: "Market-test-payment-lock",
        amountMinor: 1098,
        currency: "THB",
        qrUrl: "https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
        payload: "000201010212",
        expiresAt: "2099-08-29T02:00:00Z",
        status: "PENDING",
      }), { status: 200 }),
    );

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Phuto Shop PromptPay payment" });
    await user.click(within(paymentDialog).getByRole("button", { name: "Close payment" }));
    await user.click(screen.getByRole("button", { name: "View details for Nebula Glyph Set" }));
    const productDialog = await screen.findByRole("dialog", { name: "Nebula Glyph Set" });
    expect(within(productDialog).getByRole("button", { name: "Add to cart" })).toBeDisabled();
    expect(within(productDialog).getByText("This cart is temporarily locked while the payment is being checked. Wait for the result or contact support before editing it.")).toBeInTheDocument();
    await user.click(within(productDialog).getByRole("button", { name: "Close details" }));
    await user.click(screen.getByRole("button", { name: "Cart" }));

    const lockedDrawer = screen.getByRole("dialog", { name: "Cart" });
    expect(await within(lockedDrawer).findByText("This cart is temporarily locked while the payment is being checked. Wait for the result or contact support before editing it.")).toBeInTheDocument();
    expect(within(lockedDrawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).toBeDisabled();
    expect(within(lockedDrawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).toBeDisabled();
    expect(paymentFetcher).toHaveBeenCalledTimes(1);
  });

  it("shows a sanitized gateway detail when checkout returns 502", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
    );
    const cartFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ items: [{ productId: 1, quantity: 1 }], removedProductIds: [], version: 1 }), {
        status: 200,
      }),
    );
    const paymentFetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Payment gateway unavailable",
          status: 502,
          detail: "Payment provider returned an incomplete response",
        }),
        { status: 502 },
      ),
    );

    render(
      <Marketplace
        locale="en"
        fetcher={fetcher}
        authFetcher={authFetcher()}
        cartFetcher={cartFetcher}
        paymentFetcher={paymentFetcher}
      />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Cart" }));
    const drawer = screen.getByRole("dialog", { name: "Cart" });
    await user.click(within(drawer).getByRole("button", { name: "Choose payment method" }));
    const chooser = await findPaymentMethodDialog();
    await user.click(within(chooser).getByRole("button", { name: "Pay with PromptPay" }));

    expect(await within(chooser).findByText("Payment provider returned an incomplete response")).toBeInTheDocument();
    expect(within(chooser).queryByText("Could not start payment. Please try again.")).not.toBeInTheDocument();
  });
});
