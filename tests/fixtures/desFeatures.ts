import {
  SCHEMA_VERSION,
  type DesModel,
  type NodeConfig,
  type DesEdge,
} from "../../lib/model";
export const node = (id: string, config: NodeConfig) => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  config,
});
export const edge = (
  a: string,
  b: string,
  port: DesEdge["port"] = "out",
  targetPort: DesEdge["targetPort"] = "in",
): DesEdge => ({
  id: `${a}-${port}-${b}-${targetPort}`,
  sourceId: a,
  targetId: b,
  kind: "entityFlow",
  port,
  targetPort,
});
export const model = (
  nodes: DesModel["nodes"],
  edges: DesEdge[],
): DesModel => ({
  schemaVersion: SCHEMA_VERSION,
  id: "fixture",
  name: "Feature model",
  unit: "hour",
  nodes,
  edges,
});
export const activity = (
  value: number,
  extra: Record<string, unknown> = {},
): NodeConfig => ({
  kind: "server",
  capacity: 1,
  queueDiscipline: "fifo",
  serviceDistribution: { kind: "constant", value },
  ...extra,
});
export const priorityModel = model(
  [
    node("regular", {
      kind: "population",
      count: 3,
      quantity: 1,
      entityType: "Regular",
      attributes: { priority: 1 },
    }),
    node("urgent", {
      kind: "source",
      interarrivalDistribution: { kind: "constant", value: 0.5 },
      arrivalLimit: 2,
      attributes: { priority: 9 },
      entityType: "Urgent",
    }),
    node("service", activity(2, { queueDiscipline: "priority" })),
    node("done", { kind: "sink" }),
  ],
  [
    edge("regular", "service"),
    edge("urgent", "service"),
    edge("service", "done"),
  ],
);
// The first group is incomplete; a later complete group must still proceed.
export const batchModel = model(
  [
    node("lonely", {
      kind: "population",
      count: 1,
      quantity: 2,
      attributes: { group: 1 },
    }),
    node("pair", {
      kind: "population",
      count: 2,
      quantity: 3,
      attributes: { group: 2 },
    }),
    node("batch", { kind: "batch", size: 2, matchAttribute: "group" }),
    node("activity", activity(2)),
    node("unbatch", { kind: "unbatch" }),
    node("done", { kind: "sink" }),
  ],
  [
    edge("lonely", "batch"),
    edge("pair", "batch"),
    edge("batch", "activity"),
    edge("activity", "unbatch"),
    edge("unbatch", "done"),
  ],
);
export const joinModel = model(
  [
    node("input", {
      kind: "population",
      count: 3,
      quantity: 1,
      attributes: { priority: 2 },
    }),
    node("fork", { kind: "signal", quantity: { kind: "quantity" } }),
    node("delay", {
      kind: "delay",
      distribution: { kind: "constant", value: 3 },
    }),
    node("join", { kind: "join" }),
    node("assign", {
      kind: "assign",
      assignments: [
        {
          name: "priority",
          value: {
            kind: "add",
            left: { kind: "attribute", name: "priority" },
            right: { kind: "constant", value: 3 },
          },
        },
      ],
    }),
    node("route", { kind: "router", probability: 1 }),
    node("done", { kind: "sink" }),
    node("unused", { kind: "sink" }),
  ],
  [
    edge("input", "fork"),
    edge("fork", "delay", "out"),
    edge("fork", "join", "spawn", "b"),
    edge("delay", "join", "out", "a"),
    edge("join", "assign"),
    edge("assign", "route"),
    edge("route", "done", "true"),
    edge("route", "unused", "false"),
  ],
);
export const shiftModel = model(
  [
    node("input", { kind: "population", count: 3, quantity: 1 }),
    node("service", activity(3, { resourceId: "crew" })),
    node("crew", {
      kind: "resource",
      capacity: 1,
      costPerUnit: 10,
      costPeriod: 1,
      schedule: {
        period: 4,
        outsideCapacity: 0,
        intervals: [{ start: 0, end: 2, capacity: 1 }],
      },
    }),
    node("done", { kind: "sink" }),
  ],
  [
    edge("input", "service"),
    edge("service", "done"),
    {
      id: "association",
      kind: "resource",
      sourceId: "service",
      targetId: "crew",
    },
  ],
);
export const overtakingJoinModel = model(
  [
    node("slow", {
      kind: "population",
      count: 1,
      quantity: 1,
      attributes: { group: 0 },
    }),
    node("fast", {
      kind: "population",
      count: 1,
      quantity: 1,
      attributes: { group: 1 },
    }),
    node("fork", { kind: "signal", quantity: { kind: "quantity" } }),
    node("choose", {
      kind: "decision",
      conditions: [
        {
          left: { kind: "attribute", name: "group" },
          operator: "==",
          right: { kind: "constant", value: 0 },
        },
      ],
    }),
    node("slowDelay", {
      kind: "delay",
      distribution: { kind: "constant", value: 5 },
    }),
    node("fastDelay", {
      kind: "delay",
      distribution: { kind: "constant", value: 1 },
    }),
    node("join", { kind: "join" }),
    node("done", { kind: "sink" }),
  ],
  [
    edge("slow", "fork"),
    edge("fast", "fork"),
    edge("fork", "join", "out", "a"),
    edge("fork", "choose", "spawn"),
    edge("choose", "slowDelay", "true"),
    edge("choose", "fastDelay", "false"),
    edge("slowDelay", "join", "out", "b"),
    edge("fastDelay", "join", "out", "b"),
    edge("join", "done"),
  ],
);
export const nestedJoinModel = model(
  [
    node("input", { kind: "population", count: 2, quantity: 1 }),
    node("outer", { kind: "signal", quantity: { kind: "quantity" } }),
    node("inner", { kind: "signal", quantity: { kind: "quantity" } }),
    node("innerJoin", { kind: "join" }),
    node("outerJoin", { kind: "join" }),
    node("done", { kind: "sink" }),
  ],
  [
    edge("input", "outer"),
    edge("outer", "outerJoin", "out", "a"),
    edge("outer", "inner", "spawn"),
    edge("inner", "innerJoin", "out", "a"),
    edge("inner", "innerJoin", "spawn", "b"),
    edge("innerJoin", "outerJoin", "out", "b"),
    edge("outerJoin", "done"),
  ],
);

export const fractionalShiftModel = structuredClone(shiftModel);
for (const n of fractionalShiftModel.nodes) {
  if (n.config.kind === "resource")
    n.config.schedule = {
      period: 1,
      outsideCapacity: 0,
      intervals: [{ start: 0.2, end: 0.4, capacity: 1 }],
    };
  if (n.config.kind === "server")
    n.config.serviceDistribution = { kind: "constant", value: 0.05 };
  if (n.config.kind === "population") n.config.count = 1;
}
export const featureModels = [
  ["priority", priorityModel],
  ["batch", batchModel],
  ["join", joinModel],
  ["shifts", shiftModel],
  ["overtakingJoin", overtakingJoinModel],
  ["nestedJoin", nestedJoinModel],
  ["fractionalShifts", fractionalShiftModel],
] as const;
