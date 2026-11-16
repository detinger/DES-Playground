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
const link = (source: string, target: string, sourceHandle = "out"): Edge => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
  targetHandle: ["store", "resource"].includes(sourceHandle)
    ? "association"
    : "in",
  label: sourceHandle === "out" ? undefined : sourceHandle,
  style: ["store", "resource"].includes(sourceHandle)
    ? { strokeDasharray: "6 4", stroke: "#a78bfa" }
    : undefined,
});
export const INVENTORY_NODES: Node<NodeData>[] = [
  simple("demand", "Customer demand", 0, 100, {
    type: "source",
    distribution: { type: "exponential", mean: 0.2 },
    quantityDistribution: { kind: "discreteUniform", min: 1, max: 4 },
  }),
  block("sales", "Fulfill demand", 240, 100, {
    kind: "stock",
    storeId: "inventory",
    operation: "fulfill",
    amount: quantity,
    unitCost: 0,
    unitRevenue: 100,
    waitingCost: 0,
  }),
  block("reorder", "Reorder needed?", 480, 100, {
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
  block("order", "Place replenishment order", 720, 100, {
    kind: "signal",
    quantity: {
      kind: "subtract",
      left: constant(30),
      right: { kind: "stock", nodeId: "inventory" },
    },
  }),
  simple("customers-done", "Customers leave", 960, 100, { type: "sink" }),
  // Purchase at placement; the delivery carries the fixed order quantity.
  block("purchase", "Purchase batch", 720, 330, {
    kind: "stock",
    storeId: "purchased",
    operation: "put",
    amount: quantity,
    unitCost: 50,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("delivery", "Delivery lead time", 960, 330, {
    type: "server",
    capacity: 1,
    distribution: { type: "constant", value: 2 },
  }),
  block("receive", "Receive delivery", 1200, 330, {
    kind: "stock",
    storeId: "inventory",
    operation: "put",
    amount: quantity,
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("orders-done", "Orders complete", 1440, 330, { type: "sink" }),
  block("inventory", "Inventory stock", 240, -120, {
    kind: "store",
    initial: 30,
    holdingCost: 2,
    fixedCost: 0,
    costPeriod: 1,
  }),
  block("order-gate", "One outstanding order", 960, 550, {
    kind: "resource",
    capacity: 1,
    costPerUnit: 0,
    costPeriod: 1,
  }),
  block("purchased", "Cumulative purchased units", 720, 550, {
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
  block("positions", "Operating positions", 0, 100, {
    kind: "population",
    count: 50,
    quantity: 1,
  }),
  block("operating", "Operating until failure", 240, 100, {
    kind: "delay",
    distribution: { kind: "uniform", min: 132, max: 182 },
    populationId: "positions",
  }),
  block("failure", "Failure · send machine to repair", 480, 100, {
    kind: "signal",
    quantity: constant(1),
  }),
  block("replace", "Wait for replacement", 720, 100, {
    kind: "stock",
    storeId: "spares",
    operation: "take",
    amount: constant(1),
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 20,
  }),
  simple("repair", "Repair machine", 480, 350, {
    type: "server",
    capacity: 3,
    distribution: { type: "uniform", min: 4, max: 10 },
  }),
  block("return", "Return repaired machine", 720, 350, {
    kind: "stock",
    storeId: "spares",
    operation: "put",
    amount: constant(1),
    unitCost: 0,
    unitRevenue: 0,
    waitingCost: 0,
  }),
  simple("repair-done", "Repair task complete", 960, 350, { type: "sink" }),
  block("spares", "Spare machines", 960, 100, {
    kind: "store",
    initial: 20,
    holdingCost: 0,
    fixedCost: 30,
    costPeriod: 8,
  }),
  block("crew", "Repair crew", 480, 570, {
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
