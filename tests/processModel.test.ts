import { featureModels } from "./fixtures/desFeatures";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileModel } from "../lib/compiler";
import {
  INVENTORY_NODES,
  INVENTORY_EDGES,
  FACTORY_NODES,
  FACTORY_EDGES,
} from "../lib/processExamples";
import {
  runSimulation,
  runReplications,
  DEFAULT_RUN_CONFIG,
} from "../lib/engine";
import { validateProcessModel } from "../lib/processValidation";
import { generateProcessCode } from "../lib/processExport";
import { EXAMPLES } from "../lib/theoryContent";
import { detectMMc } from "../lib/theory";
const close = (a: number, b: number, message = "") =>
  assert(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);
const inv = compileModel(INVENTORY_NODES, INVENTORY_EDGES, { unit: "day" });
const factory = compileModel(FACTORY_NODES, FACTORY_EDGES, { unit: "hour" });
const cfg = {
  ...DEFAULT_RUN_CONFIG,
  horizon: 35,
  warmup: 0,
  seed: 3,
  stopMode: "horizon" as const,
};
assert(!validateProcessModel(inv).hasErrors);
assert(!validateProcessModel(factory).hasErrors);
assert.equal(detectMMc(inv), null);
for (const model of [inv, factory]) {
  const config = { ...cfg, horizon: model === factory ? 2080 : 35 };
  for (const seed of [0, 3, 42]) {
    const a = runSimulation(model, { ...config, seed }),
      b = runSimulation(model, { ...config, seed });
    assert.deepEqual(a.measurements, b.measurements);
    assert.deepEqual(a.trace, b.trace);
    assert(!a.truncatedAt);
    assert.equal(a.trace.at(-1)!.t, config.horizon);
    const settled = [...new Map(a.trace.map((e) => [e.t, e])).values()];
    for (const e of settled) {
      for (const n of model.nodes) {
        const s = e.state.nodeStates[n.id];
        assert(s.busyServers >= 0);
        assert(s.queueLength >= 0);
        if (n.config.kind === "resource")
          assert(s.available! >= 0 && s.available! <= n.config.capacity);
        if (n.config.kind === "store") assert(s.stock! >= 0);
      }
      if (model === factory && e.t > 0) {
        const s = e.state.nodeStates;
        close(
          s.operating.busyServers + s.replace.queueLength,
          50,
          "operating positions",
        );
        close(
          s.operating.busyServers +
            s.spares.stock! +
            s.repair.queueLength +
            s.repair.busyServers,
          70,
          "physical machines",
        );
      }
    }
    close(
      a.measurements.balance.value,
      a.measurements.revenue.value - a.measurements.cost.value,
    );
  }
}
// Inventory with independently calculated stock/cost trajectory.
const deterministic = structuredClone(inv);
const source = deterministic.nodes.find((n) => n.id === "demand")!.config;
assert(source.kind === "source");
source.interarrivalDistribution = { kind: "constant", value: 1 };
source.quantityDistribution = { kind: "constant", value: 4 };
const store = deterministic.nodes.find((n) => n.id === "inventory")!.config;
assert(store.kind === "store");
store.initial = 10;
const decision = deterministic.nodes.find((n) => n.id === "reorder")!.config;
assert(decision.kind === "decision");
decision.conditions[0].right = { kind: "constant", value: 5 };
const order = deterministic.nodes.find((n) => n.id === "order")!.config;
assert(order.kind === "signal");
order.quantity = {
  kind: "subtract",
  left: { kind: "constant", value: 10 },
  right: { kind: "stock", nodeId: "inventory" },
};
const deterministicCfg = { ...cfg, horizon: 5 };
const exact = runSimulation(deterministic, deterministicCfg);
close(exact.measurements["sales:units"].value, 14);
close(exact.measurements["sales:lost"].value, 2);
close(exact.measurements["inventory:stock"].value, 4);
close(exact.measurements["purchase:cost"].value, 700);
close(exact.measurements["inventory:cost"].value, 44);
close(exact.measurements.balance.value, 656);
const short = runSimulation(factory, { ...cfg, horizon: 8 });
close(short.measurements.cost.value, 690);
close(short.measurements["operating:active"].value, 50);
const warm = runSimulation(deterministic, { ...deterministicCfg, warmup: 2 });
close(warm.measurements["inventory:cost"].value, 12);
// Changing a graph edge changes behavior; missing associations fail validation.
const changed = structuredClone(deterministic);
changed.edges.find(
  (e) => e.sourceId === "sales" && e.kind === "entityFlow",
)!.targetId = "customers-done";
const changedRun = runSimulation(changed, deterministicCfg);
close(changedRun.measurements["purchase:cost"].value, 0);
close(changedRun.measurements["sales:lost"].value, 6);
const dangling = structuredClone(inv);
dangling.nodes = dangling.nodes.filter((n) => n.id !== "inventory");
assert(validateProcessModel(dangling).hasErrors);
const reps = runReplications(deterministic, {
  ...deterministicCfg,
  replications: 3,
});
close(reps.measurementCI.balance.mean, 656);
close(reps.measurementCI.balance.std, 0);
assert.throws(() => runSimulation(inv, { ...cfg, warmup: 35 }));
assert.throws(
  () => runSimulation(factory, { ...cfg, stopMode: "drain" }),
  /cycles/,
);
assert.throws(() => runReplications(inv, { ...cfg, replications: NaN }));
assert.throws(() => runReplications(inv, { ...cfg, seed: 4294967296 }));
const zeroCycle = structuredClone(factory);
const zeroDelay = zeroCycle.nodes.find((n) => n.id === "operating")!.config;
if (zeroDelay.kind === "delay")
  zeroDelay.distribution = { kind: "constant", value: 0 };
