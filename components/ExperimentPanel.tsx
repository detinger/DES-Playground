import React, { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { DesModel } from "../lib/model";
import type { RunConfig } from "../lib/engine";
import {
  modelParameters,
  parseSweepValues,
  runSweep,
  sweepCSV,
  type ScenarioResult,
} from "../lib/experiments";
export default function ExperimentPanel({
  model,
  config,
  semantic,
}: {
  model: DesModel;
  config: RunConfig;
  semantic: string;
}) {
  const parameters = modelParameters(model);
  const [first, setFirst] = useState(""),
    [second, setSecond] = useState(""),
    [a, setA] = useState("1, 2, 3"),
    [b, setB] = useState("1, 2");
  const [results, setResults] = useState<ScenarioResult[]>([]),
    [metric, setMetric] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(""),
    [comparison, setComparison] = useState("<=");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setResults([]);
    setStatus("");
    return () => controller.current?.abort();
  }, [semantic]);
  useEffect(() => {
    setResults([]);
    setStatus("");
  }, [first, second, a, b]);
  const run = async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setResults([]);
    setStatus("Preparing scenarios…");
    try {
      const dimensions = [
        { parameterId: first, values: parseSweepValues(a) },
        ...(second
          ? [{ parameterId: second, values: parseSweepValues(b) }]
          : []),
      ];
      const rows = await runSweep(model, config, dimensions, {
        signal: c.signal,
        progress: (done, total) => {
          if (!c.signal.aborted) setStatus(`Completed ${done} / ${total} runs`);
        },
      });
      if (c.signal.aborted) return;
      setResults(rows);
      if (!rows[0]?.metrics[metric])
        setMetric(Object.keys(rows[0]?.metrics ?? {})[0] ?? "");
      setStatus(
        `Completed ${rows.length} scenarios using ${config.replications} replications each.`,
      );
    } catch (e) {
      if (controller.current === c) setStatus((e as Error).message);
    } finally {
      if (controller.current === c) setBusy(false);
    }
  };
  const selector = (
    label: string,
    value: string,
    set: (v: string) => void,
    optional = false,
  ) => (
    <label className="des-field">
      {label}
      <select
        value={value}
        disabled={busy}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">
          {optional ? "None" : "Select a numeric parameter"}
        </option>
        {parameters.map((p) => (
          <option value={p.id} key={p.id}>
            {p.label} (currently {p.value})
          </option>
        ))}
      </select>
    </label>
  );
  const chosen = results[0]?.labels[metric];
  const groups = [...new Set(results.map((r) => r.parameters[1]?.value ?? ""))];
  const xs = [...new Set(results.map((r) => r.parameters[0].value))].sort(
    (a, b) => a - b,
  );
  const chart = xs.map((x) =>
    Object.fromEntries([
      ["x", x],
      ...groups.map((g, i) => [
        `y${i}`,
        results.find(
          (r) =>
            r.parameters[0].value === x && (r.parameters[1]?.value ?? "") === g,
        )?.metrics[metric]?.mean,
      ]),
    ]),
  );
  return (
    <details className="des-experiments">
      <summary>Parameter experiments</summary>
      <p>
        Compare one or two numeric parameters across all combinations. Runs use
        the current horizon, warm-up and replication count, with the same seed
        sequence for every scenario. Editing the model cancels and clears the
        experiment.
      </p>
      <div className="des-runbar">
        {selector("First parameter", first, setFirst)}
        <label className="des-field">
          First parameter values
          <input
            disabled={busy}
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="1, 2, 3"
          />
        </label>
        {selector("Second parameter", second, setSecond, true)}
        {second && (
          <label className="des-field">
            Second parameter values
            <input
              disabled={busy}
              value={b}
              onChange={(e) => setB(e.target.value)}
            />
          </label>
        )}
        <button
          className="ui-btn ui-btn--primary"
          disabled={busy || !first}
          onClick={run}
        >
          Run experiment
        </button>
        {busy && (
          <button
            className="ui-btn"
            onClick={() => {
              controller.current?.abort();
              setStatus("Cancelling after the current replication…");
            }}
          >
            Cancel experiment
          </button>
        )}
      </div>
      <p role="status">{status}</p>
      {results.length > 0 && (
        <>
          <div className="des-runbar">
            <label className="des-field">
              Experiment measure
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                {Object.entries(results[0].labels).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="des-field">
              Target comparison
              <select
                value={comparison}
                onChange={(e) => setComparison(e.target.value)}
              >
                <option>{"<="}</option>
                <option>{">="}</option>
              </select>
            </label>
            <label className="des-field">
              Target mean (optional)
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <button
              className="ui-btn"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([sweepCSV(results)], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "des-experiment.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download experiment CSV
            </button>
          </div>
          <p>
            {chosen?.label} · {chosen?.unit}. Intervals are 95% confidence
            intervals for the mean across replications. One replication cannot
            estimate uncertainty. Target checks use the mean.
          </p>
          <div style={{ height: 260, width: "100%" }}>
            <ResponsiveContainer>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis />
                <Tooltip />
                {groups.map((g, i) => (
                  <Line
                    key={String(g)}
                    type="linear"
                    dataKey={`y${i}`}
                    name={
                      results[0].parameters[1]
                        ? `${results[0].parameters[1].label} = ${g}`
                        : chosen?.label
                    }
                    stroke={["#6366f1", "#059669", "#db2777", "#d97706"][i % 4]}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="des-table-wrap">
            <table>
              <caption>Experiment results</caption>
              <thead>
                <tr>
                  {results[0].parameters.map((p) => (
                    <th key={p.label}>{p.label}</th>
                  ))}
                  <th>Mean</th>
                  <th>95% CI</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const ci = r.metrics[metric];
                  return (
                    <tr key={i}>
                      {r.parameters.map((p, j) => (
                        <td key={j}>{p.value}</td>
                      ))}
                      <td>{ci?.mean.toFixed(3)}</td>
                      <td>
                        {ci?.n > 1
                          ? `${ci.lower.toFixed(3)} – ${ci.upper.toFixed(3)}`
                          : "Requires ≥2 replications"}
                      </td>
                      <td>
                        {target === ""
                          ? "—"
                          : (
                                comparison === "<="
                                  ? ci?.mean <= Number(target)
                                  : ci?.mean >= Number(target)
                              )
                            ? "Met"
                            : "Not met"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  );
}
