import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "@/app/not-found";

it("offers a neutral 404 heading and branded return to the existing Thai route", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lost beyond the catalog");
  expect(screen.getByRole("link", { name: "Return to Phuto Shop" })).toHaveAttribute("href", "/th");
});
