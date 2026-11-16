// SimPy 4 code generator — compiles from canonical DesModel + RunConfig.
// Produces semantically equivalent code using the same metric definitions
// as the TypeScript browser engine (time-weighted Lq / ρ̂, entity-cohort Wq / W).

import { DesModel, Distribution } from './model';
import { RunConfig } from './engine';

// ── Helpers ────────────────────────────────────────────────────────────────────

function pyId(name: string): string {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node');
}

function distExpr(d: Distribution): string {
  switch (d.kind) {
    case 'exponential': return `random.expovariate(1.0 / ${d.mean})`;
    case 'constant':    return `${d.value}`;
    case 'uniform':     return `random.uniform(${d.min}, ${d.max})`;
    case 'normal':      return `max(0.0, random.gauss(${d.mean}, ${d.stddev}))`;
    case 'triangular':  return `random.triangular(${d.min}, ${d.max}, ${d.mode})`;
  }
}

function distLabel(d: Distribution): string {
  switch (d.kind) {
    case 'exponential': return `Exponential(mean=${d.mean} min)`;
    case 'constant':    return `Constant(${d.value} min)`;
    case 'uniform':     return `Uniform(${d.min}, ${d.max} min)`;
    case 'normal':      return `Normal(mean=${d.mean}, σ=${d.stddev} min)`;
    case 'triangular':  return `Triangular(${d.min}, ${d.mode}, ${d.max} min)`;
  }
}

