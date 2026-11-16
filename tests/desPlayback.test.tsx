import "./domSetup";
import React from "react";
import assert from "node:assert/strict";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import App from "../App";
async function main() {
  localStorage.clear();
  render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  fireEvent.click(screen.getByRole("button", { name: "DES Modeler" }));
  for (const template of ["Inventory template", "Factory template"]) {
    fireEvent.click(screen.getByRole("button", { name: template }));
    fireEvent.click(screen.getByRole("button", { name: "Run model" }));
    // Run must visibly start the model, not leave it paused at the initial state.
    assert(screen.getByRole("button", { name: "Pause" }));
    const slider = screen.getByRole("slider", {
      name: "Playback event",
    }) as HTMLInputElement;
    await waitFor(() => assert(Number(slider.value) > 0), { timeout: 3000 });
    const panel = screen.getByRole("region", { name: "Simulation playback" });
    const canvas = document.querySelector(".des-workbench")!;
    assert(
      panel.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING,
      "Playback controls must appear before the canvas",
    );
    assert(within(panel).getByText(/In system:/));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const paused = slider.value;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    assert.equal(slider.value, paused, "Pause must stop the clock");
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    assert.equal(Number(slider.value), Number(paused) + 1);
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    assert.equal(slider.value, slider.max);
    assert(screen.getByText("Playback finished"));
    const done = JSON.parse(localStorage.getItem("des-model-autosave")!);
    assert(done.model.nodes.every((n: any) => !("simState" in n.config)));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() =>
      assert(
        Number(slider.value) > 0 && Number(slider.value) < Number(slider.max),
      ),
    );
    fireEvent.change(screen.getByLabelText("Horizon"), {
      target: { value: "10" },
    });
    assert.equal(
      screen.queryByRole("region", { name: "Simulation playback" }),
      null,
      "Editing a model must stop stale playback",
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "New blank model" }));
  fireEvent.click(screen.getByRole("button", { name: "Run model" }));
  assert(screen.getByText("No entities can enter"));
  assert.equal(screen.queryByRole("button", { name: "Pause" }), null);
  cleanup();
  window.close();
  console.log(
    "DES playback: Run starts both templates, progress is visible, pause/step/end/replay and edit invalidation pass in StrictMode.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  cleanup();
  window.close();
});
