import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  footer?: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  footer,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <div className="auth-orbit auth-orbit-large" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-small" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" href="/th" aria-label="Pluto Shop home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>Pluto Shop</span>
        </Link>
        <p className="auth-eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        <Link className="primary-button auth-primary" href={primaryHref}>
          {primaryLabel}
          <span aria-hidden="true">↗</span>
        </Link>
        <Link className="auth-secondary" href={secondaryHref}>
          {secondaryLabel}
        </Link>
        {footer ? <p className="auth-footer">{footer}</p> : null}
      </section>
    </main>
  );
}
