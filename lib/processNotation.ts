import type { DesModel, Value, NodeConfig, AdvancedConfig } from "./model";
import type { NodeData } from "../types";
export const BLOCK_LABELS: Record<NodeConfig["kind"], string> = {
  assign: "Assign attributes",
  router: "Probability route",
  batch: "Batch",
  unbatch: "Unbatch",
  join: "Join branches",
  source: "Source",
  population: "Initial population",
  server: "Activity + queue",
  delay: "Delay",
  decision: "Decision",
  signal: "Signal",
  stock: "Stock operation",
  store: "Store",
  resource: "Resource pool",
  sink: "Sink",
};
export function defaultBlock(kind: NodeConfig["kind"]): NodeData {
  const data: NodeData = { type: kind, label: BLOCK_LABELS[kind] };
  const configs: Record<string, AdvancedConfig> = {
    assign: {
      kind: "assign",
      assignments: [
        { name: "priority", value: { kind: "constant", value: 1 } },
      ],
    },
    router: { kind: "router", probability: 0.5 },
    batch: { kind: "batch", size: 2 },
    unbatch: { kind: "unbatch" },
    join: { kind: "join" },
    population: { kind: "population", count: 10, quantity: 1 },
    delay: { kind: "delay", distribution: { kind: "constant", value: 1 } },
    decision: {
      kind: "decision",
      conditions: [
        {
          left: { kind: "quantity" },
          operator: ">",
          right: { kind: "constant", value: 1 },
        },
      ],
    },
    signal: { kind: "signal", quantity: { kind: "constant", value: 1 } },
    stock: {
      kind: "stock",
      storeId: "",
      operation: "take",
      amount: { kind: "quantity" },
      unitCost: 0,
      unitRevenue: 0,
      waitingCost: 0,
    },
    store: {
      kind: "store",
      initial: 10,
      holdingCost: 0,
      fixedCost: 0,
      costPeriod: 1,
    },
    resource: { kind: "resource", capacity: 1, costPerUnit: 0, costPeriod: 1 },
  };
  if (kind === "source") data.distribution = { type: "exponential", mean: 5 };
  if (kind === "server") {
    data.distribution = { type: "constant", value: 1 };
    data.capacity = 1;
  }
  if (configs[kind]) data.process = configs[kind];
  return data;
}
export function describeValue(v: Value, model: DesModel): string {
  if (v.kind === "constant") return String(v.value);
  if (v.kind === "quantity") return "entity.quantity";
  if (v.kind === "attribute") return `entity.${v.name}`;
  if (v.kind === "subtract" || v.kind === "add" || v.kind === "multiply")
    return `(${describeValue(v.left, model)} ${v.kind === "subtract" ? "−" : v.kind === "add" ? "+" : "×"} ${describeValue(v.right, model)})`;
  return `${model.nodes.find((n) => n.id === ("nodeId" in v ? v.nodeId : ""))?.name ?? "Missing reference"}.${v.kind === "stock" ? "stock" : "available"}`;
}
export function describeRules(c: NodeConfig, model: DesModel): string {
  switch (c.kind) {
    case "assign":
      return c.assignments
        .map((a) => `${a.name} = ${describeValue(a.value, model)}`)
        .join("; ");
    case "router":
      return `True with probability ${c.probability}; false otherwise. One draw per entity.`;
    case "batch":
      return `Wait for ${c.size} entities${c.matchAttribute ? ` with the same ${c.matchAttribute}` : ""}; carry them as one batch, preserving members. Incomplete groups wait.`;
    case "unbatch":
      return "Release the original batch members with their identities and attributes.";
    case "join":
      return "Wait for related Signal branches at a and b. Keep a, complete b, and continue. Match the most recent shared fork.";
    case "source":
      return "Schedule recurring arrivals; each entity carries a sampled quantity, a type and numeric attributes.";
    case "population":
      return `Create ${c.count} entities at time zero, each with quantity ${c.quantity}.`;
    case "server":
      return `${c.queueDiscipline === "priority" ? `Descending ${c.priorityAttribute ?? "priority"}, FIFO ties; nonpreemptive` : "FIFO"} wait → acquire one ${c.resourceId ? model.nodes.find((n) => n.id === c.resourceId)?.name : "internal resource"} → delay → release → continue.`;
    case "delay":
      return "All incoming entities start independent delays immediately; no capacity is seized.";
    case "decision":
      return c.conditions
        .map(
          (x) =>
            `${describeValue(x.left, model)} ${x.operator} ${describeValue(x.right, model)}`,
        )
        .join(" AND ");
    case "signal":
      return `Create a separate entity with quantity ${describeValue(c.quantity, model)} on spawn; the original continues on out.`;
    case "resource":
      return `${c.schedule ? `Repeating ${c.schedule.period} ${model.unit} schedule: ${c.schedule.intervals.map((i) => `${i.start}–${i.end}: ${i.capacity} units`).join("; ")}; ${c.schedule.outsideCapacity} units outside shifts; existing work finishes. Scheduled cost is prorated.` : `${c.capacity} reusable units.`} A unit is reserved from activity start until completion. Cost: $${c.costPerUnit}/unit per ${c.schedule ? "prorated" : "started"} ${c.costPeriod} ${model.unit}(s).`;
    case "store":
      return `Initial stock ${c.initial}; holding cost $${c.holdingCost}/unit/${model.unit}; capacity cost $${c.fixedCost}/initial unit per started ${c.costPeriod} ${model.unit}(s).`;
    case "stock":
      return `${c.operation} ${describeValue(c.amount, model)} units. ${c.operation === "take" ? "Wait FIFO until the whole quantity is available." : c.operation === "fulfill" ? "Transfer the available quantity immediately; the remainder is lost demand." : "Add units and wake eligible waiting requests."} $${c.unitCost} cost and $${c.unitRevenue} revenue per transferred unit; $${c.waitingCost}/waiting entity/${model.unit}.`;
    case "sink":
      return "Complete this entity; remove it from the process.";
  }
}
