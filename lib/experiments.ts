import type { DesModel } from "./model";
import {
  ciForValues,
  type CIResult,
  type Measurement,
  type RunConfig,
  runSimulation,
} from "./engine";
import { validateProcessModel } from "./processValidation";
export interface Parameter {
  id: string;
  nodeId: string;
  path: (string | number)[];
  label: string;
  value: number;
}
export interface SweepDimension {
  parameterId: string;
  values: number[];
}
export interface ScenarioResult {
  parameters: { label: string; value: number }[];
  metrics: Record<string, CIResult>;
  labels: Record<string, Measurement>;
  seeds: number[];
}
export function modelParameters(model: DesModel): Parameter[] {
  const result: Parameter[] = [];
  const visit = (
    value: unknown,
    nodeId: string,
    label: string,
    path: (string | number)[],
  ) => {
    if (typeof value === "number" && Number.isFinite(value))
      result.push({
        id: JSON.stringify([nodeId, ...path]),
        nodeId,
        path,
        label,
        value,
      });
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value))
        visit(v, nodeId, `${label} · ${k}`, [
          ...path,
          Array.isArray(value) ? Number(k) : k,
        ]);
  };
  for (const n of model.nodes) visit(n.config, n.id, n.name, []);
  return result;
}
export function parseSweepValues(text: string): number[] {
  const tokens = text.split(",").map((v) => v.trim());
  const values = tokens.map(Number);
  if (
    tokens.some((x) => !x) ||
    values.some((x) => !Number.isFinite(x)) ||
    values.length > 100
  )
    throw new Error("Enter 1–100 finite numbers separated by commas.");
  return [...new Set(values)];
}
export async function runSweep(
  model: DesModel,
  config: RunConfig,
  dimensions: SweepDimension[],
  options: {
    signal?: AbortSignal;
    progress?: (completed: number, total: number) => void;
  } = {},
): Promise<ScenarioResult[]> {
  if (
    !dimensions.length ||
    dimensions.length > 2 ||
    new Set(dimensions.map((d) => d.parameterId)).size !== dimensions.length
  )
    throw new Error("Choose one or two different parameters.");
  const parameters = modelParameters(model);
  const chosen = dimensions.map((d) => {
    const p = parameters.find((p) => p.id === d.parameterId);
    if (!p || !d.values.length || d.values.some((v) => !Number.isFinite(v)))
      throw new Error("Select valid parameters and values.");
    return p;
  });
  const count = dimensions.reduce((n, d) => n * d.values.length, 1);
  if (
    count > 100 ||
    !Number.isInteger(config.replications) ||
    config.replications < 1 ||
    config.replications > 100 ||
    count * config.replications > 1000
  )
    throw new Error(
      "Use at most 100 scenarios, 1–100 replications each, and 1,000 total runs.",
    );
  let cases: number[][] = [[]];
  for (const d of dimensions)
    cases = cases.flatMap((row) => d.values.map((v) => [...row, v]));
  // Validate every case before spending time on simulations or showing partial comparisons.
  const models = cases.map((values) => {
    const copy = structuredClone(model);
    chosen.forEach((p, i) => {
      let target: any = copy.nodes.find((n) => n.id === p.nodeId)!.config;
      for (const k of p.path.slice(0, -1)) target = target[k];
      target[p.path.at(-1)!] = values[i];
    });
    const v = validateProcessModel(copy);
    if (v.hasErrors)
      throw new Error(
        `Scenario ${values.join(", ")}: ${v.issues.find((x) => x.severity === "error")!.explanation}`,
      );
    return copy;
  });
  const results: ScenarioResult[] = [];
  let completed = 0;
  for (let i = 0; i < models.length; i++) {
    const values: Record<string, number[]> = {};
    let labels: Record<string, Measurement> = {};
    const seeds: number[] = [];
    for (let r = 0; r < config.replications; r++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (options.signal?.aborted)
        throw new DOMException("Experiment cancelled.", "AbortError");
      const seed = (config.seed + r * 1000) % 4294967296;
      const result = runSimulation(models[i], {
        ...config,
        seed,
        replications: 1,
      });
      if (result.truncatedAt !== undefined)
        throw new Error(
          "An experiment run reached the event limit. Increase delays or shorten the horizon before comparing results.",
        );
      labels = result.measurements;
      for (const [key, m] of Object.entries(labels))
        (values[key] ??= []).push(m.value);
      seeds.push(seed);
      options.progress?.(++completed, count * config.replications);
    }
    results.push({
      parameters: chosen.map((p, j) => ({
        label: p.label,
        value: cases[i][j],
      })),
      metrics: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, ciForValues(v)]),
      ),
      labels,
      seeds,
    });
  }
  if (options.signal?.aborted)
    throw new DOMException("Experiment cancelled.", "AbortError");
  return results;
}
export function sweepCSV(results: ScenarioResult[]): string {
  if (!results.length) return "";
  const quote = (v: unknown) =>
    `"${(typeof v === "string" ? v.replace(/^[=+@-]/, "'$&") : String(v)).replaceAll('"', '""')}"`;
  const rows: unknown[][] = [
    [
      "Scenario",
      ...results[0].parameters.map((p) => p.label),
      "Measure",
      "Unit",
      "Mean",
      "95% lower",
      "95% upper",
      "Replications",
      "Seeds",
    ],
  ];
  results.forEach((r, i) =>
    Object.entries(r.metrics).forEach(([key, ci]) =>
      rows.push([
        i + 1,
        ...r.parameters.map((p) => p.value),
        r.labels[key].label,
        r.labels[key].unit,
        ci.mean,
        ci.lower,
        ci.upper,
        ci.n,
        r.seeds.join(";"),
      ]),
    ),
  );
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