/** Follow entity-flow edges from source to sink, return servers in order. */
function serverChain(model: DesModel) {
  const source = model.nodes.find(n => n.config.kind === 'source');
  if (!source) return [];
  const nextMap = new Map(model.edges.map(e => [e.sourceId, e.targetId]));
  const chain: typeof model.nodes = [];
  const visited = new Set<string>();
  let cur = nextMap.get(source.id);
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const node = model.nodes.find(n => n.id === cur);
    if (!node) break;
    if (node.config.kind === 'server') chain.push(node);
    cur = nextMap.get(cur);
  }
  return chain;
}

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateSimPyCode(model: DesModel, config: RunConfig): string {
  const sources = model.nodes.filter(n => n.config.kind === 'source');
  const servers = serverChain(model);

  if (sources.length === 0) {
    return '# Model has no Source node — add one to generate code.\n';
  }
  if (servers.length === 0) {
    return '# Model has no Server node reachable from Source — connect a Server to generate code.\n';
  }

  const src     = sources[0];
  const srcCfg  = src.config as import('./model').SourceConfig;
  const obsWin  = `max(HORIZON - WARMUP, 1)`;
  const genDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // ── Provenance header ────────────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push(`#!/usr/bin/env python3`);
  lines.push(`"""
DES Playground — Generated SimPy 4 script
Model      : ${model.name || 'Unnamed'}
Generated  : ${genDate}
Engine     : TypeScript DES engine (browser) — semantically equivalent

Requires: Python 3.9+  |  pip install simpy

NOTE: Python's random module and the browser's mulberry32 PRNG are different
implementations. Statistical properties will be equivalent, but individual
event sequences will differ for the same seed.

Topology : ${sources.map(n => n.name).join(', ')} → ${servers.map(n => n.name).join(' → ')} → Sink

Run config
  Horizon      : ${config.horizon} min
  Warm-up      : ${config.warmup} min  (obs window: ${config.horizon - config.warmup} min)
  Replications : ${config.replications}
  Base seed    : ${config.seed}
  Seed per rep : BASE_SEED + rep_index × 1000  (matches browser engine)
"""
import simpy
import random
import statistics
import math
`);

  // ── Configuration ────────────────────────────────────────────────────────────
  lines.push(`# ── Run configuration ────────────────────────────────────────────────────────`);
  lines.push(`HORIZON      = ${config.horizon}   # simulated minutes`);
  lines.push(`WARMUP       = ${config.warmup}     # exclude first WARMUP minutes from metrics`);
  lines.push(`REPLICATIONS = ${config.replications}`);
  lines.push(`BASE_SEED    = ${config.seed}  # seeds: BASE_SEED, BASE_SEED+1000, BASE_SEED+2000, …`);
  lines.push(``);

  // ── Sampling functions ───────────────────────────────────────────────────────
  lines.push(`# ── Sampling functions — one per distribution in the model ───────────────────`);
  lines.push(``);
  lines.push(`def sample_interarrival():`);
  lines.push(`    """${src.name} — ${distLabel(srcCfg.interarrivalDistribution)}"""`);
  lines.push(`    return ${distExpr(srcCfg.interarrivalDistribution)}`);
  lines.push(``);

  for (let i = 0; i < servers.length; i++) {
    const srv    = servers[i];
    const srvCfg = srv.config as import('./model').ServerConfig;
    lines.push(`def sample_service_${i}():`);
    lines.push(`    """Station ${i}: '${srv.name}' — ${distLabel(srvCfg.serviceDistribution)}"""`);
    lines.push(`    return ${distExpr(srvCfg.serviceDistribution)}`);
    lines.push(``);
  }

  // ── Station class ─────────────────────────────────────────────────────────────
  lines.push(`# ── Station ─────────────────────────────────────────────────────────────────`);
  lines.push(`# Wraps simpy.Resource to compute time-weighted Lq and ρ̂, matching the`);
  lines.push(`# browser engine's integrateServer() logic (obs window starts at WARMUP).`);
  lines.push(``);
  lines.push(`class Station:`);
  lines.push(`    def __init__(self, env, name, capacity):`);
  lines.push(`        self.env      = env`);
  lines.push(`        self.name     = name`);
  lines.push(`        self.capacity = capacity`);
  lines.push(`        self.resource = simpy.Resource(env, capacity=capacity)`);
  lines.push(`        self._last_t  = 0.0`);
  lines.push(`        self._area_q  = 0.0   # ∫ queue_length dt  (obs window only)`);
  lines.push(`        self._area_b  = 0.0   # ∫ busy_servers dt  (obs window only)`);
  lines.push(``);
  lines.push(`    def _integrate(self):`);
  lines.push(`        now = self.env.now`);
  lines.push(`        t0  = max(self._last_t, WARMUP)   # skip pre-warmup area`);
  lines.push(`        dt  = max(0.0, now - t0)`);
  lines.push(`        if dt > 0:`);
  lines.push(`            self._area_q += len(self.resource.queue) * dt`);
  lines.push(`            self._area_b += self.resource.count      * dt`);
  lines.push(`        self._last_t = now`);
  lines.push(``);
  lines.push(`    def request(self):`);
  lines.push(`        self._integrate()`);
  lines.push(`        return self.resource.request()`);
  lines.push(``);
  lines.push(`    def release(self, req):`);
  lines.push(`        self._integrate()`);
  lines.push(`        self.resource.release(req)`);
  lines.push(``);
  lines.push(`    def busy_area(self):`);
  lines.push(`        self._integrate()`);
  lines.push(`        return self._area_b`);
  lines.push(``);
  lines.push(`    def queue_area(self):`);
  lines.push(`        self._integrate()`);
  lines.push(`        return self._area_q`);
  lines.push(``);

  // ── Entity process ────────────────────────────────────────────────────────────
  lines.push(`# ── Entity process ───────────────────────────────────────────────────────────`);
  lines.push(``);

  const samplers = servers.map((_, i) => `sample_service_${i}`).join(', ');
  lines.push(`SERVICE_SAMPLERS = [${samplers}]  # one per station, in flow order`);
  lines.push(``);
  lines.push(`def entity(env, arrival_t, stations, wait_times, sojourn_times):`);
  lines.push(`    total_wait = 0.0`);
  lines.push(`    for station, sampler in zip(stations, SERVICE_SAMPLERS):`);
  lines.push(`        queue_enter   = env.now`);
  lines.push(`        req           = station.request()`);
  lines.push(`        yield req`);
  lines.push(`        total_wait   += env.now - queue_enter`);
  lines.push(`        yield env.timeout(sampler())`);
  lines.push(`        station.release(req)`);
  lines.push(``);
  lines.push(`    if arrival_t >= WARMUP:              # entity cohort: arrived after warm-up`);
  lines.push(`        wait_times.append(total_wait)`);
  lines.push(`        sojourn_times.append(env.now - arrival_t)`);
  lines.push(``);

  // ── Arrivals generator ────────────────────────────────────────────────────────
  lines.push(`def arrivals(env, stations, wait_times, sojourn_times):`);
  lines.push(`    while True:`);
  lines.push(`        yield env.timeout(sample_interarrival())`);
  lines.push(`        env.process(entity(env, env.now, stations, wait_times, sojourn_times))`);
  lines.push(``);

  // ── Single replication ────────────────────────────────────────────────────────
  const capacities = servers.map(s => (s.config as import('./model').ServerConfig).capacity);
  const totalCap   = capacities.reduce((a, b) => a + b, 0);
  const stationInits = servers.map((s, i) =>
    `        Station(env, '${s.name}', capacity=${(s.config as import('./model').ServerConfig).capacity})`
  );

  lines.push(`# ── Single replication ───────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`def run_once(seed_val):`);
  lines.push(`    random.seed(seed_val)`);
  lines.push(`    env   = simpy.Environment()`);
  lines.push(`    stations = [`);
  lines.push(stationInits.join(',\n'));
  lines.push(`    ]`);
  lines.push(`    wait_times    = []`);
  lines.push(`    sojourn_times = []`);
  lines.push(``);
  lines.push(`    env.process(arrivals(env, stations, wait_times, sojourn_times))`);
  lines.push(`    env.run(until=HORIZON)`);
  lines.push(``);
  lines.push(`    # Finalise time-weighted integrals (last segment to HORIZON)`);
  lines.push(`    for s in stations:`);
  lines.push(`        s._integrate()`);
  lines.push(``);
  lines.push(`    obs          = max(HORIZON - WARMUP, 1)`);
  lines.push(`    total_cap    = ${totalCap}   # sum of all server capacities`);
  lines.push(`    total_busy_a = sum(s.busy_area()  for s in stations)`);
  lines.push(`    total_q_a    = sum(s.queue_area() for s in stations)`);
  lines.push(`    n = len(wait_times)`);
  lines.push(``);
  lines.push(`    return {`);
  lines.push(`        'n'          : n,`);
  lines.push(`        'wq'         : statistics.mean(wait_times)    if n else float('nan'),`);
  lines.push(`        'w'          : statistics.mean(sojourn_times) if n else float('nan'),`);
  lines.push(`        'lq'         : total_q_a    / obs,`);
  lines.push(`        'util'       : total_busy_a / (obs * total_cap),`);
  lines.push(`        'throughput' : n / obs,`);
  lines.push(`    }`);
  lines.push(``);

  // ── CI helper ─────────────────────────────────────────────────────────────────
  lines.push(`# ── 95% confidence interval (matches browser t-distribution table) ──────────`);
  lines.push(``);
  lines.push(`_T_TABLE = {1:12.706, 2:4.303, 3:3.182, 4:2.776, 5:2.571,`);
  lines.push(`            6:2.447, 7:2.365, 8:2.306, 9:2.262, 10:2.228,`);
  lines.push(`            12:2.179, 15:2.131, 20:2.086, 25:2.060, 30:2.042}`);
  lines.push(``);
  lines.push(`def t_crit(df):`);
  lines.push(`    if df >= 120: return 1.960`);
  lines.push(`    for d in sorted(_T_TABLE, reverse=True):`);
  lines.push(`        if df >= d: return _T_TABLE[d]`);
  lines.push(`    return _T_TABLE[1]`);
  lines.push(``);
  lines.push(`def ci95(values):`);
  lines.push(`    n = len([v for v in values if not (isinstance(v, float) and math.isnan(v))])`);
  lines.push(`    if n < 2: return float('nan'), float('nan')`);
  lines.push(`    vals = [v for v in values if not (isinstance(v, float) and math.isnan(v))]`);
  lines.push(`    m  = statistics.mean(vals)`);
  lines.push(`    sd = statistics.stdev(vals)`);
  lines.push(`    se = sd / math.sqrt(n)`);
  lines.push(`    t  = t_crit(n - 1)`);
  lines.push(`    return m - t * se, m + t * se`);
  lines.push(``);

  // ── Main ──────────────────────────────────────────────────────────────────────
  lines.push(`# ── Run replications ─────────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`print(f"Running {REPLICATIONS} replication(s) …")`);
  lines.push(`all_results = [run_once(BASE_SEED + i * 1000) for i in range(REPLICATIONS)]`);
  lines.push(`print(f"Done.\\n")`);
  lines.push(``);
  lines.push(`# ── Report ───────────────────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`sep = '─' * 62`);
  lines.push(`print(sep)`);
  lines.push(`print(f"  DES Playground — Simulation Results")`);
  lines.push(`print(f"  Model      : ${model.name || 'Unnamed'}")`);
  lines.push(`print(f"  Replications : {REPLICATIONS}  |  Horizon : {HORIZON} min  |  Warm-up : {WARMUP} min")`);
  lines.push(`print(sep)`);
  lines.push(``);
  lines.push(`KPIS = [`);
  lines.push(`    ('Avg wait time    Wq (min)', 'wq',   lambda v: f'{v:.3f}',   False),`);
  lines.push(`    ('Avg sojourn time W  (min)', 'w',    lambda v: f'{v:.3f}',   False),`);
  lines.push(`    ('Avg queue length Lq',       'lq',   lambda v: f'{v:.3f}',   False),`);
  lines.push(`    ('Server utilisation ρ̂  (%)', 'util', lambda v: f'{v*100:.2f}%', False),`);
  lines.push(`    ('Throughput          (/min)', 'throughput', lambda v: f'{v:.4f}', False),`);
  lines.push(`    ('Departures (obs.)',          'n',   lambda v: f'{int(v)}',   True),`);
  lines.push(`]`);
  lines.push(``);
  lines.push(`for label, key, fmt, is_int in KPIS:`);
  lines.push(`    vals = [r[key] for r in all_results]`);
  lines.push(`    mean_val = statistics.mean([v for v in vals if not (isinstance(v, float) and math.isnan(v))]) if any(not (isinstance(v, float) and math.isnan(v)) for v in vals) else float('nan')`);
  lines.push(`    if math.isnan(mean_val):`);
  lines.push(`        print(f"  {label:<36s}: N/A")`);
  lines.push(`        continue`);
  lines.push(`    mean_str = fmt(mean_val)`);
  lines.push(`    ci_str = ''`);
  lines.push(`    if REPLICATIONS > 1:`);
  lines.push(`        lo, hi = ci95(vals)`);
  lines.push(`        if not math.isnan(lo):`);
  lines.push(`            ci_str = f'  95% CI [{fmt(lo)}, {fmt(hi)}]'`);
  lines.push(`    print(f"  {label:<36s}: {mean_str}{ci_str}")`);
  lines.push(``);
  lines.push(`print(sep)`);
  lines.push(`print(f"\\nSeeds used: {[BASE_SEED + i * 1000 for i in range(REPLICATIONS)]}")`);

  return lines.join('\n');
}
