import assert from "node:assert/strict";
import {
  fractionalShiftModel,
  overtakingJoinModel,
  nestedJoinModel,
  featureModels,
  priorityModel,
  batchModel,
  joinModel,
  shiftModel,
  node,
  edge,
  model,
} from "./fixtures/desFeatures";
import { DEFAULT_RUN_CONFIG, runSimulation } from "../lib/engine";
import { validateProcessModel } from "../lib/processValidation";
import {
  documentWorkspace,
  workspaceDocument,
  parseModelDocument,
  writeAutosave,
  readAutosave,
  saveModel,
  readLibrary,
} from "../lib/modelLibrary";
import {
  modelParameters,
  runSweep,
  parseSweepValues,
  sweepCSV,
} from "../lib/experiments";
const cfg = {
  ...DEFAULT_RUN_CONFIG,
  horizon: 12,
  stopMode: "horizon" as const,
  unit: "hour" as const,
};
const close = (a: number, b: number) =>
  assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
for (const [, m] of featureModels)
  assert.equal(
    validateProcessModel(m).hasErrors,
    false,
    JSON.stringify(validateProcessModel(m).issues),
  );
const priority = runSimulation(priorityModel, cfg);
assert.deepEqual(
  priority.trace
    .filter((e) => e.kind === "serviceStart")
    .map((e) => e.entityType),
  ["Regular", "Urgent", "Urgent", "Regular", "Regular"],
);
assert.deepEqual(
  priority.trace.filter((e) => e.kind === "serviceStart").map((e) => e.t),
  [0, 2, 4, 6, 8],
);
const batch = runSimulation(batchModel, cfg);
assert.equal(batch.metrics.totalArrivals, 3);
assert.equal(batch.metrics.totalDepartures, 2);
assert.equal(batch.measurements["batch:completed"].value, 1);
assert.equal(batch.stoppedWithPending, true);
assert.deepEqual(
  batch.entities
    .filter((e) => e.departureTime !== undefined)
    .map((e) => e.serviceTime),
  [2, 2],
);
const join = runSimulation(joinModel, cfg);
assert.equal(join.metrics.totalDepartures, 6);
assert.equal(join.measurements["join:completed"].value, 3);
assert(
  join.trace
    .filter((e) => e.kind === "assign")
    .every((e) => e.entityAttributes?.priority === 5),
);
assert.equal(
  join.trace.filter((e) => e.kind === "departure" && e.nodeId === "done")
    .length,
  3,
);
const shift = runSimulation(shiftModel, cfg);
assert.deepEqual(
  shift.trace.filter((e) => e.kind === "serviceStart").map((e) => e.t),
  [0, 4, 8],
);
close(shift.measurements["crew:staffed"].value, 6);
close(shift.measurements["crew:overtime"].value, 3);
close(shift.measurements["crew:cost"].value, 60);
close(shift.measurements["crew:utilization"].value, 100);
const fractional = runSimulation(fractionalShiftModel, { ...cfg, horizon: 1 });
close(fractional.trace.find((e) => e.kind === "serviceStart")!.t, 0.2);
close(fractional.measurements["crew:staffed"].value, 0.2);
const drain = runSimulation(shiftModel, {
  ...cfg,
  horizon: 1,
  stopMode: "drain",
});
assert.equal(drain.metrics.totalDepartures, 3);
assert.equal(drain.trace.at(-1)?.t, 11);
const warm = runSimulation(shiftModel, { ...cfg, warmup: 1, horizon: 5 });
close(warm.measurements["crew:staffed"].value, 2);
close(warm.measurements["crew:overtime"].value, 1);
const overlap = structuredClone(shiftModel);
const crew = overlap.nodes.find((n) => n.id === "crew")!.config;
if (crew.kind === "resource")
  crew.schedule!.intervals.push({ start: 1, end: 3, capacity: 2 });
