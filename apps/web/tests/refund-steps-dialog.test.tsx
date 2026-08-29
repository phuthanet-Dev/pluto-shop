import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RefundStepsDialog } from "@/components/ui/refund-steps-dialog";

describe("RefundStepsDialog", () => {
  it("renders the themed refund instructions and closes from the primary action", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <RefundStepsDialog
        open
        onOpenChange={onOpenChange}
        title="Refund request steps"
        subtitle="For an incorrect top-up"
        warning="Funds added to the system cannot be refunded under the website policy."
        steps={[
          { title: "Contact your bank", description: "Request a transfer recall.", tone: "blue" },
          { title: "Provide the amount and details", description: "Share the transfer details.", tone: "violet" },
          { title: "Wait for the bank's process", description: "Processing takes 3–7 business days.", tone: "green" },
        ]}
        note="The store will cooperate when contacted by the bank."
        closeLabel="Close refund instructions"
        understoodLabel="Understood"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Refund request steps" });
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(within(dialog).getByText("For an incorrect top-up")).toBeInTheDocument();
    expect(within(dialog).getByText("Funds added to the system cannot be refunded under the website policy.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(within(dialog).getByText("The store will cooperate when contacted by the bank.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Understood" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
