import "./domSetup";
import React from "react";
import assert from "node:assert/strict";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import App from "../App";
async function main() {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Examples" }));
  assert.equal(screen.queryByText("Open lab"), null);
  fireEvent.click(
    screen.getAllByRole("button", { name: "Open DES Modeler" })[0],
  );
  assert.equal(
    screen
      .getByRole("button", { name: "DES Modeler" })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "2080",
  );
  fireEvent.change(screen.getByLabelText("Horizon"), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run model" }));
  const results = screen.getByRole("table", {
    name: "Results and replication confidence intervals",
  });
  assert(
    within(results)
      .getByText("Total cost")
      .closest("tr")!
      .textContent!.includes("690.000"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save baseline" }));
  fireEvent.change(screen.getByLabelText("Horizon"), {
    target: { value: "16" },
  });
  await waitFor(() =>
    assert.equal(
      screen.queryByRole("table", {
        name: "Results and replication confidence intervals",
      }),
      null,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Run model" }));
  assert(screen.getByText("Baseline", { selector: "th" }));
  fireEvent.click(screen.getByRole("button", { name: "Formal view" }));
  assert(screen.getByText("Places, activities and state changes"));
  assert(screen.getByText(/Create 50 entities at time zero/));
  fireEvent.click(screen.getByRole("button", { name: "Queue Modeler" }));
  assert.equal(
    screen
      .getByRole("button", { name: "Queue Modeler" })
      .getAttribute("aria-current"),
    "page",
  );
  fireEvent.click(screen.getByRole("button", { name: "DES Modeler" }));
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "16",
  );
  fireEvent.click(screen.getByRole("button", { name: "Inventory template" }));
  assert.equal(
    (screen.getByLabelText("Time unit") as HTMLSelectElement).value,
    "day",
  );
  fireEvent.click(screen.getByRole("button", { name: "Run model" }));
  assert(
    screen.getByRole("table", {
      name: "Results and replication confidence intervals",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Store" }));
  fireEvent.change(screen.getByLabelText("Initial stock"), {
    target: { value: "55" },
  });
  assert.equal(
    (screen.getByLabelText("Initial stock") as HTMLInputElement).value,
    "55",
  );
  assert.equal(
    screen.queryByRole("table", {
      name: "Results and replication confidence intervals",
    }),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
  fireEvent.click(screen.getByRole("button", { name: "New blank model" }));
  fireEvent.click(screen.getByRole("button", { name: "Run model" }));
  assert(screen.getByText("No entities can enter"));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "35",
  );
  fireEvent.change(screen.getByLabelText("Model name"), {
    target: { value: "Saved inventory" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save new copy" }));
  assert(screen.getByText("Saved a new copy in this browser."));
  fireEvent.change(screen.getByLabelText("Horizon"), {
    target: { value: "42" },
  });
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "35",
  );
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "42",
  );
  fireEvent.click(screen.getByRole("button", { name: "Load model" }));
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "35",
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "42",
  );
  fireEvent.click(screen.getByRole("button", { name: "Factory template" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.equal(
    (screen.getByLabelText("Model name") as HTMLInputElement).value,
    "Saved inventory",
  );
  cleanup();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "DES Modeler" }));
  assert.equal(
    (screen.getByLabelText("Model name") as HTMLInputElement).value,
    "Saved inventory",
  );
  assert.equal(
    (screen.getByLabelText("Horizon") as HTMLInputElement).value,
    "42",
  );
  fireEvent.change(screen.getByLabelText("Horizon"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Replications"), {
    target: { value: "2" },
  });
  fireEvent.click(
    screen.getByText("Parameter experiments", { selector: "summary" }),
  );
  const options = Array.from(
    (screen.getByLabelText("First parameter") as HTMLSelectElement).options,
  );
  const parameter =
    options.find((x) => x.textContent?.includes("Inventory · initial")) ??
    options.find(
      (x) => x.value.includes("inventory") && x.value.includes("initial"),
    )!;
  assert(parameter);
  fireEvent.change(screen.getByLabelText("First parameter"), {
    target: { value: parameter.value },
  });
  fireEvent.change(screen.getByLabelText("First parameter values"), {
    target: { value: "10, 20" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run experiment" }));
  await waitFor(
    () => assert(screen.getByRole("table", { name: "Experiment results" })),
    { timeout: 10000 },
  );
  assert.equal(
    within(
      screen.getByRole("table", { name: "Experiment results" }),
    ).getAllByRole("row").length,
    3,
  );
  fireEvent.change(screen.getByLabelText("Horizon"), {
    target: { value: "3" },
  });
  assert.equal(
    screen.queryByRole("table", { name: "Experiment results" }),
    null,
  );
  fireEvent.click(screen.getByRole("button", { name: "Source" }));
  fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
  fireEvent.change(screen.getByLabelText("Attribute 1 value"), {
    target: { value: "8" },
  });
  assert.equal(
    (screen.getByLabelText("Attribute 1 name") as HTMLInputElement).value,
    "priority",
  );
  fireEvent.click(screen.getByRole("button", { name: "Activity + queue" }));
  fireEvent.change(screen.getByLabelText("Queue discipline"), {
    target: { value: "priority" },
  });
  assert.equal(
    (screen.getByLabelText("Priority attribute") as HTMLInputElement).value,
    "priority",
  );
  fireEvent.click(screen.getByRole("button", { name: "Resource pool" }));
  fireEvent.click(screen.getByLabelText("Use repeating shifts"));
  fireEvent.change(screen.getByLabelText("Shift 1 start"), {
    target: { value: "9" },
  });
  assert.equal(
    (screen.getByLabelText("Shift 1 start") as HTMLInputElement).value,
    "9",
  );
  const before = screen.getByLabelText("Model name").getAttribute("value");
  fireEvent.change(screen.getByLabelText("Import model file"), {
    target: { files: [{ text: async () => '{"no":"model"}' }] },
  });
  await waitFor(() => assert(screen.getByText(/Import failed/)));
  assert.equal(
    screen.getByLabelText("Model name").getAttribute("value"),
    before,
  );
  cleanup();
  console.log(
    "DOM features: library, JSON import rejection, autosave reload, undo/redo, experiment results and new block properties passed.",
  );
  console.log(
    "DOM integration: example routing, independent modelers, editable parameters, run invalidation, baseline and formal views passed.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  cleanup();
});
