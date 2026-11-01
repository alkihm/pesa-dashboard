import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { foldSlices, niceMax } from "./charts/chartMath";
import type { DonutSlice } from "./charts/Donut";
import { Chip } from "./Chip";
import { NumberField, TextField } from "./Field";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

describe("Segmented", () => {
  function Harness() {
    const [value, setValue] = useState<"a" | "b">("a");
    return (
      <Segmented
        label="Period"
        value={value}
        onChange={setValue}
        options={[
          { value: "a", label: "Month" },
          { value: "b", label: "Year" },
        ]}
      />
    );
  }

  it("marks the selected option and switches on click", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Period" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    expect(screen.getByRole("button", { name: "Year" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Switch", () => {
  it("is a named switch that toggles", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Bill reminders" />);
    const toggle = screen.getByRole("switch", { name: "Bill reminders" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Chip", () => {
  it("exposes its selected state", () => {
    render(<Chip selected>Food</Chip>);
    expect(screen.getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("fields", () => {
  it("label the input and link the hint or error", () => {
    render(
      <>
        <NumberField label="Amount" hint="Shillings" />
        <TextField label="Reference" error="Already recorded" />
      </>,
    );
    const amount = screen.getByLabelText("Amount");
    expect(amount).toHaveAttribute("inputmode", "decimal");
    expect(amount).toHaveAccessibleDescription("Shillings");
    const reference = screen.getByLabelText("Reference");
    expect(reference).toHaveAttribute("aria-invalid", "true");
    expect(reference).toHaveAccessibleDescription("Already recorded");
  });
});

describe("chart helpers", () => {
  const slice = (key: string, value: number): DonutSlice => ({ key, label: key, value, colour: "cat-1" });

  it("folds small donut slices into Other, largest first", () => {
    const folded = foldSlices(
      [slice("a", 5), slice("b", 50), slice("c", 1), slice("d", 2), slice("e", 0)],
      3,
    );
    expect(folded.map((s) => s.key)).toEqual(["b", "a", "other"]);
    expect(folded[2]).toMatchObject({ value: 3, colour: "cat-12" });
  });

  it("keeps every slice when there are few enough", () => {
    expect(foldSlices([slice("a", 1), slice("b", 2)], 6)).toHaveLength(2);
  });

  it("rounds the bar axis to a readable top", () => {
    expect(niceMax(21_000_000)).toBe(24_000_000);
    expect(niceMax(170)).toBe(200);
    expect(niceMax(0)).toBe(4);
  });
});
