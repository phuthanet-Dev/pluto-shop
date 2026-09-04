"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

type AccountUser = {
  name?: string;
  email?: string;
  roles: string[];
};

export type AccountMenuCopy = {
  account: string;
  accountMenu: string;
  accountMenuFor: (name: string) => string;
  signedInAs: string;
  admin: string;
  language: string;
  login: string;
  signup: string;
  logout: string;
  switchLocale: string;
  localeShort: string;
};

type AccountMenuProps = {
  locale: Locale;
  localeHref: string;
  user?: AccountUser;
  copy: AccountMenuCopy;
};

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/u).filter(Boolean);
  if (parts.length > 1) {
    return `${Array.from(parts[0])[0] ?? ""}${Array.from(parts[1])[0] ?? ""}`.toUpperCase();
  }
  return Array.from(label.trim()).slice(0, 2).join("").toUpperCase();
}

function getFirstName(label: string) {
  return label.trim().split(/\s+/u)[0] || label;
}

export function AccountMenu({ locale, localeHref, user, copy }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpenRef = useRef<"first" | "last">("first");
  const menuId = `account-menu-${useId()}`;
  const displayName = user?.name ?? user?.email ?? copy.account;
  const triggerName = user?.name ? getFirstName(user.name) : displayName;
  const authenticated = Boolean(user);
  const isAdmin = user?.roles.includes("ADMIN") ?? false;
  const initials = getInitials(displayName);
  const email = user?.email;
  const callbackUrl = encodeURIComponent(`/${locale}`);
  const loginHref = `/api/auth/login?callbackUrl=${callbackUrl}`;
  const signupHref = `/api/auth/signup?callbackUrl=${callbackUrl}`;
  const logoutHref = `/api/auth/logout?callbackUrl=${callbackUrl}`;

  const getMenuItems = useCallback(() => {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
  }, []);

  const focusMenuItem = useCallback((position: "first" | "last") => {
    const items = getMenuItems();
    if (items.length === 0) return;
    items[position === "first" ? 0 : items.length - 1]?.focus();
  }, [getMenuItems]);

  function openMenu(position: "first" | "last" = "first") {
    focusOnOpenRef.current = position;
    if (open) {
      focusMenuItem(position);
    } else {
      setOpen(true);
    }
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    focusMenuItem(focusOnOpenRef.current);
  }, [focusMenuItem, open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        closeMenu();
      } else {
        openMenu("first");
      }
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = getMenuItems();
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    if (items.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (activeIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      (document.activeElement as HTMLElement).click();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  return (
    <div className="account-menu-container" ref={containerRef}>
      <button
        ref={triggerRef}
        className="account-trigger"
        type="button"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          authenticated ? copy.accountMenuFor(displayName) : copy.accountMenu
        }
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="account-avatar" aria-hidden="true">
          {authenticated ? (
            initials
          ) : (
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="8.5" r="3.25" />
              <path d="M5.5 19.25c.75-3.15 3.05-4.75 6.5-4.75s5.75 1.6 6.5 4.75" />
            </svg>
          )}
        </span>
        <span className="account-trigger-label">
          {authenticated ? triggerName : copy.account}
        </span>
        <span className="account-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="account-menu" id={menuId}>
          {authenticated ? (
            <div className="account-summary">
              <span className="account-avatar account-avatar-large" aria-hidden="true">
                {initials}
              </span>
              <div>
                <span className="account-summary-label">{copy.signedInAs}</span>
                <strong>{displayName}</strong>
                {email && email !== displayName ? <span>{email}</span> : null}
              </div>
            </div>
          ) : null}
          <div
            ref={menuRef}
            className="account-menu-list"
            role="menu"
            aria-label={copy.accountMenu}
            onKeyDown={handleMenuKeyDown}
          >
            {isAdmin ? (
              <>
                <Link
                  className="account-menu-item"
                  href="/admin"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => closeMenu()}
                >
                  <span className="account-menu-item-icon" aria-hidden="true">⌘</span>
                  <span>{copy.admin}</span>
                </Link>
                <div className="account-menu-separator" role="separator" />
              </>
            ) : null}
            {authenticated ? (
              <Link
                className="account-menu-item account-menu-item-danger"
                href={logoutHref}
                prefetch={false}
                role="menuitem"
                tabIndex={-1}
                onClick={() => closeMenu()}
              >
                <span className="account-menu-item-icon" aria-hidden="true">↪</span>
                <span>{copy.logout}</span>
              </Link>
            ) : (
              <>
                <Link
                  className="account-menu-item"
                  href={loginHref}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => closeMenu()}
                >
                  <span className="account-menu-item-icon" aria-hidden="true">↗</span>
                  <span>{copy.login}</span>
                </Link>
                <Link
                  className="account-menu-item account-menu-item-primary"
                  href={signupHref}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => closeMenu()}
                >
                  <span className="account-menu-item-icon" aria-hidden="true">＋</span>
                  <span>{copy.signup}</span>
                </Link>
              </>
            )}
            <div className="account-menu-separator" role="separator" />
            <Link
              className="account-menu-item account-menu-language-item"
              href={localeHref}
              hrefLang={locale === "th" ? "en" : "th"}
              role="menuitem"
              scroll={false}
              tabIndex={-1}
              aria-label={copy.switchLocale}
              onClick={() => closeMenu()}
            >
              <span className="account-menu-item-icon" aria-hidden="true">文</span>
              <span>{copy.language}</span>
              <span className="account-menu-item-meta">{copy.localeShort}</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
