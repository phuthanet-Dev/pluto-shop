import { describe, expect, it } from "vitest";
import {
  hasAdminRole,
  mergeRealmRoles,
  publicAppRedirect,
  safeCallbackPath,
  sessionRoles,
} from "@/lib/auth";

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

  it("merges realm roles from verified OIDC claim sources", () => {
    expect(
      mergeRealmRoles(
        { realm_access: { roles: ["CUSTOMER"] } },
        { realm_access: { roles: ["ADMIN", "CUSTOMER"] } },
        { "realm_access.roles": ["EDITOR"] },
      ),
    ).toEqual(["CUSTOMER", "ADMIN", "EDITOR"]);
  });

  it("preserves normalized roles inside the encrypted session payload", () => {
    expect(sessionRoles(["CUSTOMER", "ADMIN", 7, null])).toEqual([
      "CUSTOMER",
      "ADMIN",
    ]);
  });

  it("redirects callbacks to the configured public app origin", () => {
    expect(publicAppRedirect("/th", "http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/th",
    );
    expect(publicAppRedirect("/\\\\evil.example", "http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/admin",
    );
  });
});
