import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marketplace } from "@/components/marketplace";
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
    useCartStore.setState({ cartIds: [], hasHydrated: false });
    useCartStore.persist.clearStorage();
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

  it("shows the authenticated user and sign-out action after login", async () => {
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
    render(<Marketplace locale="en" fetcher={fetcher} authFetcher={authFetcher} />, { wrapper: Wrapper });

    expect(await screen.findByText("Dev User")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log out" })).toHaveAttribute(
      "href",
      "/logout?callbackUrl=%2Fen",
    );
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
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
    expect(within(dialog).getByText(/THB\s+1,299\.00/)).toBeInTheDocument();
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
