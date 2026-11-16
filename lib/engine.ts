// DES event-calendar engine — runs a correct discrete-event simulation from a canonical DesModel.
// NO wall-clock timing. All advancement is by virtual simulation time.

import { DesModel, DesNode, Distribution } from './model';
import { mulberry32 } from './prng';
import { ServerConfig } from './model';

// ─── Public types ─────────────────────────────────────────────────────────────

export type EventKind =
  | 'arrival'
  | 'queueEnter'
  | 'serviceStart'
  | 'serviceEnd'
  | 'departure';

/** Per-node state snapshot embedded in every trace event. */
export interface NodeSnapshot {
  queueLength: number;
  busyServers: number;
  generated?: number;   // source
  completed?: number;   // sink
}

/** One entry in the event trace. The `state` field is a full snapshot taken
 *  AFTER the event has been applied — suitable for O(1) random-access playback. */
export interface TraceEvent {
  id: string;
  t: number;
  seq: number;
  kind: EventKind;
  entityId: string;
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
  waitTime: number;        // serviceStart - arrival (0 if served immediately)
  serviceTime?: number;
  sojournTime?: number;    // departure - arrival
}

export interface RunMetrics {
  totalArrivals: number;
  totalDepartures: number;
  avgWaitTime: number;
  avgServiceTime: number;
  avgSojournTime: number;
  avgQueueLength: number;   // time-weighted
  avgUtilization: number;   // time-weighted busy fraction across all servers
  maxQueueLength: number;
  throughput: number;       // departures / horizon time
}

export interface EngineResult {
  trace: TraceEvent[];
  entities: EntityRecord[];
  metrics: RunMetrics;
  horizon: number;
  seed: number;
  runDurationMs: number;
  truncatedAt?: 'maxEvents';
}

export interface RunConfig {
  horizon: number;
  warmup: number;       // simulated time to exclude from metrics (default 0)
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
    [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571],
    [6, 2.447],  [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228],
    [12, 2.179], [15, 2.131],[20, 2.086],[25, 2.060], [30, 2.042],
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
  const se  = std / Math.sqrt(n);
  const t   = tCritical(n - 1);
  return { mean, std, lower: mean - t * se, upper: mean + t * se, n };
}

// ─── Replications ─────────────────────────────────────────────────────────────

export interface ReplicationResult {
  repIndex: number;
  seed: number;
  metrics: RunMetrics;
  entityCount: number;
}

export interface RunOutput {
  primary: EngineResult;      // first replication — used for playback
  reps: ReplicationResult[];
  ci: { [K in keyof RunMetrics]?: CIResult };
}

export function runReplications(model: DesModel, config: RunConfig): RunOutput {
  const reps: ReplicationResult[] = [];
  let primary: EngineResult | null = null;

  const n = Math.max(1, config.replications);
  for (let i = 0; i < n; i++) {
    // Each replication uses a distinct seed derived from the base
    const repConfig = { ...config, seed: config.seed + i * 1000, replications: 1 };
    const result = runSimulation(model, repConfig);
    if (i === 0) primary = result;
    reps.push({ repIndex: i, seed: repConfig.seed, metrics: result.metrics, entityCount: result.entities.length });
  }

  // Compute CI for each metric across replications
  const metricKeys: (keyof RunMetrics)[] = [
    'avgWaitTime', 'avgServiceTime', 'avgSojournTime',
    'avgQueueLength', 'avgUtilization', 'maxQueueLength',
    'throughput', 'totalArrivals', 'totalDepartures',
  ];
  const ci: RunOutput['ci'] = {};
  for (const key of metricKeys) {
    ci[key] = ciForValues(reps.map(r => r.metrics[key]));
  }

  return { primary: primary!, reps, ci };
}

// ─── Min-heap ─────────────────────────────────────────────────────────────────

class MinHeap<T> {
  private data: T[] = [];
  constructor(private cmp: (a: T, b: T) => number) {}

