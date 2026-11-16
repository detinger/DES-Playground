// Canonical DES model types — independent of React Flow representation

export const SCHEMA_VERSION = 3 as const;

export type Id = string;
export type TimeUnit = "second" | "minute" | "hour" | "day";

export type NodeKind = NodeConfig["kind"];

// Canonical distribution union — parameterised by physical meaning, not by number.
export type Distribution =
  | { kind: "discreteUniform"; min: number; max: number }
  | { kind: "constant"; value: number }
  | { kind: "exponential"; mean: number }
  | { kind: "uniform"; min: number; max: number }
  | {
      kind: "normal";
      mean: number;
      stddev: number;
      nonnegativePolicy: "reject" | "truncate";
    }
  | { kind: "triangular"; min: number; mode: number; max: number };

// Per-kind node configurations
export interface SourceConfig {
  kind: "source";
  interarrivalDistribution: Distribution;
  quantityDistribution?: Distribution;
  entityType?: string;
  attributes?: Record<string, number>;
  startTime?: number;
  endTime?: number;
  arrivalLimit?: number;
}

export interface ServerConfig {
  kind: "server";
  capacity: number;
  serviceDistribution: Distribution;
  queueDiscipline: "fifo" | "priority";
  priorityAttribute?: string;
  resourceId?: Id;
}

export interface SinkConfig {
  kind: "sink";
  completionCategory?: string;
}

// Expressions are data, evaluated by the runtime and emitted by both exporters.
export type Value =
  | { kind: "constant"; value: number }
  | { kind: "quantity" }
  | { kind: "attribute"; name: string }
  | { kind: "stock" | "available"; nodeId: Id }
  | { kind: "subtract" | "add" | "multiply"; left: Value; right: Value };
export interface Condition {
  left: Value;
  operator: "<" | "<=" | "==" | ">" | ">=";
  right: Value;
}
export interface PopulationConfig {
  kind: "population";
  count: number;
  quantity: number;
  entityType?: string;
  attributes?: Record<string, number>;
}
export interface DelayConfig {
  kind: "delay";
  distribution: Distribution;
  populationId?: Id;
}
export interface ShiftSchedule {
  period: number;
  outsideCapacity: number;
  intervals: { start: number; end: number; capacity: number }[];
}
export interface ResourceConfig {
  kind: "resource";
  capacity: number;
  schedule?: ShiftSchedule;
  costPerUnit: number;
  costPeriod: number;
}
export interface StoreConfig {
  kind: "store";
  initial: number;
  holdingCost: number;
  fixedCost: number;
  costPeriod: number;
}
export interface StockConfig {
  kind: "stock";
  storeId: Id;
  operation: "take" | "put" | "fulfill";
  amount: Value;
  unitCost: number;
  unitRevenue: number;
  waitingCost: number;
}
export interface DecisionConfig {
  kind: "decision";
  conditions: Condition[];
}
export interface SignalConfig {
  kind: "signal";
  quantity: Value;
}
export interface AssignConfig {
  kind: "assign";
  assignments: { name: string; value: Value }[];
}
export interface RouterConfig {
  kind: "router";
  probability: number;
}
export interface BatchConfig {
  kind: "batch";
  size: number;
  matchAttribute?: string;
}
export interface UnbatchConfig {
  kind: "unbatch";
}
export interface JoinConfig {
  kind: "join";
}
export type AdvancedConfig =
  | AssignConfig
  | RouterConfig
  | BatchConfig
  | UnbatchConfig
  | JoinConfig
  | PopulationConfig
  | DelayConfig
  | ResourceConfig
  | StoreConfig
  | StockConfig
  | DecisionConfig
  | SignalConfig;
export type NodeConfig =
  SourceConfig | ServerConfig | SinkConfig | AdvancedConfig;
export const isExtendedModel = (model: DesModel) =>
  model.nodes.some(
    (n) =>
      !["source", "server", "sink"].includes(n.config.kind) ||
      (n.config.kind === "server" &&
        (!!n.config.resourceId || n.config.queueDiscipline === "priority")),
  );

export interface DesNode {
  id: Id;
  name: string;
  config: NodeConfig;
  position: { x: number; y: number };
}

export interface DesEdge {
  id: Id;
  sourceId: Id;
  targetId: Id;
  kind: "entityFlow" | "resource" | "store";
  port?: "out" | "true" | "false" | "spawn";
  targetPort?: "in" | "a" | "b";
  routingWeight?: number;
}

export interface DesModel {
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  name: string;
  unit: TimeUnit;
  nodes: DesNode[];
  edges: DesEdge[];
  metadata?: {
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

// ─── Validation ────────────────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "recommendation" | "info";
export type ValidationCategory =
  | "structure"
  | "semantic"
  | "parameter"
  | "units"
  | "statistics"
  | "feasibility";

export interface ValidationIssue {
  id: string;
  severity: Severity;
  category: ValidationCategory;
  nodeId?: Id;
  edgeId?: Id;
  field?: string;
  title: string;
  explanation: string;
  consequence: string;
  suggestedFix?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}
