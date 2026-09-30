import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useEffect } from "react";
const state = vi.hoisted(() => ({ dirty: false, busy: false }));
vi.mock("@/components/admin-products-console", () => ({
  AdminProductsConsole: ({ onNavigationStateChange }: { onNavigationStateChange: (s: typeof state) => void }) => {
    useEffect(() => onNavigationStateChange({ ...state }), [onNavigationStateChange]);
    return <h1>รายการสินค้าทดสอบ</h1>;
  },
}));
vi.mock("@/components/admin-fulfillment-console", () => ({ AdminFulfillmentConsole: () => <h1>การส่งมอบทดสอบ</h1> }));
import { AdminWorkspace } from "@/components/admin-workspace";
it("mounts only the selected task", () => {
  state.dirty = false; state.busy = false;
  render(<AdminWorkspace />);
  expect(screen.getByText("รายการสินค้าทดสอบ")).toBeInTheDocument();
  expect(screen.queryByText("การส่งมอบทดสอบ")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "การส่งมอบ" }));
  expect(screen.getByText("การส่งมอบทดสอบ")).toBeInTheDocument();
  expect(screen.queryByText("รายการสินค้าทดสอบ")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "การส่งมอบ" })).toHaveAttribute("aria-pressed", "true");
});
it("confirms dirty navigation and preserves the current console on cancel", () => {
  state.dirty = true; state.busy = false;
  render(<AdminWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "การส่งมอบ" }));
  fireEvent.click(screen.getByRole("button", { name: "แก้ไขต่อ" }));
  expect(screen.getByText("รายการสินค้าทดสอบ")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "การส่งมอบ" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ละทิ้งการแก้ไข" }));
  expect(screen.getByText("การส่งมอบทดสอบ")).toBeInTheDocument();
});
it("restores focus to the requesting control after keeping the draft", async () => {
  state.dirty = true; state.busy = false;
  const user = userEvent.setup();
  render(<AdminWorkspace />);
  const target = screen.getByRole("button", { name: "การส่งมอบ" });
  await user.click(target);
  await user.click(screen.getByRole("button", { name: "แก้ไขต่อ" }));
  await waitFor(() => expect(target).toHaveFocus());
});
it("blocks task and explicit link navigation while busy", () => {
  state.dirty = true; state.busy = true;
  render(<AdminWorkspace />);
  expect(screen.getByRole("button", { name: "การส่งมอบ" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "ไปหน้าร้าน" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("link", { name: "ไปหน้าร้าน" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
