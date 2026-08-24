import { describe, expect, it } from "vitest";
import { hasAdminRole, safeCallbackPath } from "@/lib/auth";

describe("OIDC auth boundaries", () => {
  it("accepts only same-origin relative callback paths", () => {
    expect(safeCallbackPath("/admin")).toBe("/admin");
    expect(safeCallbackPath("/admin?tab=products")).toBe("/admin?tab=products");
    expect(safeCallbackPath("https://evil.example/steal")).toBe("/admin");
    expect(safeCallbackPath("//evil.example/steal")).toBe("/admin");
    expect(safeCallbackPath("/\\\\evil.example/steal")).toBe("/admin");
    expect(safeCallbackPath("admin")).toBe("/admin");
  });

  it("requires the server-side ADMIN role", () => {
    expect(hasAdminRole({ roles: ["CUSTOMER"] })).toBe(false);
    expect(hasAdminRole({ roles: ["CUSTOMER", "ADMIN"] })).toBe(true);
    expect(hasAdminRole({ roles: undefined })).toBe(false);
  });
});
