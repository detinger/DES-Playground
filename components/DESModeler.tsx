import {
  workspaceDocument,
  documentWorkspace,
  parseModelDocument,
  type Workspace,
} from "../lib/modelLibrary";
import { type useModelHistory } from "../lib/useModelHistory";
import ExperimentPanel from "./ExperimentPanel";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  PlayCircle, Users, LogOut, Server, Clock, Package, Database,
  Archive, GitBranch, Shuffle, Zap, Layers, Scissors, GitMerge, Tag,
  Undo2, Redo2, Plus, Download, Upload, HelpCircle,
  ChevronUp, ChevronDown,
} from "lucide-react";
import {
  ReactFlow,
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
  LineChart, BarChart, Bar,
  Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
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
import ProcessProperties from "./ProcessProperties";
import EventLog from "./EventLog";
import ProcessFormalView from "./ProcessFormalView";
import ValidationPanel from "./ValidationPanel";
import CodeExport from "./CodeExport";
import SimmerCodeExport from "./SimmerCodeExport";

const nodeTypes = Object.fromEntries(
  Object.keys(BLOCK_LABELS).map((k) => [k, ProcessNode]),
);
const PALETTE_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  source:     { icon: PlayCircle, color: "var(--success)" },
  population: { icon: Users,      color: "var(--success)" },
  sink:       { icon: LogOut,     color: "var(--error)" },
  server:     { icon: Server,     color: "var(--accent)" },
  delay:      { icon: Clock,      color: "var(--primary)" },
  store:      { icon: Package,    color: "var(--accent)" },
  resource:   { icon: Database,   color: "var(--success)" },
  stock:      { icon: Archive,    color: "var(--accent)" },
  decision:   { icon: GitBranch,  color: "var(--warning)" },
  router:     { icon: Shuffle,    color: "var(--accent)" },
  signal:     { icon: Zap,        color: "var(--primary)" },
  batch:      { icon: Layers,     color: "#0d9488" },
  unbatch:    { icon: Scissors,   color: "#0d9488" },
  join:       { icon: GitMerge,   color: "#0d9488" },
  assign:     { icon: Tag,        color: "#818cf8" },
};
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
  nodes: Node<NodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  config: Partial<RunConfig>;
  setConfig: React.Dispatch<React.SetStateAction<Partial<RunConfig>>>;
  rightPanelElement?: HTMLDivElement | null;
}
export default function DESModeler({
  name,
  setName,
  history,
  nodes,
  setNodes,
  edges,
  setEdges,
  config: partial,
  setConfig,
  rightPanelElement,
}: Props) {
  const config: RunConfig = {
    ...DEFAULT_RUN_CONFIG,
    unit: "minute",
    stopMode: "horizon",
    ...partial,
  };
  const [selected, setSelected] = useState<string | null>(null),
    [panelTab, setPanelTab] = useState<"properties" | "results" | "events" | "formal" | "experiments" | "export">("properties"),
    [showValidation, setShowValidation] = useState(false);
  const [output, setOutput] = useState<RunOutput | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(5);
  const [error, setError] = useState(""),
    [series, setSeries] = useState("");
  const [libraryNotice, setLibraryNotice] = useState("");
  const [resultsPaneHeight, setResultsPaneHeight] = useState(350);
  const [resultsPaneVisible, setResultsPaneVisible] = useState(true);
  const resultsPaneResize = useRef<{ startY: number; startH: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const howToRef = useRef<HTMLDialogElement>(null);
  const flow = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);

  const semantic = JSON.stringify({
    nodes: nodes.map(({ id, data: { simState, simActive, ...data } }) => ({ id, data })),
    edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({
      source, target, sourceHandle, targetHandle,
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
    setShowValidation(false);
  }, [semantic]);
  useEffect(() => {
    if (!playing || !output) return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(output.primary.trace.length - 1, i + speed)),
      120,
    );
    return () => clearInterval(timer);
  }, [playing, output, speed]);
  useEffect(() => {
    if (playing && output && index >= output.primary.trace.length - 1) setPlaying(false);
  }, [playing, output, index]);
  useEffect(() => { if (selected) setPanelTab("properties"); }, [selected]);
  useEffect(() => { if (output) setPanelTab("results"); }, [output]);

  const state = output?.primary.trace[index];
  const canvasNodes = useMemo(
    () => nodes.map((n) => ({
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
  const nodeNames = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n.data.label])),
    [nodes],
  );
  const update = (data: Partial<NodeData>) =>
    setNodes((ns) => ns.map((n) => n.id === selected ? { ...n, data: { ...n.data, ...data } } : n));
  const connect = (c: Connection) =>
    setEdges((es) =>
      addEdge(
        {
          ...c,
          id: crypto.randomUUID(),
          label: c.sourceHandle === "out" ? undefined : c.sourceHandle,
          type: "smoothstep",
          animated: !["resource", "store"].includes(c.sourceHandle ?? ""),
          style: ["resource", "store"].includes(c.sourceHandle ?? "")
            ? { strokeDasharray: "6 4", stroke: "#a78bfa" }
            : { stroke: "var(--primary)", strokeWidth: 2 },
        },
        es,
      ),
    );
  const associate = (kind: "resource" | "store", target: string) =>
    setEdges((es) => [
      ...es.filter((e) => !(e.source === selected && e.sourceHandle === kind)),
      ...(target ? [{
        id: crypto.randomUUID(),
        source: selected!,
        target,
        sourceHandle: kind,
        targetHandle: "association",
        type: "smoothstep",
        label: kind,
        style: { strokeDasharray: "6 4", stroke: "#a78bfa" },
      }] : []),
    ]);
  const add = (
    kind: NodeKind,
    position = { x: 100 + (nodes.length % 4) * 240, y: 100 + Math.floor(nodes.length / 4) * 180 },
  ) => {
    const id = crypto.randomUUID();
    setNodes((ns) => [...ns, { id, type: kind, position, data: defaultBlock(kind) }]);
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
          (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)))
      ) return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);
  const template = (tpl: "inventory" | "factory" | "blank") => {
    setName(tpl === "blank" ? "Untitled model" : tpl === "inventory" ? "Inventory" : "Factory");
    setNodes(structuredClone(tpl === "inventory" ? INVENTORY_NODES : tpl === "factory" ? FACTORY_NODES : []));
    setEdges(structuredClone(tpl === "inventory" ? INVENTORY_EDGES : tpl === "factory" ? FACTORY_EDGES : []));
    setConfig({
      ...DEFAULT_RUN_CONFIG,
      unit: tpl === "inventory" ? "day" : tpl === "factory" ? "hour" : "minute",
      stopMode: "horizon",
      horizon: tpl === "inventory" ? 35 : tpl === "factory" ? 2080 : 100,
      seed: tpl === "inventory" ? 3 : 0,
    });
    setSelected(null);
    setBaseline(null);
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
        setSeries(model.nodes.find((n) => n.config.kind === "store")?.id ?? nodes[0]?.id ?? "");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () => {
    if (output) setBaseline({ nodes: structuredClone(nodes), edges: structuredClone(edges), config: { ...config }, output });
  };
  const exportJson = () => {
    try {
      const doc = parseModelDocument(JSON.stringify(workspaceDocument({ name, nodes, edges, config })));
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = (name.replace(/[^a-z0-9_-]+/gi, "_") || "model") + ".des.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setLibraryNotice(`Export failed: ${(e as Error).message}`); }
  };

  const waitHistogram = useMemo(() => {
    if (!output?.primary.entities.length) return [];
    const waits = output.primary.entities
      .filter((e) => e.departureTime !== undefined && e.arrivalTime >= config.warmup)
      .map((e) => e.waitTime);
    if (!waits.length) return [];
    const maxW = Math.max(...waits);
    if (maxW <= 0) return [{ label: "0", count: waits.length }];
    const BINS = 15;
    const binSize = maxW / BINS;
    const counts = new Array(BINS).fill(0);
    for (const w of waits) counts[Math.min(Math.floor(w / binSize), BINS - 1)]++;
    return counts.map((count, i) => ({ label: (i * binSize).toFixed(1), count }));
  }, [output, config.warmup]);

  const chart = output?.primary.trace.slice(0, index + 1).map((e) => ({
    t: e.t,
    stock: e.state.nodeStates[series]?.stock,
    waiting: e.state.nodeStates[series]?.queueLength,
    active: e.state.nodeStates[series]?.busyServers,
    available: e.state.nodeStates[series]?.available,
  })) ?? [];
  const inlineField: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" };
  const inputSt: React.CSSProperties = { padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-sunken)", color: "var(--text)", fontSize: 12, fontFamily: "inherit" };
  const atEnd = output ? index >= output.primary.trace.length - 1 : false;

  const ribbonSt: React.CSSProperties = {
    background: "var(--bg-elevated)",
    borderBottom: "1px solid var(--border)",
    padding: "5px 12px",
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    flexWrap: "wrap",
  };
  const sepSt: React.CSSProperties = { width: 1, height: 18, background: "var(--border)", margin: "0 4px", flexShrink: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Model ribbon */}
      <div style={ribbonSt}>
        <button className="ui-btn" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Undo2 size={13} /> Undo
        </button>
        <button className="ui-btn" onClick={history.redo} disabled={!history.canRedo} title="Redo (Shift+Z)" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Redo2 size={13} /> Redo
        </button>
        <div style={sepSt} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputSt, width: 140 }}
          title="Model name"
          placeholder="Model name"
        />
        <div style={sepSt} />
        <button className="ui-btn" onClick={() => template("blank")} title="New blank model" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={13} /> New
        </button>
        <button className="ui-btn" onClick={() => template("inventory")} title="Inventory template">📦</button>
        <button className="ui-btn" onClick={() => template("factory")} title="Factory template">🏭</button>
        <div style={sepSt} />
        <button className="ui-btn" onClick={exportJson} title="Export model as JSON" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Download size={13} /> Export
        </button>
        <button className="ui-btn" onClick={() => fileRef.current?.click()} title="Import model from JSON" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Upload size={13} /> Import
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="Import model file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 5_000_000) throw new Error("File too large (5 MB max).");
              replace(documentWorkspace(parseModelDocument(await f.text())));
              setLibraryNotice("Imported. Save a copy to add it to your library.");
              setTimeout(() => setLibraryNotice(""), 4000);
            } catch (err) {
              setLibraryNotice(`Import failed: ${(err as Error).message}`);
            }
            e.target.value = "";
          }}
        />
        <div style={sepSt} />
        <button
          className="ui-btn"
          onClick={() => howToRef.current?.showModal()}
          title="Modeling guide"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <HelpCircle size={13} /> HOW-TO
        </button>
        {libraryNotice && (
          <span role="status" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
            {libraryNotice}
          </span>
        )}
      </div>

      {/* Sim ribbon */}
      <div style={{ ...ribbonSt, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={inlineField}>
            Horizon
            <input type="number" min={0.001} step="any"
              value={Number.isFinite(config.horizon) ? config.horizon : ""}
              onChange={(e) => setConfig((c) => ({ ...c, horizon: e.target.valueAsNumber }))}
              style={{ ...inputSt, width: 72 }} />
          </label>
          <label style={inlineField}>
            Warm-up
            <input type="number" min={0} step="any"
              value={Number.isFinite(config.warmup) ? config.warmup : ""}
              onChange={(e) => setConfig((c) => ({ ...c, warmup: e.target.valueAsNumber }))}
              style={{ ...inputSt, width: 64 }} />
          </label>
          <label style={inlineField}>
            Seed
            <input type="number" min={0} step="1"
              value={Number.isFinite(config.seed) ? config.seed : ""}
              onChange={(e) => setConfig((c) => ({ ...c, seed: e.target.valueAsNumber }))}
              style={{ ...inputSt, width: 56 }} />
          </label>
          <label style={inlineField}>
            Reps
            <input type="number" min={1} step="1"
              value={Number.isFinite(config.replications) ? config.replications : ""}
              onChange={(e) => setConfig((c) => ({ ...c, replications: e.target.valueAsNumber }))}
              style={{ ...inputSt, width: 48 }} />
          </label>
          <label style={inlineField}>
            Unit
            <select value={config.unit}
              onChange={(e) => setConfig((c) => ({ ...c, unit: e.target.value as RunConfig["unit"] }))}
              style={inputSt}>
              {["second", "minute", "hour", "day"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label style={inlineField}>
            Stop
            <select value={config.stopMode}
              onChange={(e) => setConfig((c) => ({ ...c, stopMode: e.target.value as RunConfig["stopMode"] }))}
              style={inputSt}>
              <option value="horizon">At horizon</option>
              <option value="drain">Drain</option>
            </select>
          </label>
          {output && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-subtle)", borderLeft: "1px solid var(--border)", paddingLeft: 10 }}>
              t = {state?.t.toFixed(2)} · event {index + 1}/{output.primary.trace.length}
              {output.primary.truncatedAt && <span style={{ color: "var(--warning)", marginLeft: 6 }}>⚠ capped</span>}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="ui-btn" onClick={() => setShowValidation((v) => !v)} title="Validate model">
            ✓ Validate
          </button>
          <button className="ui-btn ui-btn--run" onClick={run} title="Run simulation">
            ▶ Run
          </button>
          {output && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
              <button className="icon-btn" onClick={() => { setPlaying(false); setIndex(0); }}
                disabled={index === 0} title="Jump to start" style={index === 0 ? { opacity: 0.4 } : {}}>⏮</button>
              <button className="icon-btn" onClick={() => { setPlaying(false); setIndex((i) => Math.max(0, i - 1)); }}
                disabled={index === 0} title="Step back" style={index === 0 ? { opacity: 0.4 } : {}}>◀</button>
              <button className="ui-btn"
                onClick={() => { if (atEnd) setIndex(0); setPlaying((v) => !v); }}
                style={playing ? { background: "var(--error-soft)", border: "1px solid var(--error)", color: "var(--error)" } : undefined}>
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>
              <button className="icon-btn" onClick={() => { setPlaying(false); setIndex((i) => Math.min(output.primary.trace.length - 1, i + 1)); }}
                disabled={atEnd} title="Step forward" style={atEnd ? { opacity: 0.4 } : {}}>▶</button>
              <button className="icon-btn" onClick={() => { setPlaying(false); setIndex(output.primary.trace.length - 1); }}
                disabled={atEnd} title="Jump to end" style={atEnd ? { opacity: 0.4 } : {}}>⏭</button>
              <label style={{ ...inlineField, marginLeft: 2 }}>
                <input type="range" min={1} max={100} step={1} value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                  style={{ width: 60, accentColor: "var(--primary)" }} />
                <span style={{ fontSize: 12, color: "var(--primary)", width: 32, fontVariantNumeric: "tabular-nums" }}>{speed}×</span>
              </label>
            </>
          )}
          <button className="icon-btn"
            onClick={() => { setOutput(null); setPlaying(false); setIndex(0); setError(""); }}
            title="Reset results" style={{ marginLeft: output ? 2 : 0 }}>↺</button>
        </div>
      </div>

      {error && <p role="alert" className="des-error">{error}</p>}
      {showValidation && (
        <ValidationPanel result={validation} onSelectNode={setSelected} />
      )}

      {/* Canvas workspace */}
      <div className="modeler-workspace">
        {/* Left palette sidebar */}
        <div className="des-palette-sidebar" role="group" aria-label="DES components">
          <div className="des-palette-label">Components</div>
          {Object.entries(BLOCK_LABELS).map(([kind, label]) => {
            const pi = PALETTE_ICON[kind];
            const PIcon = pi?.icon;
            return (
              <div
                key={kind}
                draggable
                onClick={() => add(kind as NodeKind)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/des-block", kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="des-palette-item"
                title={`Add ${label}`}
              >
                {PIcon && <PIcon size={14} style={{ color: pi.color, flexShrink: 0 }} />}
                <span>{label}</span>
              </div>
            );
          })}
          <div className="des-palette-hint">Click to add<br />or drag onto canvas</div>
        </div>
        <div className="modeler-canvas-col">
          {/* Canvas */}
          <div className="editor-canvas-area"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => {
              e.preventDefault();
              const k = e.dataTransfer.getData("application/des-block") as NodeKind;
              if (BLOCK_LABELS[k]) add(k, flow.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
          >
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              <ReactFlow
                nodes={canvasNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={(i) => { flow.current = i; }}
                onNodesChange={(cs) => setNodes((ns) => applyNodeChanges(cs, ns))}
                onEdgesChange={(cs) => setEdges((es) => applyEdgeChanges(cs, es))}
                onConnect={connect}
                onNodeClick={(_, n) => setSelected(n.id)}
                onPaneClick={() => setSelected(null)}
                fitView
                minZoom={0.15}
                maxZoom={2}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Controls />
              </ReactFlow>
            </div>
          </div>
          {/* Scrubber strip */}
          {output && (
            <div style={{ padding: "6px 12px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
                <span className={`des-playback-status des-playback-status--${playing ? "playing" : atEnd ? "done" : "paused"}`}>
                  {playing ? "▶ Playing" : atEnd ? "✓ Done" : "⏸ Paused"}
                </span>
                <span>In system: {state?.state.inSystem ?? 0} · Arrivals: {state?.state.totalArrivals ?? 0} · Departures: {state?.state.totalDepartures ?? 0}</span>
                {state?.entityId && (
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {state.entityType} {state.entityId}
                    {Object.keys(state.entityAttributes ?? {}).length > 0 && " · " + Object.entries(state.entityAttributes ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
                    {state.correlation ? ` · fork ${state.correlation}` : ""}
                  </span>
                )}
              </div>
              <input aria-label="Playback event" type="range"
                min={0} max={output.primary.trace.length - 1} value={index}
                onChange={(e) => { setPlaying(false); setIndex(+e.target.value); }}
                style={{ width: "100%", accentColor: "var(--primary)" }} />
            </div>
          )}
        </div>
      </div>

      {/* Results ribbon — always visible */}
      <div style={{
        height: 32, flexShrink: 0,
        background: "var(--bg-elevated)",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center",
        paddingLeft: 12, gap: 8,
      }}>
        {output && resultsPaneVisible && (
          <div
            style={{ width: 32, height: 3, background: "var(--border)", borderRadius: 2, cursor: "ns-resize", flexShrink: 0 }}
            onPointerDown={(e) => {
              resultsPaneResize.current = { startY: e.clientY, startH: resultsPaneHeight };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!resultsPaneResize.current) return;
              const delta = resultsPaneResize.current.startY - e.clientY;
              setResultsPaneHeight(Math.max(120, Math.min(600, resultsPaneResize.current.startH + delta)));
            }}
            onPointerUp={() => { resultsPaneResize.current = null; }}
          />
        )}
        <button
          onClick={() => output && setResultsPaneVisible((v) => !v)}
          disabled={!output}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            border: "none", background: "none", cursor: output ? "pointer" : "default",
            color: output ? "var(--primary)" : "var(--text-subtle)",
            fontSize: 12, fontWeight: 650, padding: "0 4px",
            fontFamily: "inherit",
          }}
        >
          {resultsPaneVisible && output ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          Results
        </button>
      </div>

      {/* Results pane */}
      {output && resultsPaneVisible && (
        <div style={{ height: resultsPaneHeight, flexShrink: 0, overflow: "hidden", display: "flex", background: "var(--bg-elevated)", borderTop: "1px solid var(--border)" }}>
          {/* Block metrics over time — 2/3 */}
          <div style={{ flex: 2, display: "flex", flexDirection: "column", padding: "10px 16px", minWidth: 0 }}>
            <div style={{ marginBottom: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text)" }}>Block metrics over time</div>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
                Inspect
                <select value={series} onChange={(e) => setSeries(e.target.value)}
                  style={{ padding: "2px 5px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg-sunken)", color: "var(--text)", fontSize: 11 }}>
                  {nodes.map((n) => <option key={n.id} value={n.id}>{n.data.label}</option>)}
                </select>
              </label>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(1)} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, fontSize: 11 }}
                    labelFormatter={(l: any) => `t = ${Number(l).toFixed(2)} ${config.unit}`} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  {["stock", "waiting", "active", "available"].map((key, i) => (
                    <Line key={key} type="stepAfter" dataKey={key} name={key}
                      stroke={["#6366f1", "#f59e0b", "#10b981", "#a855f7"][i]}
                      strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Wait-time distribution — 1/3 */}
          {waitHistogram.length > 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 16px", borderLeft: "1px solid var(--border)", minWidth: 0, maxWidth: "33.33%" }}>
              <div style={{ marginBottom: 6, flexShrink: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text)" }}>Wait-time distribution</div>
                <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                  Arrivals ≥ warm-up {config.warmup > 0 ? `(${config.warmup} ${config.unit}s)` : ""}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitHistogram} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} minTickGap={15} />
                    <YAxis stroke="var(--chart-axis)" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => [v, "Count"]} labelFormatter={(l: any) => `Wq ≥ ${l} ${config.unit}`} />
                    <Bar dataKey="count" name="Count" fill="var(--chart-2)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {rightPanelElement && createPortal(
        <>
          <div className="panel-tabs">
            {(["properties", "results", "events", "formal", "experiments", "export"] as const).map((tab) => (
              <button
                key={tab}
                className="panel-tab"
                aria-selected={panelTab === tab}
                onClick={() => setPanelTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {panelTab === "properties" && (
              current ? (
                <ProcessProperties
                  node={current}
                  nodes={nodes}
                  edges={edges}
                  update={update}
                  associate={associate}
                  remove={() => {
                    setNodes((ns) => ns.filter((n) => n.id !== selected));
                    setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected));
                    setSelected(null);
                  }}
                />
              ) : (
                <div className="panel-pad">
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Select a node to view its properties.</p>
                </div>
              )
            )}
            {panelTab === "results" && (
              output ? (
                <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <span role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {output.primary.truncatedAt ? "⚠ Event limit reached — results are partial." : `${output.reps.length} replication(s) computed.`}
                      {output.primary.stoppedWithPending ? " Entities remain at stop." : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="ui-btn" onClick={save} style={baseline ? { border: "1px solid var(--chart-1)", color: "var(--chart-1)" } : undefined}>
                        {baseline ? "Baseline ✓" : "Save baseline"}
                      </button>
                      {baseline && (
                        <button className="ui-btn" onClick={() => { setNodes(structuredClone(baseline.nodes)); setEdges(structuredClone(baseline.edges)); setConfig({ ...baseline.config }); setSelected(null); }}>
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                  {baseline && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                      Baseline: seed {baseline.config.seed}, horizon {baseline.config.horizon} {baseline.config.unit}s, {baseline.config.replications} rep(s).
                    </p>
                  )}
                  <div className="des-table-wrap" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                    <table>
                      <caption>Results and replication confidence intervals</caption>
                      <thead>
                        <tr>
                          <th>Measure</th><th>Mean</th><th>95% CI</th><th>Unit</th>
                          {baseline && (<><th>Base</th><th>Δ</th></>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(output.primary.measurements).map(([key, m]) => {
                          const ci = output.measurementCI[key];
                          const b = baseline?.config.unit === config.unit && baseline.output.primary.measurements[key]?.unit === m.unit
                            ? baseline.output.measurementCI[key] : undefined;
                          return (
                            <tr key={key}>
                              <td>{m.label}</td>
                              <td>{ci.mean.toFixed(2)}</td>
                              <td>{ci.n > 1 ? `${ci.lower.toFixed(2)}–${ci.upper.toFixed(2)}` : "—"}</td>
                              <td>{m.unit}</td>
                              {baseline && (<><td>{b?.mean.toFixed(2) ?? "—"}</td><td>{b ? (ci.mean - b.mean).toFixed(2) : "—"}</td></>)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="panel-pad">
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Run the model to see results.</p>
                </div>
              )
            )}
            {panelTab === "export" && (
              <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <CodeExport model={model} config={config} />
                <SimmerCodeExport model={model} config={config} />
              </div>
            )}
            {panelTab === "events" && (
              output ? (
                <div style={{ height: "100%" }}>
                  <EventLog trace={output.primary.trace} playbackIndex={index} nodeNames={nodeNames} />
                </div>
              ) : (
                <div className="panel-pad">
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Run the model to see the event log.</p>
                </div>
              )
            )}
            {panelTab === "formal" && (
              <div className="panel-pad">
                <ProcessFormalView model={model} />
              </div>
            )}
            {panelTab === "experiments" && (
              <div className="panel-pad" style={{ padding: 0 }}>
                <ExperimentPanel model={model} config={config} semantic={semantic} />
              </div>
            )}
          </div>
        </>,
        rightPanelElement
      )}

      {/* HOW-TO modal */}
      <dialog
        ref={howToRef}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--bg-elevated)",
          color: "var(--text)",
          padding: 0,
          maxWidth: 680,
          width: "90vw",
          maxHeight: "80vh",
          boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.18))",
        }}
        onClick={(e) => { if (e.target === howToRef.current) howToRef.current?.close(); }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>How to construct a DES model</h2>
          <button
            className="icon-btn"
            onClick={() => howToRef.current?.close()}
            aria-label="Close"
            style={{ fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "calc(80vh - 60px)", fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)" }}>
          <p>
            <strong style={{ color: "var(--text)" }}>Process view</strong> follows entities through activities.
            Solid arrows move entities. Labeled dashed associations connect
            activities to reusable resources and stock operations to stores. A
            server combines a FIFO or priority queue, acquisition, a timed
            activity and release.
          </p>
          <ol style={{ paddingLeft: 20, margin: "10px 0" }}>
            <li>Identify the entities, resources and stored quantities.</li>
            <li>Set initial populations, available resources and stock.</li>
            <li>Connect activities and waiting points; choose timing distributions.</li>
            <li>Add decisions with explicit conditions. A decision chooses one route; a signal creates a separate entity.</li>
            <li>Specify stock consumption, replenishment, costs and revenue.</li>
            <li>Choose a time unit, stopping rule and observation window, then validate and run.</li>
          </ol>
          <p>
            <strong style={{ color: "var(--text)" }}>Example:</strong> a broken machine waits for a repairer,
            undergoes repair, releases the repairer and returns to the spare
            store. An operating position waits for a spare before starting its
            next operating cycle. These are separate entity roles.
          </p>
          <p>
            <strong style={{ color: "var(--text)" }}>Activity-cycle diagrams</strong> emphasize waiting places and
            activities shared by entity/resource cycles.{" "}
            <strong style={{ color: "var(--text)" }}>Petri nets</strong> use places, tokens and transitions; timed
            and coloured variants add time and entity data. The Formal view in the right panel
            gives a Petri-inspired specification of this process model.
          </p>
          <p>
            Two outputs never imply an automatic fork. Decision outputs are{" "}
            <strong style={{ color: "var(--text)" }}>true/false</strong>; Signal outputs are{" "}
            <strong style={{ color: "var(--text)" }}>out/spawn</strong>. Resource and store associations do not
            move entities. Queues inside activities and blocking stock operations
            use FIFO by default. Activity priorities serve higher numeric values
            first, with FIFO ties, and do not interrupt work already in progress.
          </p>
          <p>
            <strong style={{ color: "var(--text)" }}>Entity data and parallel work:</strong> Source and Population
            blocks set an entity type and numeric attributes. Assign blocks update
            attributes using numbers, quantities, stock, resource availability or
            arithmetic. A Probability route draws one true/false choice. Batch
            waits for complete groups and Unbatch releases their original members.
            Join matches the most recent shared Signal fork at inputs a and b,
            retains a and completes b.
          </p>
          <p>
            <strong style={{ color: "var(--text)" }}>Experiments:</strong> Export a JSON snapshot before trying
            variants, or use Undo. Parameter experiments run every combination of
            one or two numeric settings without editing the canvas.
          </p>
          <p style={{ fontSize: 12 }}>
            At equal times, shift capacity changes run first, then completions,
            then process steps, then external arrivals. A fixed horizon observes [warm-up, horizon);
            drain mode closes arrivals and finishes remaining work.
          </p>
        </div>
      </dialog>
    </div>
  );
}
