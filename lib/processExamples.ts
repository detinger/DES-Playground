import type { NodeData } from "../types";
import type { Node, Edge } from "@xyflow/react";
import type { AdvancedConfig, Value } from "./model";
const constant = (value: number): Value => ({ kind: "constant", value });
const quantity: Value = { kind: "quantity" };
const block = (
  id: string,
  label: string,
  x: number,
  y: number,
  process: AdvancedConfig,
): Node<NodeData> => ({
  id,
  type: process.kind,
  position: { x, y },
  data: { label, type: process.kind, process },
});
const simple = (
  id: string,
  label: string,
  x: number,
  y: number,
  data: Partial<NodeData>,
): Node<NodeData> => ({
  id,
  type: data.type!,
  position: { x, y },
  data: { label, type: data.type!, ...data },
});
const link = (source: string, target: string, sourceHandle = "out"): Edge => {
  const isAssoc = ["store", "resource"].includes(sourceHandle);
  return {
    id: `${source}-${sourceHandle}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle: isAssoc ? "association" : "in",
    label: sourceHandle === "out" ? undefined : sourceHandle,
    type: "smoothstep",
    animated: !isAssoc,
    style: isAssoc
      ? { strokeDasharray: "6 4", stroke: "#a78bfa" }
      : { stroke: "var(--primary)", strokeWidth: 2 },
  };
};
export const INVENTORY_NODES: Node<NodeData>[] = [
  simple("demand", "Customer demand", 7.58, 100.42, {
    type: "source",
    distribution: { type: "exponential", mean: 0.2 },
    quantityDistribution: { kind: "discreteUniform", min: 1, max: 4 },
  }),
  block("sales", "Fulfill demand", 241.47, 91.15, {
    kind: "stock",
    storeId: "inventory",
    operation: "fulfill",
    amount: quantity,
    unitCost: 0,
    unitRevenue: 100,
    waitingCost: 0,
  }),
  block("reorder", "Reorder needed?", 457, 100, {
    kind: "decision",
    conditions: [
      {
        left: { kind: "stock", nodeId: "inventory" },
        operator: "<",
        right: constant(10),
      },
      {
        left: { kind: "available", nodeId: "order-gate" },
        operator: ">",
        right: constant(0),
      },
    ],
  }),
  block("order", "Place replenishment order", 721, -18, {
    kind: "signal",
    quantity: {
      kind: "subtract",
      left: constant(30),
      right: { kind: "stock", nodeId: "inventory" },
    },
  }),
  simple("customers-done", "Customers leave", 1258, 55.53, { type: "sink" }),
  block("purchase", "Purchase batch", 1069.05, 187.42, {
    kind: "stock",
    storeId: "purchased",
    operation: "put",
    amount: quantity,
    unitCost: 50,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("delivery", "Delivery lead time", 1301.58, 187.53, {
    type: "server",
    capacity: 1,
    distribution: { type: "constant", value: 2 },
  }),
  block("receive", "Receive delivery", 1520.58, 188, {
    kind: "stock",
    storeId: "inventory",
    operation: "put",
    amount: quantity,
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("orders-done", "Orders complete", 1748.37, 196.85, { type: "sink" }),
  block("inventory", "Inventory stock", 240.87, 318.47, {
    kind: "store",
    initial: 30,
    holdingCost: 2,
    fixedCost: 0,
    costPeriod: 1,
  }),
  block("order-gate", "One outstanding order", 1357.19, 395.85, {
    kind: "resource",
    capacity: 1,
    costPerUnit: 0,
    costPeriod: 1,
  }),
  block("purchased", "Cumulative purchased units", 964.85, 395.73, {
    kind: "store",
    initial: 0,
    holdingCost: 0,
    fixedCost: 0,
    costPeriod: 1,
  }),
];
export const INVENTORY_EDGES: Edge[] = [
  link("demand", "sales"),
  link("sales", "reorder"),
  link("sales", "inventory", "store"),
  link("reorder", "order", "true"),
  link("reorder", "customers-done", "false"),
  link("order", "customers-done"),
  link("order", "purchase", "spawn"),
  link("purchase", "purchased", "store"),
  link("purchase", "delivery"),
  link("delivery", "order-gate", "resource"),
  link("delivery", "receive"),
  link("receive", "inventory", "store"),
  link("receive", "orders-done"),
];
export const FACTORY_NODES: Node<NodeData>[] = [
  block("positions", "Operating positions", -66.03, 315.93, {
    kind: "population",
    count: 50,
    quantity: 1,
  }),
  block("operating", "Operating until failure", 174.86, 239.19, {
    kind: "delay",
    distribution: { kind: "uniform", min: 132, max: 182 },
    populationId: "positions",
  }),
  block("failure", "Failure · send machine to repair", 259.61, 31.30, {
    kind: "signal",
    quantity: constant(1),
  }),
  block("replace", "Wait for replacement", 642.71, -45.44, {
    kind: "stock",
    storeId: "spares",
    operation: "take",
    amount: constant(1),
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 20,
  }),
  simple("repair", "Repair machine", 508.55, 347.32, {
    type: "server",
    capacity: 3,
    distribution: { type: "uniform", min: 4, max: 10 },
  }),
  block("return", "Return repaired machine", 659.33, 201.88, {
    kind: "stock",
    storeId: "spares",
    operation: "put",
    amount: constant(1),
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("repair-done", "Repair task complete", 992.12, 386.58, { type: "sink" }),
  block("spares", "Spare machines", 1054.58, 118.74, {
    kind: "store",
    initial: 20,
    holdingCost: 0,
    fixedCost: 30,
    costPeriod: 8,
  }),
  block("crew", "Repair crew", 509.44, 461.14, {
    kind: "resource",
    capacity: 3,
    costPerUnit: 30,
    costPeriod: 8,
  }),
];
export const FACTORY_EDGES: Edge[] = [
  link("positions", "operating"),
  link("operating", "failure"),
  link("failure", "replace"),
  link("failure", "repair", "spawn"),
  link("replace", "spares", "store"),
  link("replace", "operating"),
  link("repair", "crew", "resource"),
  link("repair", "return"),
  link("return", "spares", "store"),
  link("return", "repair-done"),
];
