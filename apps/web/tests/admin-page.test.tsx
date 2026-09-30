import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), hasAdminRole: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getSession: auth.getSession }));
vi.mock("@/lib/auth", () => ({ hasAdminRole: auth.hasAdminRole }));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));
vi.mock("@/components/admin-workspace", () => ({ AdminWorkspace: () => <div>authorized workspace</div> }));
import AdminPage from "@/app/admin/page";
beforeEach(() => { vi.clearAllMocks(); auth.redirect.mockImplementation(() => { throw new Error("redirect"); }); });
it("redirects anonymous visitors to the existing login endpoint", async () => {
  auth.getSession.mockResolvedValue(null);
  await expect(AdminPage()).rejects.toThrow("redirect");
  expect(auth.redirect).toHaveBeenCalledWith("/api/auth/login?callbackUrl=%2Fadmin");
});
it("denies non-admin users without mounting the workspace", async () => {
  auth.getSession.mockResolvedValue({}); auth.hasAdminRole.mockReturnValue(false);
  render(await AdminPage());
  expect(screen.getByRole("heading", { name: "ต้องมีสิทธิ์ผู้ดูแล" })).toBeInTheDocument();
  expect(screen.queryByText("authorized workspace")).not.toBeInTheDocument();
});
it("mounts the workspace only after server authorization", async () => {
  auth.getSession.mockResolvedValue({}); auth.hasAdminRole.mockReturnValue(true);
  render(await AdminPage());
  expect(screen.getByText("authorized workspace")).toBeInTheDocument();
});
