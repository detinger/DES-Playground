// R simmer code generator — compiles from canonical DesModel + RunConfig.
// simmer handles trajectory and resource monitoring automatically.

import { DesModel, Distribution } from './model';
import { RunConfig } from './engine';

function rDistExpr(d: Distribution): string {
  switch (d.kind) {
    case 'exponential': return `rexp(1, rate = 1 / ${d.mean})`;
    case 'constant':    return `${d.value}`;
    case 'uniform':     return `runif(1, min = ${d.min}, max = ${d.max})`;
    case 'normal':      return `max(0, rnorm(1, mean = ${d.mean}, sd = ${d.stddev}))`;
    case 'triangular':  return `triangle::rtriangle(1, a = ${d.min}, b = ${d.max}, c = ${d.mode})`;
  }
}

function distLabel(d: Distribution): string {
  switch (d.kind) {
    case 'exponential': return `Exponential(mean=${d.mean})`;
    case 'constant':    return `Constant(${d.value})`;
    case 'uniform':     return `Uniform(${d.min}, ${d.max})`;
    case 'normal':      return `Normal(mean=${d.mean}, sd=${d.stddev})`;
    case 'triangular':  return `Triangular(${d.min}, ${d.mode}, ${d.max})`;
  }
}

function rId(name: string): string {
  return (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node');
}

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

export function generateSimmerCode(model: DesModel, config: RunConfig): string {
  const sources = model.nodes.filter(n => n.config.kind === 'source');
  const servers = serverChain(model);

  if (sources.length === 0) return '# Model has no Source node — add one to generate code.\n';
  if (servers.length === 0) return '# No Server node reachable from Source — connect a Server first.\n';

  const src    = sources[0];
  const srcCfg = src.config as import('./model').SourceConfig;
  const genDate = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const hasTriangular = [srcCfg.interarrivalDistribution, ...servers.map(s => (s.config as import('./model').ServerConfig).serviceDistribution)]
    .some(d => d.kind === 'triangular');

  const lines: string[] = [];

  lines.push(`# DES Playground — Generated R simmer script`);
  lines.push(`# Model    : ${model.name || 'Unnamed'}`);
  lines.push(`# Generated: ${genDate}`);
  lines.push(`# Requires : R 4.1+  |  install.packages(c("simmer", "simmer.plot"${hasTriangular ? ', "triangle"' : ''}))`);
  lines.push(`#`);
  lines.push(`# Topology : ${sources.map(n => n.name).join(', ')} → ${servers.map(n => n.name).join(' → ')} → Sink`);
  lines.push(`#`);
  lines.push(`# Run config:`);
  lines.push(`#   Horizon      : ${config.horizon} min`);
  lines.push(`#   Warm-up      : ${config.warmup} min`);
  lines.push(`#   Replications : ${config.replications}`);
  lines.push(`#   Base seed    : ${config.seed}  (seed per rep: BASE_SEED + (rep-1)*1000)`);
  lines.push(``);
  lines.push(`library(simmer)`);
  lines.push(`library(simmer.plot)`);
  if (hasTriangular) lines.push(`library(triangle)`);
  lines.push(``);
  lines.push(`# ── Configuration ────────────────────────────────────────────────────────────`);
  lines.push(`HORIZON      <- ${config.horizon}`);
  lines.push(`WARMUP       <- ${config.warmup}`);
  lines.push(`REPLICATIONS <- ${config.replications}`);
  lines.push(`BASE_SEED    <- ${config.seed}`);
  lines.push(``);

  // Resource names (R variable-safe)
  const resNames = servers.map((s, i) => `res_${rId(s.name)}_${i}`);

  // Trajectory
  const trajectorySteps = servers.map((srv, i) => {
    const srvCfg = srv.config as import('./model').ServerConfig;
    return [
      `  seize("${resNames[i]}", 1) %>%`,
      `  timeout(function() { ${rDistExpr(srvCfg.serviceDistribution)} }) %>%`,
      `  release("${resNames[i]}", 1)`,
    ].join('\n');
  }).join(' %>%\n');

  lines.push(`# ── Entity trajectory ────────────────────────────────────────────────────────`);
  lines.push(`entity_path <- trajectory("entity") %>%`);
  lines.push(trajectorySteps);
  lines.push(``);

  // Run once helper
  lines.push(`# ── Single replication ───────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`run_once <- function(seed_val) {`);
  lines.push(`  set.seed(seed_val)`);
  lines.push(`  env <- simmer("model")`);
  lines.push(``);
  lines.push(`  env %>%`);
  servers.forEach((srv, i) => {
    const srvCfg = srv.config as import('./model').ServerConfig;
    lines.push(`    add_resource("${resNames[i]}", capacity = ${srvCfg.capacity}) %>%`);
  });
  lines.push(`    add_generator(`);
  lines.push(`      "entity",`);
  lines.push(`      entity_path,`);
  lines.push(`      distribution = function() { ${rDistExpr(srcCfg.interarrivalDistribution)} },`);
  lines.push(`      mon = 2        # monitor arrivals at level 2`);
  lines.push(`    )`);
  lines.push(``);
  lines.push(`  run(env, until = HORIZON)`);
  lines.push(``);
  lines.push(`  arr  <- get_mon_arrivals(env)`);
  lines.push(`  res  <- get_mon_resources(env)`);
  lines.push(``);
  lines.push(`  # Apply warm-up filter`);
  lines.push(`  arr_obs <- arr[arr$start_time >= WARMUP & arr$finished == TRUE, ]`);
  lines.push(`  obs     <- max(HORIZON - WARMUP, 1)`);
  lines.push(``);
  lines.push(`  wq   <- if (nrow(arr_obs) > 0) mean(arr_obs$waiting_time)      else NA_real_`);
  lines.push(`  w    <- if (nrow(arr_obs) > 0) mean(arr_obs$end_time - arr_obs$start_time) else NA_real_`);
  lines.push(`  n    <- nrow(arr_obs)`);
  lines.push(``);
  lines.push(`  # Time-weighted utilisation from resource monitor`);
  lines.push(`  res_obs <- res[res$time >= WARMUP, ]`);
  lines.push(`  if (nrow(res_obs) > 1) {`);
  lines.push(`    dt     <- diff(res_obs$time)`);
  lines.push(`    # Total servers capacity = sum of capacities`);
  lines.push(`    total_cap <- ${servers.map(s => (s.config as import('./model').ServerConfig).capacity).reduce((a, b) => a + b, 0)}`);
  lines.push(`    # Average server count weighted by time (approximate)`);
  lines.push(`    util <- sum(res_obs$server[-nrow(res_obs)] * dt) / (obs * total_cap)`);
  lines.push(`    lq   <- sum(res_obs$queue[-nrow(res_obs)]  * dt) / obs`);
  lines.push(`  } else {`);
  lines.push(`    util <- NA_real_`);
  lines.push(`    lq   <- NA_real_`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  list(n = n, wq = wq, w = w, lq = lq, util = util, throughput = n / obs)`);
  lines.push(`}`);
  lines.push(``);

  // Run all replications
  lines.push(`# ── Run replications ─────────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`cat(sprintf("Running %d replication(s)...\\n", REPLICATIONS))`);
  lines.push(`seeds   <- BASE_SEED + (seq_len(REPLICATIONS) - 1) * 1000`);
  lines.push(`results <- lapply(seeds, run_once)`);
  lines.push(`cat("Done.\\n\\n")`);
  lines.push(``);

  // Report
  lines.push(`# ── Report ───────────────────────────────────────────────────────────────────`);
  lines.push(``);
  lines.push(`ci95 <- function(x) {`);
  lines.push(`  x   <- x[!is.na(x)]`);
  lines.push(`  n   <- length(x)`);
  lines.push(`  if (n < 2) return(c(NA_real_, NA_real_))`);
  lines.push(`  m   <- mean(x)`);
  lines.push(`  se  <- sd(x) / sqrt(n)`);
  lines.push(`  t   <- qt(0.975, df = n - 1)`);
  lines.push(`  c(m - t * se, m + t * se)`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`sep <- strrep("─", 62)`);
  lines.push(`cat(sep, "\\n")`);
  lines.push(`cat(sprintf("  DES Playground — Results: ${model.name || 'Unnamed'}\\n"))`);
  lines.push(`cat(sprintf("  Reps: %d  |  Horizon: %g min  |  Warm-up: %g min\\n",`);
  lines.push(`            REPLICATIONS, HORIZON, WARMUP))`);
  lines.push(`cat(sep, "\\n")`);
  lines.push(``);
  lines.push(`kpis <- list(`);
  lines.push(`  list(label = "Avg wait time    Wq (min)", key = "wq",         scale = 1),`);
  lines.push(`  list(label = "Avg sojourn time W  (min)", key = "w",          scale = 1),`);
  lines.push(`  list(label = "Avg queue length  Lq",      key = "lq",         scale = 1),`);
  lines.push(`  list(label = "Server utilisation rho (%)", key = "util",      scale = 100),`);
  lines.push(`  list(label = "Throughput          (/min)", key = "throughput", scale = 1),`);
  lines.push(`  list(label = "Departures (obs.)",          key = "n",         scale = 1)`);
  lines.push(`)`);
  lines.push(``);
  lines.push(`for (kpi in kpis) {`);
  lines.push(`  vals  <- sapply(results, function(r) r[[kpi$key]]) * kpi$scale`);
  lines.push(`  valid <- vals[!is.na(vals)]`);
  lines.push(`  if (length(valid) == 0) {`);
  lines.push(`    cat(sprintf("  %-36s: N/A\\n", kpi$label))`);
  lines.push(`    next`);
  lines.push(`  }`);
  lines.push(`  m_str <- sprintf("%.3f", mean(valid))`);
  lines.push(`  ci    <- ci95(valid)`);
  lines.push(`  ci_str <- if (!is.na(ci[1])) sprintf("  95%% CI [%.3f, %.3f]", ci[1], ci[2]) else ""`);
  lines.push(`  cat(sprintf("  %-36s: %s%s\\n", kpi$label, m_str, ci_str))`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`cat(sep, "\\n")`);
  lines.push(`cat(sprintf("\\nSeeds used: %s\\n", paste(seeds, collapse = ", ")))`);

  return lines.join('\n');
}
