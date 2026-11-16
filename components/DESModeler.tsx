import ModelLibrary from "./ModelLibrary";
import { type Workspace } from "../lib/modelLibrary";
import { type useModelHistory } from "../lib/useModelHistory";
import ExperimentPanel from "./ExperimentPanel";
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { NodeData } from "../types";
import type { NodeKind } from "../lib/model";
import { compileModel } from "../lib/compiler";
import { validateProcessModel } from "../lib/processValidation";
import {
  runReplications,
  DEFAULT_RUN_CONFIG,
  type RunConfig,
  type RunOutput,
} from "../lib/engine";
import { BLOCK_LABELS, defaultBlock } from "../lib/processNotation";
import {
  INVENTORY_NODES,
  INVENTORY_EDGES,
  FACTORY_NODES,
  FACTORY_EDGES,
} from "../lib/processExamples";
import ProcessNode from "./nodes/ProcessNode";
import ProcessProperties, { NumberField } from "./ProcessProperties";
import ProcessFormalView from "./ProcessFormalView";
import ModelingGuide from "./ModelingGuide";
import ValidationPanel from "./ValidationPanel";
import CodeExport from "./CodeExport";
import SimmerCodeExport from "./SimmerCodeExport";

const nodeTypes = Object.fromEntries(
  Object.keys(BLOCK_LABELS).map((k) => [k, ProcessNode]),
);
type Snapshot = {
  nodes: Node<NodeData>[];
  edges: Edge[];
  config: RunConfig;
  output: RunOutput;
};
interface Props {
  name: string;
  setName: (n: string) => void;
  history: ReturnType<typeof useModelHistory>;
  autosaveStatus: string;
  nodes: Node<NodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  config: Partial<RunConfig>;
  setConfig: React.Dispatch<React.SetStateAction<Partial<RunConfig>>>;
}
export default function DESModeler({
  name,
  setName,
  history,
  autosaveStatus,
  nodes,
  setNodes,
  edges,
  setEdges,
  config: partial,
  setConfig,
}: Props) {
  const config: RunConfig = {
    ...DEFAULT_RUN_CONFIG,
    unit: "minute",
    stopMode: "horizon",
    ...partial,
  };
  const [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<"process" | "formal">("process");
  const [output, setOutput] = useState<RunOutput | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(5);
  const [error, setError] = useState(""),
    [showValidation, setShowValidation] = useState(false),
    [exporting, setExporting] = useState(false);
  const [series, setSeries] = useState(""),
    [height, setHeight] = useState(620);
  const flow = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const semantic = JSON.stringify({
    nodes: nodes.map(({ id, data: { simState, simActive, ...data } }) => ({
      id,
      data,
    })),
    edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({
      source,
      target,
      sourceHandle,
      targetHandle,
    })),
    config,
    name,
  });
  const model = useMemo(
    () => compileModel(nodes, edges, { name, unit: config.unit }),
    [semantic],
  );
  const validation = useMemo(() => validateProcessModel(model), [model]);
  useEffect(() => {
    setOutput(null);
    setPlaying(false);
    setIndex(0);
    setError("");
    setExporting(false);
  }, [semantic]);
  useEffect(() => {
    if (!playing || !output) return;
    const timer = setInterval(
      () =>
        setIndex((i) => {
          return Math.min(output.primary.trace.length - 1, i + speed);
        }),
      120,
    );
    return () => clearInterval(timer);
  }, [playing, output, speed]);
  useEffect(() => {
    if (playing && output && index >= output.primary.trace.length - 1)
      setPlaying(false);
  }, [playing, output, index]);
  const state = output?.primary.trace[index];
  const canvasNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          simState: state?.state.nodeStates[n.id],
          simActive: state?.nodeId === n.id,
        },
      })),
    [nodes, state],
  );
  const current = nodes.find((n) => n.id === selected);
  const update = (data: Partial<NodeData>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selected ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    );
  const connect = (c: Connection) =>
    setEdges((es) =>
      addEdge(
        {
          ...c,
          id: crypto.randomUUID(),
          label: c.sourceHandle === "out" ? undefined : c.sourceHandle,
          style: ["resource", "store"].includes(c.sourceHandle ?? "")
            ? { strokeDasharray: "6 4", stroke: "#a78bfa" }
            : undefined,
        },
        es,
      ),
    );
  const associate = (kind: "resource" | "store", target: string) =>
    setEdges((es) => [
      ...es.filter((e) => !(e.source === selected && e.sourceHandle === kind)),
      ...(target
        ? [
            {
              id: crypto.randomUUID(),
              source: selected!,
              target,
              sourceHandle: kind,
              targetHandle: "association",
              label: kind,
              style: { strokeDasharray: "6 4", stroke: "#a78bfa" },
            },
          ]
        : []),
    ]);
  const add = (
    kind: NodeKind,
    position = {
      x: 100 + (nodes.length % 4) * 240,
      y: 100 + Math.floor(nodes.length / 4) * 180,
    },
  ) => {
    const id = crypto.randomUUID();
    setNodes((ns) => [
      ...ns,
      { id, type: kind, position, data: defaultBlock(kind) },
    ]);
    setSelected(id);
  };
  const replace = (w: Workspace) => {
    setName(w.name);
    setNodes(w.nodes);
    setEdges(w.edges);
    setConfig(w.config);
    setSelected(null);
    setTimeout(() => flow.current?.fitView({ padding: 0.15 }), 50);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !(e.metaKey || e.ctrlKey) ||
        e.key.toLowerCase() !== "z" ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)))
      )
        return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);
  const template = (name: "inventory" | "factory" | "blank") => {
    setName(
      name === "blank"
        ? "Untitled model"
        : name === "inventory"
          ? "Inventory"
          : "Factory",
    );
    setNodes(
      structuredClone(
        name === "inventory"
          ? INVENTORY_NODES
          : name === "factory"
            ? FACTORY_NODES
            : [],
      ),
    );
    setEdges(
      structuredClone(
        name === "inventory"
          ? INVENTORY_EDGES
          : name === "factory"
            ? FACTORY_EDGES
            : [],
      ),
    );
    setConfig({
      ...DEFAULT_RUN_CONFIG,
      unit:
        name === "inventory" ? "day" : name === "factory" ? "hour" : "minute",
      stopMode: "horizon",
      horizon: name === "inventory" ? 35 : name === "factory" ? 2080 : 100,
      seed: name === "inventory" ? 3 : 0,
    });
    setSelected(null);
    setBaseline(null);
    setShowValidation(false);
    setTimeout(() => flow.current?.fitView({ padding: 0.15 }), 50);
  };
  const run = () => {
    setShowValidation(true);
    setError("");
    if (validation.hasErrors) return;
    try {
      const r = runReplications(model, config);
      setOutput(r);
      setIndex(0);
      setPlaying(r.primary.trace.length > 1);
      if (!nodes.some((n) => n.id === series))
        setSeries(
          model.nodes.find((n) => n.config.kind === "store")?.id ??
            nodes[0]?.id ??
            "",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () => {
    if (output)
      setBaseline({
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        config: { ...config },
        output,
      });
  };
  const chart =
    output?.primary.trace.slice(0, index + 1).map((e) => ({
      t: e.t,
      stock: e.state.nodeStates[series]?.stock,
      waiting: e.state.nodeStates[series]?.queueLength,
      active: e.state.nodeStates[series]?.busyServers,
      available: e.state.nodeStates[series]?.available,
    })) ?? [];
  return (
    <div className="des-modeler">
      <div className="des-intro">
        <p>
          Build processes with shared resources, inventory, decisions and
          repeating cycles. Every block and connection defines the simulation.
        </p>
        <div className="des-actions">
          <button className="ui-btn" onClick={() => template("blank")}>
            New blank model
          </button>
          <button className="ui-btn" onClick={() => template("inventory")}>
            Inventory template
          </button>
          <button className="ui-btn" onClick={() => template("factory")}>
            Factory template
          </button>
        </div>
      </div>
      <ModelLibrary
        workspace={{ name, nodes, edges, config }}
        replace={replace}
        rename={setName}
      />
      <div className="des-actions">
        <button
          className="ui-btn"
          onClick={history.undo}
          disabled={!history.canUndo}
        >
          Undo
        </button>
        <button
          className="ui-btn"
          onClick={history.redo}
          disabled={!history.canRedo}
        >
          Redo
        </button>
        <span role="status">{autosaveStatus}</span>
        <small>⌘/Ctrl Z · Shift Z to redo</small>
      </div>
      <ModelingGuide />
      <div className="des-runbar">
        <NumberField
          label="Horizon"
          value={config.horizon}
          min={0.001}
          onChange={(horizon) => setConfig((c) => ({ ...c, horizon }))}
        />
        <NumberField
          label="Warm-up"
          value={config.warmup}
          onChange={(warmup) => setConfig((c) => ({ ...c, warmup }))}
        />
        <NumberField
          label="Seed"
          value={config.seed}
          step="1"
          onChange={(seed) => setConfig((c) => ({ ...c, seed }))}
        />
        <NumberField
          label="Replications"
          value={config.replications}
          min={1}
          step="1"
          onChange={(replications) =>
            setConfig((c) => ({ ...c, replications }))
          }
        />
        <label className="des-field">
          Time unit
          <select
            value={config.unit}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                unit: e.target.value as RunConfig["unit"],
              }))
            }
          >
            {["second", "minute", "hour", "day"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="des-field">
          Stopping rule
          <select
            value={config.stopMode}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                stopMode: e.target.value as RunConfig["stopMode"],
              }))
            }
          >
            <option value="horizon">Stop at horizon</option>
            <option value="drain">Close arrivals and drain</option>
          </select>
        </label>
        <button className="ui-btn" onClick={() => setShowValidation((v) => !v)}>
          Validate
        </button>
        <button className="ui-btn ui-btn--primary" onClick={run}>
          Run model
        </button>
      </div>
      {error && (
        <p role="alert" className="des-error">
          {error}
        </p>
      )}
      {showValidation && (
        <ValidationPanel result={validation} onSelectNode={setSelected} />
      )}
      {output && (
        <section className="des-playback" aria-label="Simulation playback">
          <div className="des-runbar">
            <strong role="status">
              {playing
                ? "Playing"
                : index >= output.primary.trace.length - 1
                  ? "Playback finished"
                  : "Paused"}
            </strong>
            <span>
              t ={" "}
              <output aria-label="Simulation time">
                {state?.t.toFixed(3)}
              </output>{" "}
              {config.unit}s · event {index + 1} / {output.primary.trace.length}
            </span>
            <button
              className="ui-btn"
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
            >
              Start
            </button>
            <button
              className="ui-btn"
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
            >
              Previous event
            </button>
            <button
              className="ui-btn"
              onClick={() => {
                if (index === output.primary.trace.length - 1) setIndex(0);
                setPlaying((v) => !v);
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              className="ui-btn"
              onClick={() => {
                setPlaying(false);
                setIndex((i) =>
                  Math.min(output.primary.trace.length - 1, i + 1),
                );
              }}
            >
              Next event
            </button>
            <button
              className="ui-btn"
              onClick={() => {
                setPlaying(false);
                setIndex(output.primary.trace.length - 1);
              }}
            >
              End
            </button>
            <label className="des-field">
              Events per tick
              <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                {[1, 5, 20, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="des-playback-counts">
            In system: {state?.state.inSystem ?? 0} · Arrivals:{" "}
            {state?.state.totalArrivals ?? 0} · Departures:{" "}
            {state?.state.totalDepartures ?? 0}
          </p>
          <input
            aria-label="Playback event"
            type="range"
            min={0}
            max={output.primary.trace.length - 1}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(+e.target.value);
            }}
          />
          {state?.entityId && (
            <p>
              Entity {state.entityId} · {state.entityType} ·{" "}
              {Object.entries(state.entityAttributes ?? {})
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
              {state.correlation ? ` · fork ${state.correlation}` : ""}
            </p>
          )}
        </section>
      )}
      <div className="des-view-tabs" role="group" aria-label="Model view">
        <button
          className={`ui-btn ${view === "process" ? "ui-btn--primary" : ""}`}
          onClick={() => setView("process")}
          aria-pressed={view === "process"}
        >
          Process view
        </button>
        <button
          className={`ui-btn ${view === "formal" ? "ui-btn--primary" : ""}`}
          onClick={() => setView("formal")}
          aria-pressed={view === "formal"}
        >
          Formal view
        </button>
        <span>Solid: entity flow · dashed: resource / store association</span>
      </div>
      {view === "formal" ? (
        <ProcessFormalView model={model} />
      ) : (
        <div className="des-workbench">
          <div className="des-palette" role="group" aria-label="DES components">
            {Object.entries(BLOCK_LABELS).map(([kind, label]) => (
              <button
                className="ui-btn"
                key={kind}
                draggable
                onClick={() => add(kind as NodeKind)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/des-block", kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="des-canvas-row" style={{ height }}>
            <div
              className="des-canvas"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const k = e.dataTransfer.getData(
                  "application/des-block",
                ) as NodeKind;
                if (BLOCK_LABELS[k])
                  add(
                    k,
                    flow.current?.screenToFlowPosition({
                      x: e.clientX,
                      y: e.clientY,
                    }),
                  );
              }}
            >
              <ReactFlow
                nodes={canvasNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={(i) => {
                  flow.current = i;
                }}
                onNodesChange={(cs) =>
                  setNodes((ns) => applyNodeChanges(cs, ns))
                }
                onEdgesChange={(cs) =>
                  setEdges((es) => applyEdgeChanges(cs, es))
                }
                onConnect={connect}
                onNodeClick={(_, n) => setSelected(n.id)}
                onPaneClick={() => setSelected(null)}
                fitView
                minZoom={0.15}
                maxZoom={2}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background gap={20} />
                <Controls />
              </ReactFlow>
            </div>
            {current && (
              <ProcessProperties
                node={current}
                nodes={nodes}
                edges={edges}
                update={update}
                associate={associate}
                remove={() => {
                  setNodes((ns) => ns.filter((n) => n.id !== selected));
                  setEdges((es) =>
                    es.filter(
                      (e) => e.source !== selected && e.target !== selected,
                    ),
                  );
                  setSelected(null);
                }}
              />
            )}
          </div>
          <label className="des-canvas-size">
            Canvas height
            <input
              type="range"
              min={360}
              max={1000}
              step={20}
              value={height}
              onChange={(e) => setHeight(+e.target.value)}
            />
            <span>
              Click a palette item to add it, or drag it onto the canvas. Select
              a connection and press Delete to remove it.
            </span>
          </label>
        </div>
      )}
      <ExperimentPanel model={model} config={config} semantic={semantic} />
      {output && (
        <>
          <p role="status">
            {output.primary.truncatedAt
              ? "Event limit reached — results are partial. Increase positive delays or simplify the model."
              : `Computed ${output.reps.length} replication(s). Playback shows the first replication; results below summarize all runs.`}{" "}
            {output.primary.stoppedWithPending
              ? "Entities or work remain at the stopping point."
              : ""}
          </p>
          <div className="des-actions">
            <button className="ui-btn" onClick={save}>
              Save baseline
            </button>
            {baseline && (
              <button
                className="ui-btn"
                onClick={() => {
                  setNodes(structuredClone(baseline.nodes));
                  setEdges(structuredClone(baseline.edges));
                  setConfig({ ...baseline.config });
                  setSelected(null);
                }}
              >
                Restore baseline model
              </button>
            )}
            <button className="ui-btn" onClick={() => setExporting((v) => !v)}>
              {exporting ? "Hide exports" : "Export Python / R"}
            </button>
          </div>
          {baseline && (
            <p>
              Baseline: seed {baseline.config.seed}, horizon{" "}
              {baseline.config.horizon} {baseline.config.unit}s,{" "}
              {baseline.config.replications} replications. Comparison uses
              matching metric identifiers and units.
            </p>
          )}
          <div className="des-table-wrap">
            <table>
              <caption>Results and replication confidence intervals</caption>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Mean</th>
                  <th>95% CI</th>
                  <th>Unit</th>
                  {baseline && (
                    <>
                      <th>Baseline</th>
                      <th>Change</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.entries(output.primary.measurements).map(([key, m]) => {
                  const ci = output.measurementCI[key];
                  const b =
                    baseline?.config.unit === config.unit &&
                    baseline.output.primary.measurements[key]?.unit === m.unit
                      ? baseline.output.measurementCI[key]
                      : undefined;
                  return (
                    <tr key={key}>
                      <td>{m.label}</td>
                      <td>{ci.mean.toFixed(3)}</td>
                      <td>
                        {ci.n > 1
                          ? `${ci.lower.toFixed(3)} – ${ci.upper.toFixed(3)}`
                          : "—"}
                      </td>
                      <td>{m.unit}</td>
                      {baseline && (
                        <>
                          <td>{b?.mean.toFixed(3) ?? "—"}</td>
                          <td>{b ? (ci.mean - b.mean).toFixed(3) : "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="des-field">
            Inspect block over time
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data.label}
                </option>
              ))}
            </select>
          </label>
          <div className="des-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  label={{
                    value: config.unit,
                    position: "insideBottomRight",
                    offset: -5,
                  }}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    color: "var(--text)",
                  }}
                />
                {["stock", "waiting", "active", "available"].map((key, i) => (
                  <Line
                    key={key}
                    type="stepAfter"
                    dataKey={key}
                    stroke={["#6366f1", "#f59e0b", "#10b981", "#a855f7"][i]}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="formal-model">
            <summary>Event log · {output.primary.trace.length} events</summary>
            <div className="des-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Block</th>
                    <th>Entity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {output.primary.trace
                    .slice(Math.max(0, index - 30), index + 31)
                    .map((e, i) => (
                      <tr
                        key={e.id}
                        className={
                          e.id === state?.id ? "des-event-current" : ""
                        }
                        onClick={() => {
                          setPlaying(false);
                          setIndex(Math.max(0, index - 30) + i);
                        }}
                      >
                        <td>{e.t.toFixed(3)}</td>
                        <td>{e.kind}</td>
                        <td>
                          {nodes.find((n) => n.id === e.nodeId)?.data.label}
                        </td>
                        <td>{e.entityId}</td>
                        <td>{e.detail}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p>Showing up to 61 events around the playback position.</p>
            </div>
          </details>
          {exporting && (
            <>
              <CodeExport model={model} config={config} />
              <SimmerCodeExport model={model} config={config} />
            </>
          )}
        </>
      )}
    </div>
  );
}
