import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AdminDisclosure } from "@/components/admin/admin-disclosure";
it("collapses non-secret fields without losing their values", () => {
  render(<AdminDisclosure title="รายละเอียดเพิ่มเติม"><input aria-label="ทดสอบ" /></AdminDisclosure>);
  expect(screen.getByLabelText("ทดสอบ")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "รายละเอียดเพิ่มเติม" }));
  fireEvent.change(screen.getByLabelText("ทดสอบ"), { target: { value: "retained" } });
  fireEvent.click(screen.getByRole("button", { name: "รายละเอียดเพิ่มเติม" }));
  fireEvent.click(screen.getByRole("button", { name: "รายละเอียดเพิ่มเติม" }));
  expect(screen.getByLabelText("ทดสอบ")).toHaveValue("retained");
});
it("supports validation opening a controlled disclosure", () => {
  const change = () => {};
  const { rerender } = render(<AdminDisclosure title="ตัวเลือก" open={false} onOpenChange={change}>เนื้อหา</AdminDisclosure>);
  rerender(<AdminDisclosure title="ตัวเลือก" open onOpenChange={change}>เนื้อหา</AdminDisclosure>);
  expect(screen.getByText("เนื้อหา")).toBeVisible();
});
