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

// Two-sided 95% Student-t critical values for every supported replication
// count (2–100). Keeping every degree of freedom avoids silently narrowing
// intervals by borrowing the value for a larger df or switching to z=1.96.
const T_CRITICAL_95 = [
  12.706204736175, 4.302652729749, 3.182446305284, 2.776445105198,
  2.570581835636, 2.446911851145, 2.364624251593, 2.306004135204,
  2.262157162798, 2.228138851986, 2.200985160092, 2.178812829667,
  2.160368656463, 2.144786687918, 2.13144954556, 2.119905299221,
  2.109815577833, 2.100922040241, 2.093024054408, 2.085963447266,
  2.079613844728, 2.073873067904, 2.068657610419, 2.063898561628,
  2.059538552753, 2.055529438643, 2.05183051648, 2.048407141795,
  2.045229642133, 2.042272456301, 2.039513446396, 2.03693334346,
  2.034515297449, 2.032244509318, 2.03010792825, 2.02809400098,
  2.026192463029, 2.024394163912, 2.022690920037, 2.021075390306,
  2.019540970441, 2.018081702818, 2.016692199228, 2.015367574444,
  2.014103388881, 2.012895598919, 2.01174051373, 2.010634757624,
  2.009575237129, 2.008559112101, 2.007583770316, 2.006646805062,
  2.005745995318, 2.004879288188, 2.004044783289, 2.003240718848,
  2.002465459291, 2.001717484145, 2.000995378088, 2.000297822014,
  1.999623584995, 1.998971517033, 1.998340542521, 1.997729654318,
  1.997137908392, 1.996564418952, 1.996008354025, 1.99546893143,
  1.994945415107, 1.994437111771, 1.993943367846, 1.993463566662,
  1.99299712589, 1.992543495181, 1.992102154002, 1.991672609645,
  1.991254395388, 1.990847068812, 1.99045021023, 1.990063421254,
  1.989686323457, 1.989318557137, 1.988959780175, 1.988609666976,
  1.988267907477, 1.987934206239, 1.987608281589, 1.987289864831,
  1.986978699506, 1.986674540704, 1.986377154419, 1.986086316951,
  1.985801814346, 1.985523441867, 1.985251003505, 1.984984311522,
  1.984723186014, 1.984467454508, 1.984216951586,
];

function tCritical(df: number): number {
  if (df <= 0) return Infinity;
  if (Number.isInteger(df) && df <= T_CRITICAL_95.length)
    return T_CRITICAL_95[df - 1];

  // ciForValues is public even though configured runs are capped at 100.
  // This expansion remains accurate for callers supplying larger samples.
  const z = 1.959963984540054;
  const z2 = z * z;
  return (
    z +
    (z * (z2 + 1)) / (4 * df) +
    (z * (5 * z2 * z2 + 16 * z2 + 3)) / (96 * df ** 2) +
    (z * (3 * z2 ** 3 + 19 * z2 ** 2 + 17 * z2 - 15)) /
      (384 * df ** 3)
  );
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
