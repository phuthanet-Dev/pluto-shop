import Image from "next/image";

type PaymentMethodLogoProps = {
  brand: "promptpay" | "truemoney";
};

const logoByBrand = {
  promptpay: {
    src: "/icons/promptpay-logo.svg",
    width: 3000,
    height: 910,
  },
  truemoney: {
    src: "/icons/truemoney-wallet.svg",
    width: 500,
    height: 500,
  },
} as const;

export function PaymentMethodLogo({ brand }: PaymentMethodLogoProps) {
  const logo = logoByBrand[brand];

  return (
    <span
      className={`payment-method-logo payment-method-logo-${brand}`}
      data-testid={`${brand}-logo`}
      aria-hidden="true"
    >
      <Image
        className="payment-method-logo-image"
        src={logo.src}
        alt=""
        width={logo.width}
        height={logo.height}
        sizes="(max-width: 639px) 70vw, 180px"
        loading="eager"
        unoptimized
        referrerPolicy="no-referrer"
      />
    </span>
  );
}
