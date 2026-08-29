"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { fetchCart, mergeCart, replaceCart } from "@/lib/cart-api";
import {
  cancelPromptPayPayment,
  checkPromptPayPayment,
  createPromptPayPayment,
  isPromptPayAvailableAt,
  type PromptPayCheckout,
  type PromptPayStatus,
} from "@/lib/payment-api";
import {
  fetchProducts,
  productDescription,
  productName,
  productOptionLabel,
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
  cartFetcher?: typeof fetch;
  paymentFetcher?: typeof fetch;
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
    cartTotal: "รวมทั้งหมด",
    detailTotal: "รวมสินค้า",
    closeCart: "ปิดรถเข็น",
    cartEmpty: "รถเข็นยังว่างอยู่",
    removeFromCart: (name: string) => `นำ ${name} ออกจากรถเข็น`,
    decreaseQuantity: (name: string) => `ลดจำนวน ${name}`,
    increaseQuantity: (name: string) => `เพิ่มจำนวน ${name}`,
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
    optionCount: (count: number) => `${count} ตัวเลือก`,
    chooseOption: "เลือกตัวเลือก",
    chooseOptionDescription: "เลือกตัวเลือกที่ต้องการก่อนดูรายละเอียด",
    closeOptionChooser: "ปิดตัวเลือก",
    fromPrice: "เริ่มต้น",
    checkout: "เลือกวิธีชำระเงิน",
    choosePaymentMethod: "เลือกวิธีชำระเงิน",
    choosePaymentDescription: "เลือกช่องทางชำระเงินที่ต้องการใช้กับรายการนี้",
    promptPay: "PromptPay",
    payWithPromptPay: "ชำระด้วย PromptPay",
    promptPayHours: "เปิดให้บริการ 01:30–23:30 น. (เวลาไทย)",
    promptPayClosed: "ปิดบริการ 23:30–01:30 น. (เวลาไทย)",
    trueMoney: "TrueMoney Wallet",
    trueMoneyUnavailable: "ยังไม่พร้อมใช้งาน",
    trueMoneyContractPending: "รอยืนยัน contract ก่อนเปิดรับ voucher",
    loginToCheckout: "เข้าสู่ระบบเพื่อชำระเงิน",
    continuePayment: "ดูการชำระเงินต่อ",
    paymentPayeeLabel: "ระบบรับชำระ",
    paymentPayeeName: "Pluto Shop",
    paymentPayeeDetail: "PromptPay checkout",
    paymentDialogName: "หน้าชำระเงิน Pluto Shop PromptPay",
    paymentAmountLabel: "ยอดที่ต้องชำระ",
    paymentCopy: "คัดลอก",
    paymentCopied: "คัดลอกแล้ว",
    paymentCopyPayload: "คัดลอกข้อมูล PromptPay",
    paymentCopyError: "ไม่สามารถคัดลอกข้อมูลการชำระเงินได้",
    paymentRemaining: "เวลาที่เหลือ",
    paymentAutoCheck: "ตรวจสอบอัตโนมัติทุก 5 วินาที",
    paymentCancel: "ยกเลิกการชำระเงิน",
    paymentCancelConfirm: "ต้องการยกเลิกการชำระเงินนี้หรือไม่? ระบบจะหยุดตรวจสอบ QR นี้ สินค้าจะยังอยู่ในรถเข็นของคุณ และการยกเลิกนี้ไม่ใช่การคืนเงินจากผู้ให้บริการ",
    paymentCancelPending: "กำลังยกเลิกการชำระเงิน",
    paymentCancelled: "ยกเลิกการชำระเงินแล้ว",
    paymentCancelError: "ไม่สามารถยกเลิกการชำระเงินได้ กรุณาลองตรวจสอบสถานะอีกครั้ง",
    paymentDismiss: "ปิดหน้าต่าง",
    paymentTitle: "ชำระเงินด้วย PromptPay",
    paymentDescription: "สแกน QR เพื่อชำระเงิน แล้วกดตรวจสอบสถานะ",
    paymentPending: "กำลังรอตรวจสอบการชำระเงิน",
    paymentPaid: "ชำระเงินสำเร็จ",
    paymentExpired: "QR หมดอายุแล้ว",
    paymentFailed: "การชำระเงินไม่สำเร็จ",
    paymentCheck: "ตรวจสอบการชำระเงิน",
    paymentTransaction: "Transaction ID",
    paymentExpires: "หมดอายุ",
    closePayment: "ปิดหน้าชำระเงิน",
    paymentError: "ไม่สามารถเริ่มการชำระเงินได้ กรุณาลองอีกครั้ง",
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
    cartTotal: "Cart total",
    detailTotal: "Item total",
    closeCart: "Close cart",
    cartEmpty: "Your cart is empty.",
    removeFromCart: (name: string) => `Remove ${name} from cart`,
    decreaseQuantity: (name: string) => `Decrease ${name} quantity`,
    increaseQuantity: (name: string) => `Increase ${name} quantity`,
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
    optionCount: (count: number) => `${count} products`,
    chooseOption: "Choose an option",
    chooseOptionDescription: "Choose an option before opening the product details.",
    closeOptionChooser: "Close option chooser",
    fromPrice: "From",
    checkout: "Choose payment method",
    choosePaymentMethod: "Choose a payment method",
    choosePaymentDescription: "Select how you want to pay for this order.",
    promptPay: "PromptPay",
    payWithPromptPay: "Pay with PromptPay",
    promptPayHours: "Available 01:30–23:30 (Bangkok time)",
    promptPayClosed: "Closed 23:30–01:30 (Bangkok time)",
    trueMoney: "TrueMoney Wallet",
    trueMoneyUnavailable: "Not available yet",
    trueMoneyContractPending: "Provider contract verification is required before voucher redemption",
    loginToCheckout: "Log in to pay",
    continuePayment: "Continue payment",
    paymentPayeeLabel: "Payment receiver",
    paymentPayeeName: "Pluto Shop",
    paymentPayeeDetail: "PromptPay checkout",
    paymentDialogName: "Pluto Shop PromptPay payment",
    paymentAmountLabel: "Amount due",
    paymentCopy: "Copy",
    paymentCopied: "Copied",
    paymentCopyPayload: "Copy payment payload",
    paymentCopyError: "Could not copy the payment payload",
    paymentRemaining: "Time remaining",
    paymentAutoCheck: "Automatic status check every 5 seconds",
    paymentCancel: "Cancel payment",
    paymentCancelConfirm: "Cancel this payment? The system will stop checking this QR, the items will remain in your cart, and this is not a provider refund.",
    paymentCancelPending: "Cancelling payment",
    paymentCancelled: "Payment cancelled",
    paymentCancelError: "Could not cancel the payment. Please check the status again.",
    paymentDismiss: "Close payment window",
    paymentTitle: "Pay with PromptPay",
    paymentDescription: "Scan the QR code, then check the payment status.",
    paymentPending: "Waiting for payment confirmation",
    paymentPaid: "Payment completed",
    paymentExpired: "This QR code has expired",
    paymentFailed: "Payment was not completed",
    paymentCheck: "Check payment",
    paymentTransaction: "Transaction ID",
    paymentExpires: "Expires",
    closePayment: "Close payment",
    paymentError: "Could not start payment. Please try again.",
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

type ProductDisplayGroup = {
  product: Product;
  options: Product[];
};

type OptionChooserState = {
  titleProduct: Product;
  options: Product[];
};

type PaymentViewState = PromptPayCheckout & {
  message?: PromptPayStatus["message"];
};

function formatPaymentCountdown(totalSeconds: number): string {
  const boundedSeconds = Math.min(99 * 60 + 59, Math.max(0, totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60).toString().padStart(2, "0");
  const seconds = (boundedSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function groupProductsForDisplay(items: Product[]): ProductDisplayGroup[] {
  const groups = new Map<string, ProductDisplayGroup>();
  const display: ProductDisplayGroup[] = [];
  for (const product of items) {
    if (product.selectionMode !== "MULTI_OPTION" || !product.optionGroup) {
      display.push({ product, options: [product] });
      continue;
    }
    const existing = groups.get(product.optionGroup);
    if (existing) {
      existing.options.push(product);
    } else {
      const group = { product, options: [product] };
      groups.set(product.optionGroup, group);
      display.push(group);
    }
  }
  return display;
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

export function Marketplace({
  locale,
  fetcher = fetch,
  authFetcher = fetch,
  cartFetcher = fetch,
  paymentFetcher = fetch,
}: MarketplaceProps) {
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
  const [optionChooser, setOptionChooser] = useState<OptionChooserState | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [payment, setPayment] = useState<PaymentViewState | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [paymentCancelling, setPaymentCancelling] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentNow, setPaymentNow] = useState(() => Date.now());
  const [paymentCopied, setPaymentCopied] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const cartIds = useCartStore((state) => state.cartIds);
  const cartQuantities = useCartStore((state) => state.quantities);
  const cartMode = useCartStore((state) => state.mode);
  const hasHydratedCart = useCartStore((state) => state.hasHydrated);
  const addToCart = useCartStore((state) => state.addToCart);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const setCartItems = useCartStore((state) => state.setCartItems);
  const clearCart = useCartStore((state) => state.clearCart);
  const cartSyncSubjectRef = useRef<string | null>(null);
  const previousAuthenticatedRef = useRef(false);
  const lastServerCartRef = useRef("");

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

  useEffect(() => {
    const session = authSession.data;
    if (!hasHydratedCart || authSession.isPending) return;
    if (!session?.authenticated) {
      if (previousAuthenticatedRef.current) clearCart();
      previousAuthenticatedRef.current = false;
      cartSyncSubjectRef.current = null;
      lastServerCartRef.current = "";
      return;
    }

    previousAuthenticatedRef.current = true;
    if (cartSyncSubjectRef.current === session.user.sub) return;
    cartSyncSubjectRef.current = session.user.sub;

    const guestItems = cartIds.map((productId) => ({
      productId,
      quantity: cartQuantities[String(productId)] ?? 1,
    }));
    const request = cartMode === "guest" && guestItems.length > 0
      ? mergeCart(guestItems, cartFetcher)
      : fetchCart(cartFetcher);
    void request
      .then((response) => {
        setCartItems(response.items, "account");
        lastServerCartRef.current = JSON.stringify(response.items);
      })
      .catch(() => {
        cartSyncSubjectRef.current = null;
      });
  }, [
    authSession.data,
    authSession.isPending,
    cartFetcher,
    cartIds,
    cartMode,
    cartQuantities,
    clearCart,
    hasHydratedCart,
    setCartItems,
  ]);

  useEffect(() => {
    if (!authSession.data?.authenticated || cartMode !== "account" || !cartSyncSubjectRef.current) {
      return;
    }
    const items = cartIds.map((productId) => ({
      productId,
      quantity: cartQuantities[String(productId)] ?? 1,
    }));
    const serialized = JSON.stringify(items);
    if (serialized === lastServerCartRef.current) return;
    lastServerCartRef.current = serialized;
    void replaceCart(items, cartFetcher)
      .then((response) => {
        setCartItems(response.items, "account");
        lastServerCartRef.current = JSON.stringify(response.items);
      })
      .catch(() => {
        lastServerCartRef.current = "";
      });
  }, [authSession.data, cartFetcher, cartIds, cartMode, cartQuantities, setCartItems]);

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
  const cartItemCount = cartIds.reduce(
    (total, productId) => total + (cartQuantities[String(productId)] ?? 1),
    0,
  );
  const cartTotalMinor = cartProductsInView.reduce(
    (total, product) => total + product.priceMinor * (cartQuantities[String(product.id)] ?? 1),
    0,
  );
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
  const displayProducts = useMemo(
    () => groupProductsForDisplay(products.data?.items ?? []),
    [products.data?.items],
  );
  const promptPayAvailable = isPromptPayAvailableAt(new Date());
  const paymentRemainingSeconds = payment
    ? Math.max(0, Math.ceil((new Date(payment.expiresAt).getTime() - paymentNow) / 1_000))
    : 0;

  function openProduct(product: Product, options: Product[], trigger: HTMLButtonElement) {
    detailTriggerRef.current = trigger;
    setSelectedQuantity(1);
    if (product.selectionMode === "MULTI_OPTION") {
      setSelectedProduct(null);
      setOptionChooser({ titleProduct: product, options });
      return;
    }
    setOptionChooser(null);
    setSelectedProduct(product);
  }

  function chooseProductOption(product: Product) {
    setOptionChooser(null);
    setSelectedQuantity(1);
    setSelectedProduct(product);
  }

  async function startPromptPayPayment() {
    if (!authSession.data?.authenticated || cartIds.length === 0) return;
    if (!promptPayAvailable) {
      setPaymentError(copy.promptPayClosed);
      return;
    }
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const created = await createPromptPayPayment(paymentFetcher);
      setPayment({ ...created });
      setPaymentNow(Date.now());
      setPaymentCopied(false);
      setPaymentMethodOpen(false);
      setPaymentOpen(true);
      setCartOpen(false);
    } catch {
      setPaymentError(copy.paymentError);
    } finally {
      setPaymentLoading(false);
    }
  }

  function openPaymentMethodDialog() {
    setPaymentError(null);
    setCartOpen(false);
    window.setTimeout(() => setPaymentMethodOpen(true), 0);
  }

  async function copyPaymentPayload() {
    if (!payment) return;
    try {
      await navigator.clipboard.writeText(payment.payload);
      setPaymentCopied(true);
      setPaymentError(null);
    } catch {
      setPaymentError(copy.paymentCopyError);
    }
  }

  const checkPaymentStatus = useCallback(async () => {
    if (!payment) return;
    setPaymentChecking(true);
    try {
      const next = await checkPromptPayPayment(payment.transactionId, paymentFetcher);
      setPayment((current) => current ? { ...current, ...next } : current);
      setPaymentError(null);
      if (next.status === "PAID") clearCart();
    } catch {
      setPaymentError(copy.paymentError);
    } finally {
      setPaymentChecking(false);
    }
  }, [clearCart, copy.paymentError, payment, paymentFetcher]);

  const cancelPayment = useCallback(async () => {
    if (!payment || payment.status !== "PENDING" || paymentCancelling) return;
    if (!window.confirm(copy.paymentCancelConfirm)) return;

    setPaymentCancelling(true);
    setPaymentError(null);
    try {
      const next = await cancelPromptPayPayment(payment.transactionId, paymentFetcher);
      setPayment((current) => current ? { ...current, ...next } : current);
      setPaymentError(null);
    } catch {
      setPaymentError(copy.paymentCancelError);
    } finally {
      setPaymentCancelling(false);
    }
  }, [copy.paymentCancelConfirm, copy.paymentCancelError, payment, paymentCancelling, paymentFetcher]);

  useEffect(() => {
    if (!paymentOpen || !payment || payment.status !== "PENDING") return;
    const timer = window.setInterval(() => void checkPaymentStatus(), 5_000);
    return () => window.clearInterval(timer);
  }, [checkPaymentStatus, payment, paymentOpen]);

  useEffect(() => {
    if (!paymentOpen || payment?.status !== "PENDING") return;
    const tick = () => setPaymentNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [payment?.status, paymentOpen]);

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
              scroll={false}
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
                <Link
                  className="auth-link"
                  href={`/api/auth/logout?callbackUrl=${encodeURIComponent(`/${locale}`)}`}
                  prefetch={false}
                >
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
                    <span className="cart-count">{cartItemCount}</span>
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
                            <strong>{productOptionLabel(product, locale)}</strong>
                            <span>
                              {formatThb(product.priceMinor, locale)} × {cartQuantities[String(product.id)] ?? 1}
                            </span>
                            <span className="cart-line-total" data-testid="cart-line-total">
                              {formatThb(product.priceMinor * (cartQuantities[String(product.id)] ?? 1), locale)}
                            </span>
                            <div className="cart-quantity-controls">
                              <button
                                type="button"
                                aria-label={copy.decreaseQuantity(productOptionLabel(product, locale))}
                                onClick={() => setQuantity(product.id, (cartQuantities[String(product.id)] ?? 1) - 1)}
                              >
                                −
                              </button>
                              <span aria-label={`Quantity ${cartQuantities[String(product.id)] ?? 1}`}>
                                ×{cartQuantities[String(product.id)] ?? 1}
                              </span>
                              <button
                                type="button"
                                aria-label={copy.increaseQuantity(productOptionLabel(product, locale))}
                                onClick={() => setQuantity(product.id, (cartQuantities[String(product.id)] ?? 1) + 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <button
                            className="cart-remove-button"
                            type="button"
                            aria-label={copy.removeFromCart(productOptionLabel(product, locale))}
                            onClick={() => removeFromCart(product.id)}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {cartProductsInView.length > 0 ? (
                    <div className="cart-total-row" data-testid="cart-total">
                      <span>{copy.cartTotal}</span>
                      <strong>{formatThb(cartTotalMinor, locale)}</strong>
                    </div>
                  ) : null}
                  {cartProductsInView.length > 0 && !authSession.isPending ? (
                    <div className="cart-checkout-actions">
                      {authSession.data?.authenticated ? (
                        <button
                          className="primary-button"
                          type="button"
                          disabled={paymentLoading}
                          onClick={() => {
                            if (payment?.status === "PENDING") {
                              setPaymentOpen(true);
                            } else {
                              openPaymentMethodDialog();
                            }
                          }}
                        >
                          {paymentLoading
                            ? copy.paymentPending
                            : payment?.status === "PENDING"
                              ? copy.continuePayment
                              : copy.checkout}
                        </button>
                      ) : (
                        <Link
                          className="primary-button"
                          href={`/api/auth/login?callbackUrl=${encodeURIComponent(`/${locale}`)}`}
                          prefetch={false}
                        >
                          {copy.loginToCheckout}
                        </Link>
                      )}
                      {paymentError && !paymentOpen ? (
                        <p className="payment-inline-error" role="alert">{paymentError}</p>
                      ) : null}
                    </div>
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
            <Dialog
              open={paymentMethodOpen}
              onOpenChange={(open) => {
                setPaymentMethodOpen(open);
                if (!open) {
                  setPaymentError(null);
                }
              }}
            >
              <DialogContent className="payment-method-dialog">
                <div className="payment-dialog-header">
                  <div>
                    <p className="eyebrow">Pluto / Checkout</p>
                    <DialogTitle>{copy.choosePaymentMethod}</DialogTitle>
                    <DialogDescription>{copy.choosePaymentDescription}</DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <button className="icon-button" type="button" aria-label={copy.closePayment}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </DialogClose>
                </div>
                <div className="payment-method-body">
                  <div className="payment-method-options">
                    <button
                      className="payment-method-option"
                      type="button"
                      aria-label={copy.payWithPromptPay}
                      disabled={!promptPayAvailable || paymentLoading}
                      onClick={() => void startPromptPayPayment()}
                    >
                      <span className="payment-method-option-title">{copy.promptPay}</span>
                      <span className="payment-method-option-description">
                        {promptPayAvailable ? copy.promptPayHours : copy.promptPayClosed}
                      </span>
                    </button>
                    <button
                      className="payment-method-option payment-method-option-disabled"
                      type="button"
                      aria-label={copy.trueMoney}
                      disabled
                    >
                      <span className="payment-method-option-title">{copy.trueMoney}</span>
                      <span className="payment-method-option-description">{copy.trueMoneyUnavailable}</span>
                      <span className="payment-method-option-note">{copy.trueMoneyContractPending}</span>
                    </button>
                  </div>
                  {paymentError ? <p className="payment-dialog-error" role="alert">{paymentError}</p> : null}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
              {payment ? (
                <DialogContent className="payment-dialog" aria-label={copy.paymentDialogName}>
                  <div className="payment-dialog-header">
                    <div className="payment-payee">
                      <div className="payment-payee-mark" aria-hidden="true">
                        <span>PP</span>
                      </div>
                      <div className="payment-payee-copy">
                        <span className="payment-payee-label">{copy.paymentPayeeLabel}</span>
                        <DialogTitle>
                          <span className="sr-only">{copy.paymentDialogName}</span>
                          <span aria-hidden="true">{copy.paymentPayeeName}</span>
                        </DialogTitle>
                        <DialogDescription>
                          <span>{copy.paymentPayeeDetail}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="payment-transaction-line">
                            <span className="sr-only">{copy.paymentTransaction}: </span>
                            <code>{payment.transactionId}</code>
                          </span>
                        </DialogDescription>
                      </div>
                    </div>
                    <DialogClose asChild>
                      <button className="icon-button" type="button" aria-label={copy.closePayment}>
                        <span aria-hidden="true">×</span>
                      </button>
                    </DialogClose>
                  </div>
                  <div className="payment-dialog-body">
                    <div className="payment-qr-column">
                      <div className="payment-qr-shell">
                        <div className="payment-qr-frame">
                          <Image
                            src={payment.qrUrl}
                            alt="PromptPay QR code"
                            width={270}
                            height={270}
                            sizes="(max-width: 639px) 100vw, 270px"
                            loading="eager"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                      <div className="payment-qr-badge" aria-label={copy.paymentPayeeName}>
                        <span className="payment-badge-mark" aria-hidden="true">✦</span>
                        <span>{copy.paymentPayeeName}</span>
                        <span className="payment-badge-separator" aria-hidden="true">•</span>
                        <span>{copy.paymentPayeeDetail}</span>
                      </div>
                    </div>
                    <div className="payment-summary">
                      <p className="payment-instruction">{copy.paymentDescription}</p>
                      <div className="payment-amount-card">
                        <div>
                          <span className="payment-amount-label">{copy.paymentAmountLabel}</span>
                          <strong>{formatThb(payment.amountMinor, locale)}</strong>
                        </div>
                        <button
                          className="payment-copy-button"
                          type="button"
                          aria-label={copy.paymentCopyPayload}
                          aria-live="polite"
                          onClick={() => void copyPaymentPayload()}
                        >
                          <span aria-hidden="true">▣</span>
                          {paymentCopied ? copy.paymentCopied : copy.paymentCopy}
                        </button>
                      </div>
                      {payment.status === "PENDING" ? (
                        <div className="payment-timer-card" role="status" aria-live="polite">
                          <span className="payment-timer-icon" aria-hidden="true">◷</span>
                          <div className="payment-timer-copy">
                            <span>{copy.paymentRemaining}</span>
                            <strong data-testid="payment-countdown">
                              {formatPaymentCountdown(paymentRemainingSeconds)}
                            </strong>
                          </div>
                          <span className="payment-auto-check">{copy.paymentAutoCheck}</span>
                          <span className="payment-timer-bar" aria-hidden="true" />
                        </div>
                      ) : (
                        <div className={`payment-state-card payment-state-${payment.status.toLowerCase()}`} role="status">
                          <span className={`payment-status payment-status-${payment.status.toLowerCase()}`}>
                            {payment.status === "PAID"
                              ? copy.paymentPaid
                              : payment.status === "EXPIRED"
                                ? copy.paymentExpired
                                : payment.status === "CANCELLED"
                                  ? copy.paymentCancelled
                                  : copy.paymentFailed}
                          </span>
                          <p>
                            {payment.status === "PAID"
                              ? copy.paymentPaid
                              : payment.status === "EXPIRED"
                                ? copy.paymentExpired
                                : payment.status === "CANCELLED"
                                  ? copy.paymentCancelled
                                  : copy.paymentFailed}
                          </p>
                        </div>
                      )}
                      {paymentError ? <p className="payment-dialog-error" role="alert">{paymentError}</p> : null}
                      <div className={`payment-action-row${payment.status === "PENDING" ? "" : " payment-action-row-single"}`}>
                        {payment.status === "PENDING" ? (
                          <>
                            <button
                              className="payment-check-button"
                              type="button"
                              disabled={paymentChecking || paymentCancelling}
                              onClick={() => void checkPaymentStatus()}
                            >
                              <span aria-hidden="true">⟳</span>
                              {paymentChecking ? copy.paymentPending : copy.paymentCheck}
                            </button>
                            <button
                              className="payment-cancel-button"
                              type="button"
                              disabled={paymentChecking || paymentCancelling}
                              onClick={() => void cancelPayment()}
                            >
                              <span aria-hidden="true">⊗</span>
                              {paymentCancelling ? copy.paymentCancelPending : copy.paymentCancel}
                            </button>
                          </>
                        ) : null}
                        {payment.status !== "PENDING" ? (
                          <DialogClose asChild>
                            <button className="payment-dismiss-button" type="button">
                              <span aria-hidden="true">⊗</span>
                              {copy.paymentDismiss}
                            </button>
                          </DialogClose>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </DialogContent>
              ) : null}
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
                  {displayProducts.map(({ product, options }) => {
                    const name = productName(product, locale);
                    const isMultiOption = product.selectionMode === "MULTI_OPTION";
                    const lowestPrice = options.reduce(
                      (lowest, option) => Math.min(lowest, option.priceMinor),
                      product.priceMinor,
                    );
                    const hasAvailableOption = options.some((option) => option.stockQuantity > 0);
                    const hasInstantOption = options.some((option) => option.instantDelivery);
                    return (
                      <article className="product-card" key={product.optionGroup ?? product.id}>
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
                            <strong>
                              {isMultiOption
                                ? `${copy.fromPrice} ${formatThb(lowestPrice, locale)}`
                                : formatThb(product.priceMinor, locale)}
                            </strong>
                          </div>
                          <div className="card-meta">
                            <span className={hasAvailableOption ? "in-stock" : "sold-out"}>
                              <span aria-hidden="true" />
                              {hasAvailableOption ? copy.available : copy.soldOut}
                            </span>
                            {hasInstantOption ? (
                              <span className="instant-delivery">
                                <span aria-hidden="true">↯</span>
                                {copy.instant}
                              </span>
                            ) : null}
                            {isMultiOption ? (
                              <span>{copy.optionCount(options.length)}</span>
                            ) : product.bundleItemCount ? (
                              <span>
                                {product.bundleItemCount} {copy.items}
                              </span>
                            ) : null}
                          </div>
                          <button
                            className="detail-button"
                            type="button"
                            aria-label={copy.viewDetails(name)}
                            onClick={(event) => openProduct(product, options, event.currentTarget)}
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
        open={optionChooser !== null}
        onOpenChange={(open) => {
          if (!open) setOptionChooser(null);
        }}
      >
        {optionChooser ? (
          <DialogContent
            className="option-chooser-dialog"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div className="option-chooser-header">
              <div>
                <DialogTitle>{productName(optionChooser.titleProduct, locale)}</DialogTitle>
                <DialogDescription>
                  {copy.optionCount(optionChooser.options.length)} · {copy.chooseOptionDescription}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button className="icon-button" type="button" aria-label={copy.closeOptionChooser}>
                  <span aria-hidden="true">×</span>
                </button>
              </DialogClose>
            </div>
            <div className="option-choice-list">
              {optionChooser.options.map((option) => {
                const optionName = productOptionLabel(option, locale);
                return (
                  <button
                    className="option-choice-card"
                    key={option.id}
                    type="button"
                    aria-label={optionName}
                    onClick={() => chooseProductOption(option)}
                  >
                    <span className="option-choice-art">
                      <ProductArt product={option} />
                    </span>
                    <span className="option-choice-copy">
                      <strong>{optionName}</strong>
                      <span className={option.stockQuantity > 0 ? "in-stock" : "sold-out"}>
                        <span aria-hidden="true" />
                        {option.stockQuantity > 0
                          ? `${option.stockQuantity} ${copy.available.toLowerCase()}`
                          : copy.soldOut}
                      </span>
                      {option.instantDelivery ? (
                        <span className="instant-delivery">
                          <span aria-hidden="true">↯</span>
                          {copy.instant}
                        </span>
                      ) : null}
                    </span>
                    <strong className="option-choice-price">{formatThb(option.priceMinor, locale)}</strong>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={selectedProduct !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
          if (!open) setSelectedQuantity(1);
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
                  <DialogTitle>{productOptionLabel(selectedProduct, locale)}</DialogTitle>
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
              <div className="detail-quantity-control">
                <label htmlFor="detail-quantity">
                  {locale === "th" ? "จำนวน" : "Quantity"}
                </label>
                <div>
                  <button
                    type="button"
                    aria-label={`Decrease ${productOptionLabel(selectedProduct, locale)} quantity`}
                    disabled={selectedQuantity <= 1 || selectedProductInCart}
                    onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))}
                  >
                    −
                  </button>
                  <input
                    id="detail-quantity"
                    type="number"
                    min={1}
                    max={selectedProduct.stockQuantity}
                    value={selectedQuantity}
                    aria-label={`Quantity for ${productOptionLabel(selectedProduct, locale)}`}
                    disabled={selectedProductInCart || selectedProduct.stockQuantity <= 0}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(parsed)) return;
                      setSelectedQuantity(
                        Math.min(selectedProduct.stockQuantity, Math.max(1, parsed)),
                      );
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${productOptionLabel(selectedProduct, locale)} quantity`}
                    disabled={selectedQuantity >= selectedProduct.stockQuantity || selectedProductInCart}
                    onClick={() => setSelectedQuantity((value) => Math.min(selectedProduct.stockQuantity, value + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="detail-total-row" data-testid="detail-total">
                <span>{copy.detailTotal}</span>
                <strong>
                  {formatThb(selectedProduct.priceMinor * selectedQuantity, locale)}
                </strong>
              </div>
              <button
                className="primary-button cart-button"
                type="button"
                disabled={selectedProduct.stockQuantity <= 0 || selectedProductInCart}
                aria-label={selectedProductInCart ? copy.inCart : copy.addToCart}
                onClick={() => addToCart(selectedProduct.id, selectedQuantity)}
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
