import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    useCartStore.setState({
      cartIds: [1],
      quantities: { 1: 1 },
      mode: "guest",
      hasHydrated: true,
    });
  });

  it("opens the chooser and keeps TrueMoney disabled until its contract is verified", async () => {
    const user = userEvent.setup();
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
    const trueMoney = within(chooser).getByRole("button", { name: "TrueMoney Wallet" });

    expect(promptPay).toBeInTheDocument();
    expect(trueMoney).toBeDisabled();
    expect(within(chooser).queryByLabelText("TrueMoney voucher link")).not.toBeInTheDocument();
    expect(paymentFetcher).not.toHaveBeenCalled();
  });

  it("renders the PromptPay QR payment card with amount, timer, and actions", async () => {
    const user = userEvent.setup();
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

    const paymentDialog = await screen.findByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    const qrCode = within(paymentDialog).getByRole("img", { name: "PromptPay QR code" });
    expect(qrCode).toBeInTheDocument();
    expect(qrCode).toHaveAttribute("loading", "eager");
    expect(within(paymentDialog).getByText("Amount due")).toBeInTheDocument();
    expect(within(paymentDialog).getByText(/10\.98/u)).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Copy payment payload" })).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Time remaining")).toBeInTheDocument();
    expect(within(paymentDialog).getByText("Automatic status check every 5 seconds")).toBeInTheDocument();
    expect(within(paymentDialog).getByTestId("payment-countdown")).toHaveTextContent(/^\d{2}:\d{2}$/u);
    expect(within(paymentDialog).getByRole("button", { name: "Check payment" })).toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Cancel payment" })).toBeInTheDocument();
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
        status: "CANCELLED",
        message: "Payment cancelled",
      }), { status: 200 }),
    );
    await user.click(within(paymentDialog).getByRole("button", { name: "Cancel payment" }));

    const confirmation = await screen.findByRole("dialog", { name: "Cancel payment?" });
    expect(within(confirmation).getByText(/stop checking this QR/u)).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => {
      expect(paymentDialog.querySelector(".payment-state-card")).toHaveTextContent("Payment cancelled");
    });
    expect(paymentFetcher).toHaveBeenLastCalledWith("/api/v1/payments/promptpay/Market-test-payment/cancel", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(within(paymentDialog).queryByRole("button", { name: "Cancel payment" })).not.toBeInTheDocument();
    expect(within(paymentDialog).getByRole("button", { name: "Close payment window" })).toBeInTheDocument();

    await user.click(within(paymentDialog).getByRole("button", { name: "Close payment window" }));
    await user.click(screen.getByRole("button", { name: "Cart" }));
    const unlockedDrawer = screen.getByRole("dialog", { name: "Cart" });
    expect(within(unlockedDrawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).not.toBeDisabled();
    expect(within(unlockedDrawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).not.toBeDisabled();
  });

  it("offers a fresh login when checkout authorization expires", async () => {
    const user = userEvent.setup();
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
    expect(within(chooser).getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/api/auth/login?callbackUrl=%2Fen",
    );
  });

  it("locks cart editing while a PromptPay payment is pending", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(productResponse), { status: 200 }),
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

    const paymentDialog = await screen.findByRole("dialog", { name: "Pluto Shop PromptPay payment" });
    await user.click(within(paymentDialog).getByRole("button", { name: "Close payment" }));
    await user.click(screen.getByRole("button", { name: "Cart" }));

    const lockedDrawer = screen.getByRole("dialog", { name: "Cart" });
    expect(await within(lockedDrawer).findByText("This cart is locked while the current QR payment is pending. Cancel the payment before editing your cart.")).toBeInTheDocument();
    expect(within(lockedDrawer).getByRole("button", { name: "Increase Pluto Glyph Set quantity" })).toBeDisabled();
    expect(within(lockedDrawer).getByRole("button", { name: "Remove Pluto Glyph Set from cart" })).toBeDisabled();
    expect(paymentFetcher).toHaveBeenCalledTimes(1);
  });

  it("shows a sanitized gateway detail when checkout returns 502", async () => {
    const user = userEvent.setup();
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
