import { runProcessModel } from "./processEngine";
// DES event-calendar engine — runs a correct discrete-event simulation from a canonical DesModel.
// NO wall-clock timing. All advancement is by virtual simulation time.

import { DesModel } from "./model";

// ─── Public types ─────────────────────────────────────────────────────────────

export type EventKind =
  | "arrival"
  | "queueEnter"
  | "serviceStart"
  | "serviceEnd"
  | "departure"
  | "initial"
  | "decision"
  | "signal"
  | "stockChange"
  | "horizon"
  | "assign"
  | "batch"
  | "unbatch"
  | "join"
  | "shift";

/** Per-node state snapshot embedded in every trace event. */
export interface NodeSnapshot {
  queueLength: number;
  busyServers: number;
  generated?: number; // source
  completed?: number; // sink
  stock?: number;
  available?: number;
  quantity?: number;
  capacity?: number;
}

/** One entry in the event trace. The `state` field is a full snapshot taken
 *  AFTER the event has been applied — suitable for O(1) random-access playback. */
export interface TraceEvent {
  id: string;
  t: number;
  seq: number;
  kind: EventKind;
  entityId: string;
  detail?: string;
  entityAttributes?: Record<string, number>;
  entityType?: string;
  correlation?: string;
  nodeId: string;
  state: {
    nodeStates: Record<string, NodeSnapshot>;
    inSystem: number;
    totalArrivals: number;
    totalDepartures: number;
  };
}

export interface EntityRecord {
  id: string;
  arrivalTime: number;
  serviceStartTime?: number;
  departureTime?: number;
  waitTime: number; // serviceStart - arrival (0 if served immediately)
  serviceTime?: number;
  sojournTime?: number; // departure - arrival
}

export interface RunMetrics {
  totalArrivals: number;
  totalDepartures: number;
  avgWaitTime: number;
  avgServiceTime: number;
  avgSojournTime: number;
  avgQueueLength: number; // time-weighted
  avgUtilization: number; // time-weighted busy fraction across all servers
  maxQueueLength: number;
  throughput: number; // departures / horizon time
}

export interface Measurement {
  label: string;
  value: number;
  unit: string;
  lowerIsBetter: boolean | null;
}
export interface EngineResult {
  measurements: Record<string, Measurement>;
  unit: import("./model").TimeUnit;
  stoppedWithPending?: boolean;
  trace: TraceEvent[];
  entities: EntityRecord[];
  metrics: RunMetrics;
  horizon: number;
  seed: number;
  runDurationMs: number;
  truncatedAt?: "maxEvents";
}

export interface RunConfig {
  unit?: import("./model").TimeUnit;
  stopMode?: "horizon" | "drain";
  horizon: number;
  warmup: number; // simulated time to exclude from metrics (default 0)
  replications: number; // independent runs (default 1)
  maxEvents: number;
  seed: number;
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  horizon: 500,
  warmup: 0,
  replications: 1,
  maxEvents: 50_000,
  seed: 42,
};

// ─── CI helpers ───────────────────────────────────────────────────────────────

function tCritical(df: number): number {
  if (df <= 0) return Infinity;
  const TABLE: Array<[number, number]> = [
    [1, 12.706],
    [2, 4.303],
    [3, 3.182],
    [4, 2.776],
    [5, 2.571],
    [6, 2.447],
    [7, 2.365],
    [8, 2.306],
    [9, 2.262],
    [10, 2.228],
    [12, 2.179],
    [15, 2.131],
    [20, 2.086],
    [25, 2.06],
    [30, 2.042],
  ];
  for (const [d, t] of TABLE) if (df <= d) return t;
  return 1.96;
}

export interface CIResult {
  mean: number;
  std: number;
  lower: number;
  upper: number;
  n: number;
}

export function ciForValues(values: number[]): CIResult {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, lower: 0, upper: 0, n: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { mean, std: 0, lower: mean, upper: mean, n: 1 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const se = std / Math.sqrt(n);
  const t = tCritical(n - 1);
  return { mean, std, lower: mean - t * se, upper: mean + t * se, n };
}

// ─── Replications ─────────────────────────────────────────────────────────────

export interface ReplicationResult {
  repIndex: number;
  seed: number;
  metrics: RunMetrics;
  entityCount: number;
  measurements: Record<string, Measurement>;
}

export interface RunOutput {
  measurementCI: Record<string, CIResult>;
  primary: EngineResult; // first replication — used for playback
  reps: ReplicationResult[];
  ci: { [K in keyof RunMetrics]?: CIResult };
}

export function runReplications(model: DesModel, config: RunConfig): RunOutput {
  if (
    !Number.isInteger(config.replications) ||
    config.replications < 1 ||
    config.replications > 100
  )
    throw new Error("Use 1–100 replications.");
  if (
    !Number.isInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 4294967295
  )
    throw new Error("Use an integer seed from 0 to 4,294,967,295.");
  const reps: ReplicationResult[] = [];
  let primary: EngineResult | null = null;

  const n = Math.max(1, config.replications);
  for (let i = 0; i < n; i++) {
    // Each replication uses a distinct seed derived from the base
    const repConfig = {
      ...config,
      seed: (config.seed + i * 1000) % 4294967296,
      replications: 1,
    };
    const result = runSimulation(model, repConfig);
    if (i === 0) primary = result;
    reps.push({
      repIndex: i,
      seed: repConfig.seed,
      metrics: result.metrics,
      measurements: result.measurements,
      entityCount: result.entities.length,
    });
  }

  // Compute CI for each metric across replications
  const metricKeys: (keyof RunMetrics)[] = [
    "avgWaitTime",
    "avgServiceTime",
    "avgSojournTime",
    "avgQueueLength",
    "avgUtilization",
    "maxQueueLength",
    "throughput",
    "totalArrivals",
    "totalDepartures",
  ];
  const ci: RunOutput["ci"] = {};
  for (const key of metricKeys) {
    ci[key] = ciForValues(reps.map((r) => r.metrics[key]));
  }

  const measurementCI = Object.fromEntries(
    Object.keys(primary!.measurements).map((key) => [
      key,
      ciForValues(reps.map((r) => r.measurements[key].value)),
    ]),
  );
  return { primary: primary!, reps, ci, measurementCI };
}

export function runSimulation(
  model: DesModel,
  config: RunConfig,
): EngineResult {
  return runProcessModel(model, config);
}