assert(validateProcessModel(overlap).hasErrors);
const unrelated = structuredClone(joinModel);
unrelated.edges = unrelated.edges.filter(
  (e) => e.sourceId !== "fork" && e.sourceId !== "input",
);
unrelated.nodes = unrelated.nodes.filter((n) => n.id !== "fork");
unrelated.edges.push(edge("input", "join", "out", "a"));
unrelated.nodes.push(
  node("other", { kind: "population", count: 3, quantity: 1 }),
);
unrelated.edges.push(edge("other", "join", "out", "b"));
assert.throws(() => runSimulation(unrelated, cfg), /related Signal/);
const overtaking = runSimulation(overtakingJoinModel, { ...cfg, horizon: 3 });
assert.equal(overtaking.measurements["join:completed"].value, 1);
assert.equal(overtaking.metrics.totalDepartures, 2);
assert.equal(
  overtaking.trace.find((e) => e.kind === "join")?.entityAttributes?.group,
  1,
);
const nested = runSimulation(nestedJoinModel, cfg);
assert.equal(nested.metrics.totalArrivals, 6);
assert.equal(nested.metrics.totalDepartures, 6);
assert.equal(nested.measurements["innerJoin:completed"].value, 2);
assert.equal(nested.measurements["outerJoin:completed"].value, 2);
const stochastic = structuredClone(joinModel);
const route = stochastic.nodes.find((n) => n.id === "route")!.config;
if (route.kind === "router") route.probability = 0.5;
assert.deepEqual(
  runSimulation(stochastic, cfg).trace,
  runSimulation(stochastic, cfg).trace,
);
// Round trips preserve model semantics including source windows, attributes, ports and shifts.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  },
});
for (const [, m] of featureModels) {
  const doc = {
    format: "des-playground" as const,
    version: 1 as const,
    id: "saved",
    updatedAt: "2026-11-16",
    model: m,
    config: cfg,
  };
  const workspace = documentWorkspace(parseModelDocument(JSON.stringify(doc)));
  const roundtrip = workspaceDocument(workspace);
  assert.deepEqual(
    runSimulation(roundtrip.model, cfg).measurements,
    runSimulation(m, cfg).measurements,
  );
  writeAutosave(workspace);
  assert.equal(readAutosave()?.name, m.name);
  saveModel(roundtrip);
}
assert.equal(readLibrary().length, featureModels.length);
const savedFirst = readLibrary()[0];
const storedBefore = JSON.stringify(readLibrary());
const originalSet = localStorage.setItem;
localStorage.setItem = () => {
  throw new Error("Quota exceeded");
};
assert.throws(() => saveModel(savedFirst), /Quota/);
localStorage.setItem = originalSet;
assert.equal(JSON.stringify(readLibrary()), storedBefore);
const direct = structuredClone(shiftModel);
direct.edges = direct.edges.filter((e) => e.kind === "entityFlow");
const directDoc = { ...savedFirst, model: direct, config: cfg };
assert.deepEqual(
  runSimulation(workspaceDocument(documentWorkspace(directDoc)).model, cfg)
    .measurements,
  runSimulation(direct, cfg).measurements,
);
const legacy = workspaceDocument(documentWorkspace(readLibrary()[0]));
(legacy.model as any).schemaVersion = 2;
assert.equal(parseModelDocument(JSON.stringify(legacy)).model.schemaVersion, 3);
for (const config of [
  { kind: "surprise" },
  { kind: "decision", conditions: "broken" },
  {
    kind: "assign",
    assignments: [{ name: "__proto__", value: { kind: "constant", value: 0 } }],
  },
]) {
  const bad = structuredClone(legacy);
  (bad.model.nodes[0] as any).config = config;
  assert.throws(() => parseModelDocument(JSON.stringify(bad)), /malformed/);
}
assert.deepEqual(parseSweepValues("1, 2, 2, 3"), [1, 2, 3]);
assert.throws(() => parseSweepValues("1,,2"));
async function experiments() {
  const p = modelParameters(shiftModel).find(
    (p) => p.path.join(".") === "schedule.intervals.0.capacity",
  )!;
  const results = await runSweep(shiftModel, { ...cfg, replications: 2 }, [
    { parameterId: p.id, values: [1, 2] },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].metrics["crew:cost"].mean, 60);
  assert.equal(results[1].metrics["crew:cost"].mean, 120);
  assert.equal(results[1].metrics["crew:cost"].std, 0);
  assert.match(sweepCSV(results), /95% lower/);
  assert.deepEqual(results[0].seeds, results[1].seeds);
  assert.equal(
    (shiftModel.nodes.find((n) => n.id === "crew")!.config as any).schedule
      .intervals[0].capacity,
    1,
  );
  const controller = new AbortController();
  await assert.rejects(
    runSweep(
      shiftModel,
      { ...cfg, replications: 2 },
      [{ parameterId: p.id, values: [1, 2] }],
      { signal: controller.signal, progress: () => controller.abort() },
    ),
    /cancelled/,
  );
  await assert.rejects(
    runSweep(shiftModel, cfg, [{ parameterId: p.id, values: [-1] }]),
    /Scenario/,
  );
  console.log(
    "DES features: persistence, priorities, grouped batches, correlated joins, routing, shifts and experiments passed.",
  );
}
experiments().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
