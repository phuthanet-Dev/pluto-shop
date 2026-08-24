import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Marketplace } from "@/components/marketplace";
import { productResponse } from "./fixtures";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("marketplace querying", () => {
  beforeEach(() => {
    search = new URLSearchParams();
    replace.mockReset();
    document.documentElement.lang = "en";
  });

  it("shows loading feedback then debounces search into the URL and API", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify(productResponse), { status: 200 }),
      );
    const user = userEvent.setup();

    const { rerender } = render(
      <Marketplace locale="en" fetcher={fetcher} />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByRole("status", { name: "Loading products" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Pluto Glyph Set")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search assets" }), "icons");

    expect(replace).not.toHaveBeenCalled();
    await waitFor(
      () =>
        expect(replace).toHaveBeenLastCalledWith("/en?q=icons", {
          scroll: false,
        }),
      { timeout: 1_000 },
    );

    search = new URLSearchParams("q=icons");
    rerender(<Marketplace locale="en" fetcher={fetcher} />);
    await waitFor(() =>
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/v1/products?q=icons",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("uses changed URL filters for the API, form, brand, and reset navigation", async () => {
    search = new URLSearchParams(
      "q=icons&maxPriceMinor=50000&inStock=true&ref=history",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify(productResponse), { status: 200 }),
      );
    const user = userEvent.setup();

    const { rerender } = render(
      <Marketplace locale="en" fetcher={fetcher} />,
      { wrapper: Wrapper },
    );

    expect(await screen.findByRole("searchbox", { name: "Search assets" })).toHaveValue(
      "icons",
    );
    expect(
      screen.getByRole("textbox", { name: "Maximum price (THB)" }),
    ).toHaveValue("500");
    expect(screen.getByRole("checkbox", { name: "In stock only" })).toBeChecked();
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/v1/products?q=icons&maxPriceMinor=50000&inStock=true",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    search = new URLSearchParams("q=motion&maxPriceMinor=129900&ref=history");
    rerender(<Marketplace locale="en" fetcher={fetcher} />);

    await waitFor(() => {
      expect(screen.getByRole("searchbox", { name: "Search assets" })).toHaveValue(
        "motion",
      );
      expect(
        screen.getByRole("textbox", { name: "Maximum price (THB)" }),
      ).toHaveValue("1299");
      expect(screen.getByRole("checkbox", { name: "In stock only" })).not.toBeChecked();
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/v1/products?q=motion&maxPriceMinor=129900",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(screen.getByRole("link", { name: "Pluto Shop home" })).toHaveAttribute(
      "href",
      "/en",
    );
    await user.click(
      screen.getByRole("button", { name: "Reset toolbar filters" }),
    );
    expect(replace).toHaveBeenLastCalledWith("/en?ref=history", { scroll: false });
  });

  it("updates the document language and skip link on a client locale rerender", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify(productResponse), { status: 200 }),
      );

    const { rerender } = render(
      <Marketplace locale="en" fetcher={fetcher} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(document.documentElement).toHaveAttribute("lang", "en");

    rerender(<Marketplace locale="th" fetcher={fetcher} />);

    expect(
      screen.getByRole("link", { name: "ข้ามไปยังเนื้อหา" }),
    ).toHaveAttribute("href", "#main-content");
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute("lang", "th"),
    );
  });

  it("validates price and applies price/stock filters to the URL and API", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify(productResponse), { status: 200 }),
      );
    const user = userEvent.setup();

    const { rerender } = render(
      <Marketplace locale="en" fetcher={fetcher} />,
      { wrapper: Wrapper },
    );
    await screen.findByText("Pluto Glyph Set");

    await user.type(
      screen.getByRole("textbox", { name: "Maximum price (THB)" }),
      "-1",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("Enter a valid price")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    const price = screen.getByRole("textbox", { name: "Maximum price (THB)" });
    await user.clear(price);
    await user.type(price, "500");
    await user.click(screen.getByRole("checkbox", { name: "In stock only" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/en?maxPriceMinor=50000&inStock=true",
      { scroll: false },
    );

    search = new URLSearchParams("maxPriceMinor=50000&inStock=true");
    rerender(<Marketplace locale="en" fetcher={fetcher} />);
    await waitFor(() => {
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/v1/products?maxPriceMinor=50000&inStock=true",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("shows a meaningful empty state whose reset keeps the locale path", async () => {
    search = new URLSearchParams("q=missing");
    const emptyResponse = {
      items: [],
      total: 0,
      priceRange: { minMinor: 0, maxMinor: 0, currency: "THB" },
    } as const;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(emptyResponse), { status: 200 }),
      );
    const user = userEvent.setup();

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    expect(
      await screen.findByRole("heading", { name: "No assets match" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(replace).toHaveBeenLastCalledWith("/en", { scroll: false });
  });

  it("explains API failures and retries the real request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(productResponse), { status: 200 }),
      );
    const user = userEvent.setup();

    render(<Marketplace locale="en" fetcher={fetcher} />, { wrapper: Wrapper });

    expect(
      await screen.findByRole("alert", { name: "Could not load products" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Pluto Glyph Set")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
