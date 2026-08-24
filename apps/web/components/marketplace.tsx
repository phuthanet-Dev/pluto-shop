"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatThb, getLocaleSwitchHref } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { fetchAuthSession } from "@/lib/auth-client";
import {
  fetchProducts,
  productDescription,
  productName,
} from "@/lib/products";
import type { Product } from "@/lib/products";
import type { Filters } from "@/lib/url-filters";
import {
  filterFormSchema,
  getFilterHref,
  parseFilters,
} from "@/lib/url-filters";
import { useCartStore } from "@/stores/cart";

type MarketplaceProps = {
  locale: Locale;
  fetcher?: typeof fetch;
  authFetcher?: typeof fetch;
};

type SearchForm = {
  q: string;
  maxPrice: string;
  inStock: boolean;
};

const searchSchema = z.string().trim().max(120);
const emptyFilters: Filters = {
  q: "",
  maxPriceMinor: undefined,
  inStock: false,
};

const copyByLocale = {
  th: {
    explore: "สำรวจ",
    introduction:
      "สินทรัพย์ดิจิทัลคัดสรรสำหรับนักออกแบบ นักพัฒนา และนักเล่าเรื่อง",
    loading: "กำลังโหลดสินค้า",
    search: "ค้นหาสินทรัพย์",
    searchPlaceholder: "ค้นหาไอคอน เทมเพลต โมชั่น…",
    filters: "ตัวกรอง",
    maxPrice: "ราคาสูงสุด (THB)",
    maxPriceHint: "ระบุราคาเป็นบาท",
    inStock: "เฉพาะสินค้าที่มี",
    apply: "ใช้ตัวกรอง",
    cart: "รถเข็น",
    cartDescription: "สินค้าที่คุณเลือกไว้",
    cartLoading: "กำลังโหลดรถเข็น",
    cartError: "ไม่สามารถโหลดรถเข็นได้",
    closeCart: "ปิดรถเข็น",
    cartEmpty: "รถเข็นยังว่างอยู่",
    removeFromCart: (name: string) => `นำ ${name} ออกจากรถเข็น`,
    addToCart: "เพิ่มลงรถเข็น",
    inCart: "อยู่ในรถเข็น",
    login: "เข้าสู่ระบบ",
    signup: "สมัครสมาชิก",
    logout: "ออกจากระบบ",
    closeFilters: "ปิดตัวกรอง",
    closeDetails: "ปิดรายละเอียด",
    emptyTitle: "ไม่พบสินทรัพย์ที่ตรงกัน",
    emptyBody: "ลองใช้คำค้นที่กว้างขึ้นหรือล้างตัวกรองทั้งหมด",
    reset: "ล้างตัวกรอง",
    error: "ไม่สามารถโหลดสินค้าได้",
    errorBody: "ร้านค้าเชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง",
    retry: "ลองอีกครั้ง",
    results: (count: number) => `${count} รายการ`,
    instant: "ส่งมอบทันที",
    secure: "ชำระเงินปลอดภัย",
    creator: "เป็นมิตรกับครีเอเตอร์",
    available: "พร้อมจำหน่าย",
    soldOut: "สินค้าหมด",
    items: "รายการ",
    view: "ดูรายละเอียด",
    switchLocale: "Switch to English",
    localeShort: "EN",
    viewDetails: (name: string) => `ดูรายละเอียด ${name}`,
  },
  en: {
    explore: "Explore",
    introduction:
      "Curated digital goods for designers, developers, and visual storytellers.",
    loading: "Loading products",
    search: "Search assets",
    searchPlaceholder: "Search icons, templates, motion…",
    filters: "Filters",
    maxPrice: "Maximum price (THB)",
    maxPriceHint: "Enter a price in baht",
    inStock: "In stock only",
    apply: "Apply filters",
    cart: "Cart",
    cartDescription: "Creative assets you have selected.",
    cartLoading: "Loading cart",
    cartError: "Could not load cart",
    closeCart: "Close cart",
    cartEmpty: "Your cart is empty.",
    removeFromCart: (name: string) => `Remove ${name} from cart`,
    addToCart: "Add to cart",
    inCart: "In cart",
    login: "Log in",
    signup: "Sign up",
    logout: "Log out",
    closeFilters: "Close filters",
    closeDetails: "Close details",
    emptyTitle: "No assets match",
    emptyBody: "Try a broader search or clear every active filter.",
    reset: "Reset filters",
    error: "Could not load products",
    errorBody: "The marketplace could not connect. Please try again.",
    retry: "Retry",
    results: (count: number) => `${count} results`,
    instant: "Instant delivery",
    secure: "Secure checkout",
    creator: "Creator friendly",
    available: "Available",
    soldOut: "Sold out",
    items: "items",
    view: "View details",
    switchLocale: "เปลี่ยนเป็นภาษาไทย",
    localeShort: "TH",
    viewDetails: (name: string) => `View details for ${name}`,
  },
} as const;

