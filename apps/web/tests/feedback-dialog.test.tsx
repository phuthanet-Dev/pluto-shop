import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FeedbackDialog } from "@/components/ui/feedback-dialog";

describe("FeedbackDialog", () => {
  it("renders a themed danger confirmation with accessible actions", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <FeedbackDialog
        open
        onOpenChange={onOpenChange}
        tone="danger"
        title="ยืนยันการยกเลิก"
        description="รายการจะยังอยู่ในรถเข็นของคุณ"
        closeLabel="ปิดหน้าต่าง"
        cancelLabel="กลับไปชำระเงิน"
        confirmLabel="ยืนยันยกเลิก"
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "ยืนยันการยกเลิก" });
    expect(dialog).toHaveAttribute("data-tone", "danger");
    expect(within(dialog).getByText("รายการจะยังอยู่ในรถเข็นของคุณ")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "กลับไปชำระเงิน" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "ยืนยันยกเลิก" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("supports a notice with one primary close action", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <FeedbackDialog
        open
        onOpenChange={onOpenChange}
        tone="success"
        title="บันทึกสำเร็จ"
        description="การเปลี่ยนแปลงถูกบันทึกแล้ว"
        closeLabel="ปิดหน้าต่าง"
        confirmLabel="เข้าใจแล้ว"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "บันทึกสำเร็จ" });
    expect(dialog).toHaveAttribute("data-tone", "success");
    expect(within(dialog).queryByRole("button", { name: "ยกเลิก" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "เข้าใจแล้ว" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
