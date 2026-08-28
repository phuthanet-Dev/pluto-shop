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
});