function ProductArt({ product }: { product: Product }) {
  const seed = Array.from(product.visualCode).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) % 360,
    17,
  );
  const style = {
    "--art-hue": String(244 + (seed % 48)),
    "--art-tilt": `${(seed % 18) - 9}deg`,
  } as CSSProperties;

  return (
    <div
      className={`product-art product-art-${seed % 4}`}
      style={style}
      aria-hidden="true"
    >
      <span className="art-orbit" />
      <span className="art-core" />
      <span className="visual-code">{product.visualCode}</span>
    </div>
  );
}

function SkeletonGrid({ label }: { label: string }) {
  return (
    <div className="catalog-state" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton-art" />
            <div className="skeleton-line skeleton-line-wide" />
            <div className="skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Marketplace({ locale, fetcher = fetch, authFetcher = fetch }: MarketplaceProps) {
  const copy = copyByLocale[locale];
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const activeFilters = parseFilters(
    new URLSearchParams(serializedSearchParams),
  );
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const cartIds = useCartStore((state) => state.cartIds);
  const hasHydratedCart = useCartStore((state) => state.hasHydrated);
  const addToCart = useCartStore((state) => state.addToCart);
  const removeFromCart = useCartStore((state) => state.removeFromCart);

  const {
    clearErrors,
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = useForm<SearchForm>({
    defaultValues: {
      q: activeFilters.q,
      maxPrice:
        activeFilters.maxPriceMinor === undefined
          ? ""
          : String(activeFilters.maxPriceMinor / 100),
      inStock: activeFilters.inStock,
    },
  });
  const searchValue = useWatch({ control, name: "q" }) ?? "";
  const maxPriceValue = useWatch({ control, name: "maxPrice" }) ?? "";
  const inStockValue = useWatch({ control, name: "inStock" }) ?? false;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const urlFilters = parseFilters(
      new URLSearchParams(serializedSearchParams),
    );
    reset({
      q: urlFilters.q,
      maxPrice:
        urlFilters.maxPriceMinor === undefined
          ? ""
          : String(urlFilters.maxPriceMinor / 100),
      inStock: urlFilters.inStock,
    });
  }, [reset, serializedSearchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed = searchSchema.safeParse(searchValue);
      if (!parsed.success || parsed.data === activeFilters.q) return;

      router.replace(
        getFilterHref(
          pathname,
          new URLSearchParams(serializedSearchParams),
          { q: parsed.data },
        ),
        { scroll: false },
      );
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeFilters.q, pathname, router, searchValue, serializedSearchParams]);

  const products = useQuery({
    queryKey: ["products", activeFilters],
    queryFn: ({ signal }) => fetchProducts(activeFilters, signal, fetcher),
  });
  const authSession = useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => fetchAuthSession(authFetcher),
    staleTime: 60_000,
    retry: false,
  });
  const cartProducts = useQuery({
    queryKey: ["products", "cart", "unfiltered"],
    queryFn: ({ signal }) => fetchProducts(emptyFilters, signal, fetcher),
    enabled: cartOpen && hasHydratedCart && cartIds.length > 0,
  });

  const applyFilters = handleSubmit((values) => {
    clearErrors("maxPrice");
    const rawPrice = values.maxPrice.trim();
    if (rawPrice && !/^\d+(?:\.\d{1,2})?$/.test(rawPrice)) {
      setError("maxPrice", {
        message: locale === "th" ? "กรอกราคาที่ถูกต้อง" : "Enter a valid price",
      });
      return;
    }

    const candidate = filterFormSchema.safeParse({
      q: values.q,
      maxPriceMinor: rawPrice ? Math.round(Number(rawPrice) * 100) : undefined,
      inStock: values.inStock,
    });
    if (!candidate.success) {
      setError("maxPrice", {
        message: locale === "th" ? "กรอกราคาที่ถูกต้อง" : "Enter a valid price",
      });
      return;
    }

    setFilterOpen(false);
    router.replace(
      getFilterHref(
        pathname,
        new URLSearchParams(serializedSearchParams),
        candidate.data,
      ),
      { scroll: false },
    );
  });

  function resetFilters() {
    setFilterOpen(false);
    router.replace(
      getFilterHref(
        pathname,
        new URLSearchParams(serializedSearchParams),
        "reset",
      ),
      { scroll: false },
    );
  }

  const cartProductsInView =
    cartProducts.data?.items.filter((product) =>
      cartIds.includes(product.id),
    ) ?? [];
  const selectedProductInCart =
    selectedProduct !== null && cartIds.includes(selectedProduct.id);
  const hasFilters =
    Boolean(activeFilters.q) ||
    activeFilters.maxPriceMinor !== undefined ||
    activeFilters.inStock;
  const localeHref = getLocaleSwitchHref(
    pathname,
    locale === "th" ? "en" : "th",
    new URLSearchParams(serializedSearchParams),
  );

  const priceControl = (
    <>
      <label className="field-label">
        <span>{copy.maxPrice}</span>
        <span className="price-input-shell">
          <span aria-hidden="true">฿</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={Boolean(errors.maxPrice)}
            aria-describedby={errors.maxPrice ? "max-price-error" : "price-hint"}
            {...register("maxPrice")}
          />
        </span>
      </label>
      <p className="field-hint" id="price-hint">
        {copy.maxPriceHint}
      </p>
      {errors.maxPrice ? (
        <p className="field-error" id="max-price-error" role="alert">
          {errors.maxPrice.message}
        </p>
      ) : null}
      <label className="stock-toggle">
        <input type="checkbox" {...register("inStock")} />
        <span className="toggle-track" aria-hidden="true">
          <span />
        </span>
        <span>{copy.inStock}</span>
      </label>
    </>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        {locale === "th" ? "ข้ามไปยังเนื้อหา" : "Skip to content"}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href={`/${locale}`} className="brand" aria-label="Pluto Shop home">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>Pluto Shop</span>
          </Link>
          <nav className="header-actions" aria-label="Primary navigation">
            <Link
              href={localeHref}
              className="locale-switch"
              aria-label={copy.switchLocale}
              hrefLang={locale === "th" ? "en" : "th"}
            >
              {copy.localeShort}
            </Link>
            {authSession.data?.authenticated ? (
              <>
                <span className="auth-user">
                  {authSession.data.user.name ?? authSession.data.user.email}
                </span>
                {authSession.data.user.roles.includes("ADMIN") ? (
                  <Link className="auth-link auth-admin" href="/admin">
                    Admin
                  </Link>
                ) : null}
                <Link className="auth-link" href="/api/auth/logout" prefetch={false}>
                  {copy.logout}
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="auth-link"
                  href={`/api/auth/login?callbackUrl=${encodeURIComponent(`/${locale}`)}`}
                >
                  {copy.login}
                </Link>
                <Link
                  className="auth-link auth-signup"
                  href={`/api/auth/signup?callbackUrl=${encodeURIComponent(`/${locale}`)}`}
                >
                  {copy.signup}
                </Link>
              </>
            )}
            <Dialog open={cartOpen} onOpenChange={setCartOpen}>
              <DialogTrigger asChild>
                <button
                  className="cart-trigger"
                  type="button"
                  aria-label={copy.cart}
                >
                  <span className="cart-icon" aria-hidden="true" />
                  <span className="cart-label">{copy.cart}</span>
                  {hasHydratedCart ? (
                    <span className="cart-count">{cartIds.length}</span>
                  ) : null}
                </button>
              </DialogTrigger>
              <DialogContent className="cart-drawer">
                <div className="drawer-header">
                  <div>
                    <p className="eyebrow">Pluto Shop</p>
                    <DialogTitle>{copy.cart}</DialogTitle>
                    <DialogDescription>
                      {copy.cartDescription}
                    </DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={copy.closeCart}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </DialogClose>
                </div>
                <div className="drawer-body">
                  {cartProducts.isPending && cartIds.length > 0 ? (
                    <div role="status" aria-label={copy.cartLoading}>
                      <span className="cart-loading-line" />
                      <span className="cart-loading-line" />
                    </div>
                  ) : null}
                  {cartProducts.isError ? (
                    <div role="alert" aria-label={copy.cartError}>
                      <p>{copy.cartError}</p>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void cartProducts.refetch()}
                      >
                        {copy.retry}
                      </button>
                    </div>
                  ) : null}
                  {cartProductsInView.length ? (
                    <ul className="cart-list">
                      {cartProductsInView.map((product) => (
                        <li key={product.id}>
                          <ProductArt product={product} />
                          <div>
                            <strong>{productName(product, locale)}</strong>
                            <span>{formatThb(product.priceMinor, locale)}</span>
                          </div>
                          <button
                            className="cart-remove-button"
                            type="button"
                            aria-label={copy.removeFromCart(productName(product, locale))}
                            onClick={() => removeFromCart(product.id)}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {cartIds.length === 0 ||
                  (!cartProducts.isPending &&
                    !cartProducts.isError &&
                    cartProductsInView.length === 0) ? (
                    <p className="empty-cart">{copy.cartEmpty}</p>
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="marketplace-title">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <span>Pluto Shop</span>
            <span aria-hidden="true">/</span>
            <span>{copy.explore}</span>
          </nav>
          <p className="hero-kicker">PLUTO / EXPLORE 01</p>
          <h1 id="marketplace-title">Creative Asset Marketplace</h1>
          <p className="hero-introduction">{copy.introduction}</p>
          <ul className="trust-statuses" aria-label="Marketplace assurances">
            {[copy.instant, copy.secure, copy.creator].map((status) => (
              <li key={status}>
                <span aria-hidden="true" />
                {status}
              </li>
            ))}
          </ul>
        </section>

        <section className="catalog" aria-labelledby="catalog-heading">
          <h2 className="sr-only" id="catalog-heading">
            {copy.explore}
          </h2>
          <form className="search-form" role="search" onSubmit={applyFilters} noValidate>
            <label className="search-shell">
              <span className="sr-only">{copy.search}</span>
              <span className="search-icon" aria-hidden="true" />
              <input
                type="search"
                maxLength={120}
                autoComplete="off"
                placeholder={copy.searchPlaceholder}
                {...register("q", { maxLength: 120 })}
              />
              <kbd aria-hidden="true">/</kbd>
            </label>
          </form>

          <div className="catalog-toolbar">
            <p data-testid="result-count" aria-live="polite">
              {products.data ? copy.results(products.data.total) : "—"}
            </p>
            <div className="toolbar-actions">
              {hasFilters ? (
                <button
                  className="reset-button"
                  type="button"
                  aria-label={locale === "th" ? "ล้างตัวกรองในแถบเครื่องมือ" : "Reset toolbar filters"}
                  onClick={resetFilters}
                >
                  {copy.reset}
                </button>
              ) : null}
              <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                <DialogTrigger asChild>
                  <button className="mobile-filter-trigger" type="button">
                    {copy.filters}
                  </button>
                </DialogTrigger>
                <DialogContent className="filter-drawer">
                  <div className="drawer-header">
                    <div>
                      <p className="eyebrow">Pluto / Explore</p>
                      <DialogTitle>{copy.filters}</DialogTitle>
                      <DialogDescription>{copy.maxPriceHint}</DialogDescription>
                    </div>
                    <DialogClose asChild>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={copy.closeFilters}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </DialogClose>
                  </div>
                  <form className="mobile-filter-form" onSubmit={applyFilters} noValidate>
                    <label className="field-label">
                      <span>{copy.maxPrice}</span>
                      <span className="price-input-shell">
                        <span aria-hidden="true">฿</span>
                        <input
                          name="mobileMaxPrice"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={maxPriceValue}
                          aria-invalid={Boolean(errors.maxPrice)}
                          onChange={(event) =>
                            setValue("maxPrice", event.target.value, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </span>
                    </label>
                    {errors.maxPrice ? (
                      <p className="field-error" role="alert">
                        {errors.maxPrice.message}
                      </p>
                    ) : null}
                    <label className="stock-toggle">
                      <input
                        name="mobileInStock"
                        type="checkbox"
                        checked={inStockValue}
                        onChange={(event) =>
                          setValue("inStock", event.target.checked, {
                            shouldDirty: true,
                          })
                        }
                      />
                      <span className="toggle-track" aria-hidden="true">
                        <span />
                      </span>
                      <span>{copy.inStock}</span>
                    </label>
                    <div className="filter-actions">
                      <button type="button" className="secondary-button" onClick={resetFilters}>
                        {copy.reset}
                      </button>
                      <button type="submit" className="primary-button">
                        {copy.apply}
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="catalog-layout">
            <aside className="desktop-filter-panel" aria-label={copy.filters}>
              <div className="filter-heading">
                <h3>{copy.filters}</h3>
                {hasFilters ? (
                  <button
                    type="button"
                    aria-label={locale === "th" ? "ล้างตัวกรองในแผง" : "Reset filter panel"}
                    onClick={resetFilters}
                  >
                    {copy.reset}
                  </button>
                ) : null}
              </div>
              <form onSubmit={applyFilters} noValidate>
                {priceControl}
                <button className="primary-button" type="submit">
                  {copy.apply}
                </button>
              </form>
              {products.data ? (
                <div className="price-range-note">
                  <span>{formatThb(products.data.priceRange.minMinor, locale)}</span>
                  <span aria-hidden="true">—</span>
                  <span>{formatThb(products.data.priceRange.maxMinor, locale)}</span>
                </div>
              ) : null}
            </aside>

            <div className="results-column">
              {products.isPending ? <SkeletonGrid label={copy.loading} /> : null}

              {products.isError ? (
                <div className="message-state" role="alert" aria-label={copy.error}>
                  <span className="state-code" aria-hidden="true">503 / RETRY</span>
                  <h2>{copy.error}</h2>
                  <p>{copy.errorBody}</p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void products.refetch()}
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : null}

              {products.data && products.data.total === 0 ? (
                <section className="message-state" aria-labelledby="empty-title">
                  <span className="state-orbit" aria-hidden="true" />
                  <h2 id="empty-title">{copy.emptyTitle}</h2>
                  <p>{copy.emptyBody}</p>
                  <button className="primary-button" type="button" onClick={resetFilters}>
                    {copy.reset}
                  </button>
                </section>
              ) : null}

              {products.data && products.data.total > 0 ? (
                <section
                  className="product-grid"
                  aria-label={locale === "th" ? "ผลลัพธ์" : "Results"}
                >
                  {products.data.items.map((product) => {
                    const name = productName(product, locale);
                    return (
                      <article className="product-card" key={product.id}>
                        <div className="card-art-wrap">
                          <ProductArt product={product} />
                        </div>
                        <div className="card-body">
                          <div className="card-title-row">
                            <div>
                              <h2>{name}</h2>
                              <p className="card-description">
                                {productDescription(product, locale)}
                              </p>
                            </div>
                            <strong>{formatThb(product.priceMinor, locale)}</strong>
                          </div>
                          <div className="card-meta">
                            <span className={product.stockQuantity > 0 ? "in-stock" : "sold-out"}>
                              <span aria-hidden="true" />
                              {product.stockQuantity > 0 ? copy.available : copy.soldOut}
                            </span>
                            {product.instantDelivery ? (
                              <span className="instant-delivery">
                                <span aria-hidden="true">↯</span>
                                {copy.instant}
                              </span>
                            ) : null}
                            {product.bundleItemCount ? (
                              <span>
                                {product.bundleItemCount} {copy.items}
                              </span>
                            ) : null}
                          </div>
                          <button
                            className="detail-button"
                            type="button"
                            aria-label={copy.viewDetails(name)}
                            onClick={(event) => {
                              detailTriggerRef.current = event.currentTarget;
                              setSelectedProduct(product);
                            }}
                          >
                            {copy.view}
                            <span aria-hidden="true">↗</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <span className="footer-brand">Pluto Shop</span>
          <span>
            {locale === "th"
              ? "สินทรัพย์สร้างสรรค์ จัดหมวดหมู่อย่างตั้งใจ"
              : "Creative assets, carefully cataloged."}
          </span>
        </div>
        <span>THB ONLY / MARKETPLACE 01</span>
      </footer>

      <Dialog
        open={selectedProduct !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}
      >
        {selectedProduct ? (
          <DialogContent
            className="product-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailTriggerRef.current?.focus();
            }}
          >
            <div className="dialog-art-column">
              <ProductArt product={selectedProduct} />
            </div>
            <div className="dialog-copy-column">
              <div className="dialog-heading-row">
                <div>
                  <DialogTitle>{productName(selectedProduct, locale)}</DialogTitle>
                </div>
                <DialogClose asChild>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={copy.closeDetails}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </DialogClose>
              </div>
              <DialogDescription>
                {productDescription(selectedProduct, locale)}
              </DialogDescription>
              <p className="dialog-price">
                {formatThb(selectedProduct.priceMinor, locale)}
              </p>
              <dl className="product-facts">
                <div>
                  <dt>{copy.instant}</dt>
                  <dd>{selectedProduct.instantDelivery ? "✓" : "—"}</dd>
                </div>
                <div>
                  <dt>{copy.available}</dt>
                  <dd>{selectedProduct.stockQuantity}</dd>
                </div>
              </dl>
              <button
                className="primary-button cart-button"
                type="button"
                disabled={selectedProduct.stockQuantity <= 0 || selectedProductInCart}
                aria-label={selectedProductInCart ? copy.inCart : copy.addToCart}
                onClick={() => addToCart(selectedProduct.id)}
              >
                <span className="cart-icon" aria-hidden="true" />
                {selectedProductInCart ? copy.inCart : copy.addToCart}
              </button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