assert(validateProcessModel(zeroCycle).hasErrors);
// Queueing models continue to execute and conserve entities.
for (const ex of EXAMPLES.filter(
  (x) => !["factory", "inventory"].includes(x.id),
)) {
  const model = compileModel(ex.nodes, ex.edges);
  const r = runSimulation(model, { ...DEFAULT_RUN_CONFIG, ...ex.config });
  assert(!r.truncatedAt, ex.id);
  assert.equal(r.metrics.totalArrivals, r.metrics.totalDepartures, ex.id);
  assert(r.metrics.avgWaitTime >= 0);
}
const folder = mkdtempSync(join(tmpdir(), "des-exports-"));
try {
  const queue = EXAMPLES.find((x) => x.id === "det-single")!;
  for (const [name, model, config] of [
    ...featureModels.map(
      ([name, model]) =>
        [name, model, { ...cfg, horizon: 12, unit: "hour" as const }] as const,
    ),
    ["inventory", inv, cfg],
    ["factory", factory, { ...cfg, horizon: 2080 }],
    ["deterministic", deterministic, deterministicCfg],
    [
      "queue",
      compileModel(queue.nodes, queue.edges),
      { ...DEFAULT_RUN_CONFIG, ...queue.config },
    ],
  ] as const) {
    for (const language of ["python", "r"] as const) {
      const file = join(folder, name + (language === "python" ? ".py" : ".R"));
      writeFileSync(file, generateProcessCode(model, config, language));
      const executable =
        language === "python"
          ? process.env.DES_PYTHON
          : process.env.DES_RSCRIPT;
      if (!executable) continue;
      const result = spawnSync(executable, [file], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 90000,
      });
      assert.equal(result.status, 0, `${language} ${name}: ${result.stderr}`);
      const values = JSON.parse(result.stdout).replications[0];
      if (
        language === "python" ||
        [
          "deterministic",
          "queue",
          ...featureModels.map(([name]) => name),
        ].includes(name)
      ) {
        const expected = runSimulation(model, config).measurements;
        for (const [key, m] of Object.entries(expected))
          close(values[key], m.value, `${language} ${name} ${key}`);
      }
    }
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}
console.log(
  "Process engine: conservation, exact accounting, graph edits, horizons, replication, queue regression and configured export runtimes passed.",
);
