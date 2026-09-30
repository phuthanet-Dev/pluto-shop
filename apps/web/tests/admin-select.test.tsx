import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AdminSelect } from "@/components/admin/admin-select";
it("closes an open menu when the control becomes disabled", async () => {
  const change = vi.fn();
  const options = [{ value: "A", label: "หนึ่ง" }];
  const { rerender } = render(<AdminSelect label="ชนิด" value="A" options={options} onChange={change} />);
  await userEvent.click(screen.getByRole("combobox"));
  expect(screen.getByRole("listbox")).toBeVisible();
  rerender(<AdminSelect label="ชนิด" value="A" options={options} onChange={change} disabled />);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
});
it("supports keyboard choices, escape, outside close and unique control IDs", async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  const options = [{ value: "A", label: "หนึ่ง" }, { value: "B", label: "สอง" }, { value: "C", label: "สาม" }];
  render(<><AdminSelect label="ชนิด" value="A" options={options} onChange={change} /><AdminSelect label="ชนิดสอง" value="A" options={options} onChange={change} /></>);
  const trigger = screen.getByRole("combobox", { name: "ชนิด" });
  expect(trigger).toHaveTextContent("หนึ่ง");
  expect(trigger.getAttribute("aria-controls")).not.toBe(screen.getByRole("combobox", { name: "ชนิดสอง" }).getAttribute("aria-controls"));
  trigger.focus(); await user.keyboard("{ArrowDown}{End}{Home}{ArrowDown}{Enter}");
  expect(change).toHaveBeenCalledWith("B"); expect(trigger).toHaveFocus();
  await user.keyboard("{ArrowUp}{Escape}"); expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await user.click(trigger); fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
