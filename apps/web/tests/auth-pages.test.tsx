import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import LogoutPage from "@/app/logout/page";

describe("Pluto Shop authentication pages", () => {
  it("renders the branded login page without handling passwords locally", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ callbackUrl: "/en" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to login" })).toHaveAttribute(
      "href",
      "/api/auth/login?callbackUrl=%2Fen",
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?callbackUrl=%2Fen",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders the branded signup page with a secure hosted-auth CTA", async () => {
    render(
      await SignupPage({
        searchParams: Promise.resolve({ callbackUrl: "/en" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to signup" })).toHaveAttribute(
      "href",
      "/api/auth/signup?callbackUrl=%2Fen",
    );
    expect(screen.getByRole("link", { name: "I already have an account" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fen",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders a clear sign-out confirmation and keeps the logout action server-side", async () => {
    render(
      await LogoutPage({
        searchParams: Promise.resolve({ callbackUrl: "/en" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "See you in orbit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign out securely" })).toHaveAttribute(
      "href",
      "/api/auth/logout?callbackUrl=%2Fen",
    );
    expect(screen.getByRole("link", { name: "Return to Pluto Shop" })).toHaveAttribute(
      "href",
      "/en",
    );
  });
});