  push(item: T) {
    this.data.push(item);
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (!this.data.length) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length) { this.data[0] = last; this.siftDown(0); }
    return top;
  }

  get size() { return this.data.length; }

  private siftUp(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.data[i], this.data[p]) < 0) {
        [this.data[i], this.data[p]] = [this.data[p], this.data[i]]; i = p;
      } else break;
    }
  }

  private siftDown(i: number) {
    const n = this.data.length;
    while (true) {
      let m = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.cmp(this.data[l], this.data[m]) < 0) m = l;
      if (r < n && this.cmp(this.data[r], this.data[m]) < 0) m = r;
      if (m === i) break;
      [this.data[i], this.data[m]] = [this.data[m], this.data[i]]; i = m;
    }
  }
}

// ─── Distribution sampler ────────────────────────────────────────────────────

function sample(dist: Distribution, rand: () => number): number {
  switch (dist.kind) {
    case 'constant':
      return dist.value;

    case 'exponential': {
      const u = Math.min(rand(), 1 - 1e-10);
      return -Math.log(1 - u) * dist.mean;
    }

    case 'uniform':
      return dist.min + rand() * (dist.max - dist.min);

    case 'normal': {
      let v: number;
      let attempts = 0;
      do {
        const u1 = Math.max(1e-10, rand());
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
        v = dist.mean + z * dist.stddev;
        attempts++;
        if (attempts > 50) return Math.max(dist.mean, 0.001); // fallback after repeated rejects
      } while (dist.nonnegativePolicy === 'reject' && v <= 0);
      return v;
    }

    case 'triangular': {
      const u = rand();
      const { min: a, mode: c, max: b } = dist;
      const F = (c - a) / (b - a);
      return u < F
        ? a + Math.sqrt(u * (b - a) * (c - a))
        : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
  }
}

// ─── Internal calendar event ──────────────────────────────────────────────────

type CalEvent = {
  t: number;
  priority: 0 | 1; // 0 = serviceEnd fires before 1 = arrival on same t
  seq: number;
  kind: 'arrival' | 'serviceEnd';
  entityId: string;
  nodeId: string;    // source node for arrival; server node for serviceEnd
  serverSlot: number;
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export function runSimulation(model: DesModel, config: RunConfig): EngineResult {
  const startMs = performance.now();
  const rand = mulberry32(config.seed);

  // Build first-downstream adjacency (Phase 3: single downstream path)
  const downstream = new Map<string, string>();
  for (const edge of model.edges) {
    if (!downstream.has(edge.sourceId)) downstream.set(edge.sourceId, edge.targetId);
  }

  const nodeMap = new Map<string, DesNode>(model.nodes.map(n => [n.id, n]));

  // ── Per-node mutable state ────────────────────────────────────────────────

  type ServerState = {
    queue: Array<{ entityId: string; queuedAt: number }>;
    slots: Array<{ entityId: string | null; startedAt: number }>;
    totalQueueArea: number;
    totalBusyArea: number;
    lastT: number;
    maxQueueSeen: number;
  };

  const serverStates = new Map<string, ServerState>();
  for (const node of model.nodes) {
    if (node.config.kind !== 'server') continue;
    const cap = node.config.capacity;
    serverStates.set(node.id, {
      queue: [],
      slots: Array.from({ length: cap }, () => ({ entityId: null, startedAt: 0 })),
      totalQueueArea: 0,
      totalBusyArea: 0,
      lastT: 0,
      maxQueueSeen: 0,
    });
  }

  const sourceGenerated = new Map<string, number>();
  const sinkCompleted = new Map<string, number>();
  for (const node of model.nodes) {
    if (node.config.kind === 'source') sourceGenerated.set(node.id, 0);
    if (node.config.kind === 'sink') sinkCompleted.set(node.id, 0);
  }

  // ── Counters ──────────────────────────────────────────────────────────────

  let totalArrivals = 0;
  let totalDepartures = 0;
  let inSystem = 0;
  let seqCtr = 0;
  let entityCtr = 0;
  const trace: TraceEvent[] = [];
  const entityMap = new Map<string, EntityRecord>();

  // ── Helpers ───────────────────────────────────────────────────────────────

  function integrateServer(ss: ServerState, now: number) {
    const dt = now - ss.lastT;
    if (dt <= 0) return;
    // Only accumulate area within the observation window [config.warmup, ∞)
    const obsStart = Math.max(ss.lastT, config.warmup);
    const obsDt    = Math.max(0, now - obsStart);
    if (obsDt > 0) {
      const busy = ss.slots.filter(s => s.entityId !== null).length;
      ss.totalQueueArea += ss.queue.length * obsDt;
      ss.totalBusyArea  += busy * obsDt;
    }
    ss.lastT = now;
  }

  function snapshot(): Record<string, NodeSnapshot> {
    const ns: Record<string, NodeSnapshot> = {};
    for (const node of model.nodes) {
      if (node.config.kind === 'source') {
        ns[node.id] = { queueLength: 0, busyServers: 0, generated: sourceGenerated.get(node.id) ?? 0 };
      } else if (node.config.kind === 'server') {
        const ss = serverStates.get(node.id)!;
        ns[node.id] = {
          queueLength: ss.queue.length,
          busyServers: ss.slots.filter(s => s.entityId !== null).length,
        };
      } else {
        ns[node.id] = { queueLength: 0, busyServers: 0, completed: sinkCompleted.get(node.id) ?? 0 };
      }
    }
    return ns;
  }

  function emit(kind: EventKind, entityId: string, nodeId: string, t: number) {
    trace.push({
      id: `te-${trace.length}`,
      t,
      seq: seqCtr,
      kind,
      entityId,
      nodeId,
      state: {
        nodeStates: snapshot(),
        inSystem,
        totalArrivals,
        totalDepartures,
      },
    });
  }

  // ── Route entity to a node (server or sink) ───────────────────────────────

  function routeTo(entityId: string, nodeId: string, t: number): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    if (node.config.kind === 'sink') {
      const rec = entityMap.get(entityId)!;
      rec.departureTime = t;
      rec.sojournTime   = t - rec.arrivalTime;
      sinkCompleted.set(nodeId, (sinkCompleted.get(nodeId) ?? 0) + 1);
      totalDepartures++;
      inSystem--;
      emit('departure', entityId, nodeId, t);
      return;
    }

    if (node.config.kind === 'server') {
      const ss = serverStates.get(nodeId)!;
      integrateServer(ss, t);

      const freeSlot = ss.slots.findIndex(s => s.entityId === null);

      if (freeSlot >= 0) {
        // Start service immediately — no queue wait at this station
        ss.slots[freeSlot] = { entityId, startedAt: t };
        const rec = entityMap.get(entityId)!;
        rec.serviceStartTime = t;
        emit('serviceStart', entityId, nodeId, t);

        const svcDist = (node.config as ServerConfig).serviceDistribution;
        cal.push({
          t: t + sample(svcDist, rand),
          priority: 0,
          seq: seqCtr++,
          kind: 'serviceEnd',
          entityId,
          nodeId,
          serverSlot: freeSlot,
        });
      } else {
        // Join queue
        ss.queue.push({ entityId, queuedAt: t });
        ss.maxQueueSeen = Math.max(ss.maxQueueSeen, ss.queue.length);
        emit('queueEnter', entityId, nodeId, t);
      }
    }
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  const cal = new MinHeap<CalEvent>((a, b) =>
    a.t !== b.t ? a.t - b.t :
    a.priority !== b.priority ? a.priority - b.priority :
    a.seq - b.seq
  );

  // Schedule first arrival for each source
  for (const node of model.nodes) {
    if (node.config.kind !== 'source') continue;
    if (!downstream.has(node.id)) continue;
    const dt = sample(node.config.interarrivalDistribution, rand);
    cal.push({
      t: dt,
      priority: 1,
      seq: seqCtr++,
      kind: 'arrival',
      entityId: `e-${++entityCtr}`,
      nodeId: node.id,
      serverSlot: -1,
    });
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  let truncatedAt: 'maxEvents' | undefined;

  while (cal.size > 0 && trace.length < config.maxEvents) {
    const ev = cal.pop()!;
    const { t, kind, entityId, nodeId } = ev;

    if (kind === 'arrival') {
      const srcNode = nodeMap.get(nodeId);
      if (!srcNode || srcNode.config.kind !== 'source') continue;

      // Schedule next arrival (before updating state so it doesn't appear in snapshot yet)
      const nextDt = sample(srcNode.config.interarrivalDistribution, rand);
      const nextT  = t + nextDt;
      if (nextT <= config.horizon) {
        cal.push({
          t: nextT,
          priority: 1,
          seq: seqCtr++,
          kind: 'arrival',
          entityId: `e-${++entityCtr}`,
          nodeId,
          serverSlot: -1,
        });
      }

      // Register entity
      totalArrivals++;
      inSystem++;
      sourceGenerated.set(nodeId, (sourceGenerated.get(nodeId) ?? 0) + 1);
      entityMap.set(entityId, { id: entityId, arrivalTime: t, waitTime: 0 });

      emit('arrival', entityId, nodeId, t);

      // Route to downstream
      const downId = downstream.get(nodeId);
      if (downId) routeTo(entityId, downId, t);
    }

    else if (kind === 'serviceEnd') {
      const srvNode = nodeMap.get(nodeId);
      if (!srvNode || srvNode.config.kind !== 'server') continue;

      const ss = serverStates.get(nodeId)!;
      integrateServer(ss, t);

      const slot = ev.serverSlot >= 0
        ? ev.serverSlot
        : ss.slots.findIndex(s => s.entityId === entityId);
      if (slot < 0) continue;

      // Complete service
      const rec = entityMap.get(entityId)!;
      rec.serviceTime = t - (rec.serviceStartTime ?? t);
      emit('serviceEnd', entityId, nodeId, t);

      // Free the slot before routing (so snapshot at departure shows correct state)
      ss.slots[slot] = { entityId: null, startedAt: 0 };

      // Route completed entity downstream
      const downId = downstream.get(nodeId);
      if (downId) routeTo(entityId, downId, t);

      // Pull next entity from queue
      if (ss.queue.length > 0) {
        const { entityId: nextEid, queuedAt } = ss.queue.shift()!;
        ss.slots[slot] = { entityId: nextEid, startedAt: t };

        const nextRec = entityMap.get(nextEid)!;
        nextRec.serviceStartTime = t;
        nextRec.waitTime += t - queuedAt;  // accumulate queue wait across all stations

        emit('serviceStart', nextEid, nodeId, t);

        const svcDist = (srvNode.config as ServerConfig).serviceDistribution;
        cal.push({
          t: t + sample(svcDist, rand),
          priority: 0,
          seq: seqCtr++,
          kind: 'serviceEnd',
          entityId: nextEid,
          nodeId,
          serverSlot: slot,
        });
      }
    }
  }

  if (cal.size > 0) truncatedAt = 'maxEvents';

  // ── Finalize time-weighted metrics ────────────────────────────────────────

  // Integrate state from last event to end of horizon (state is constant in this tail period)
  // Use config.horizon as the denominator — conventional and consistent with M/M/c theory
  const obs = Math.max(config.horizon - config.warmup, 1);

  let totalQueueArea = 0, totalBusyArea = 0, totalCap = 0, maxQ = 0;
  for (const [, ss] of serverStates) {
    integrateServer(ss, config.horizon);
    totalQueueArea += ss.totalQueueArea;
    totalBusyArea  += ss.totalBusyArea;
    totalCap       += ss.slots.length;
    maxQ = Math.max(maxQ, ss.maxQueueSeen);
  }

  // Cohort: only entities that arrived during the observation window
  const completed = [...entityMap.values()].filter(
    e => e.departureTime !== undefined && e.arrivalTime >= config.warmup
  );
  const n = completed.length || 1;

  let sumWait = 0, sumSvc = 0, sumSojourn = 0;
  for (const e of completed) {
    sumWait    += e.waitTime;
    if (e.serviceTime !== undefined) sumSvc     += e.serviceTime;
    if (e.sojournTime !== undefined) sumSojourn += e.sojournTime;
  }

  const metrics: RunMetrics = {
    totalArrivals,
    totalDepartures,
    avgWaitTime:    sumWait    / n,
    avgServiceTime: sumSvc     / n,
    avgSojournTime: sumSojourn / n,
    avgQueueLength: totalQueueArea / obs,
    avgUtilization: totalCap > 0 ? (totalBusyArea / obs) / totalCap : 0,
    maxQueueLength: maxQ,
    throughput:     totalDepartures / obs,
  };

  return {
    trace,
    entities: [...entityMap.values()],
    metrics,
    horizon: config.horizon,
    seed: config.seed,
    runDurationMs: performance.now() - startMs,
    truncatedAt,
  };
}
