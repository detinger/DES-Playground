import FormalModel from './FormalModel';
import { MathText } from './Math';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Controls,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SourceNode, ServerNode, SinkNode } from './nodes/CustomNodes';
import { NodeData, DistributionType, DistributionParams } from '../types';
import {
  PlayCircle, Server, LogOut, Settings, Play, Pause, RotateCcw,
  BarChart3, ShieldCheck, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { LineChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';
import ValidationPanel from './ValidationPanel';
import EventLog from './EventLog';
import ReplicationsPanel from './ReplicationsPanel';
import { compileModel } from '../lib/compiler';
import { validateModel } from '../lib/validator';
import { ValidationResult } from '../lib/model';
import { EngineResult, RunConfig, DEFAULT_RUN_CONFIG, RunOutput, runReplications } from '../lib/engine';

const nodeTypes = {
  source: SourceNode,
  server: ServerNode,
  sink: SinkNode,
};

let id = 4;
const getId = () => `${id++}`;

interface EditorProps {
  nodes: Node<NodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  exampleConfig?: Partial<RunConfig>;
  rightPanelElement: HTMLDivElement | null;
}

export default function Editor({ nodes, setNodes, edges, setEdges, exampleConfig, rightPanelElement }: EditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [chartPaneHeight, setChartPaneHeight] = useState(320);
  const [chartPaneVisible, setChartPaneVisible] = useState(true);
  const chartPaneResize = useRef<{ pointerId: number; startY: number; startH: number } | null>(null);

  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  // Keep validation through playback and layout changes, but clear it after model edits.
  const validationKey = JSON.stringify({
    nodes: nodes.map(({ id, data }) => ({ id, type: data.type, label: data.label,
      distribution: data.distribution, capacity: data.capacity })),
    edges: edges.map(({ source, target }) => ({ source, target })),
  });
  useEffect(() => { setValidationResult(null); }, [validationKey]);
  const formalModel = useMemo(() => compileModel(nodes, edges), [validationKey]);
  const isValid = validationResult !== null && validationResult.issues.length === 0;


  const handleValidate = useCallback(() => {
    const model = compileModel(nodes, edges);
    setValidationResult(validateModel(model));
  }, [nodes, edges]);

  const handleSelectNode = useCallback((nodeId: string) => {
    const node = nodes.find((n: any) => n.id === nodeId);
    if (node) setSelectedNode(node as any);
  }, [nodes]);

  // ── Engine / playback state ────────────────────────────────────────────────
  const [runResult, setRunResult]         = useState<EngineResult | null>(null);
  const [runOutput, setRunOutput]         = useState<RunOutput | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [runConfig, setRunConfig]         = useState<RunConfig>(DEFAULT_RUN_CONFIG);
  const [panelTab, setPanelTab]       = useState<"properties" | "metrics" | "events" | "formal" | "export">("properties");

  const handleRun = useCallback(() => {
    const model = compileModel(nodes, edges);
    const vr = validateModel(model);
    setValidationResult(vr);
    if (vr.hasErrors) return;
    const output = runReplications(model, runConfig);
    setRunOutput(output);
    setRunResult(output.primary);
    setPlaybackIndex(0);
    setIsPlaying(output.primary.trace.length > 1);
  }, [nodes, edges, runConfig]);

  const handleReset = useCallback(() => {
    setRunResult(null);
    setRunOutput(null);
    setPlaybackIndex(0);
    setIsPlaying(false);
    setNodes((nds: Node<NodeData>[]) => nds.map(n => ({ ...n, data: { ...n.data, simState: undefined } })));
  }, [setNodes]);

  // Playback animation
  useEffect(() => {
    if (!runResult || !isPlaying) return;
    const eventsPerTick = Math.max(1, Math.round(playbackSpeed * 2));
    const id = setInterval(() => {
      setPlaybackIndex(i => {
        const next = i + eventsPerTick;
        if (next >= runResult.trace.length - 1) {
          setIsPlaying(false);
          return runResult.trace.length - 1;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(id);
  }, [runResult, isPlaying, playbackSpeed]);

  // Apply example config (from Theory tab) when a new example is loaded
  useEffect(() => {
    if (!exampleConfig) return;
    setRunConfig(c => ({ ...c, ...exampleConfig }));
    setRunResult(null);
    setRunOutput(null);
    setValidationResult(null);
    setPlaybackIndex(0);
    setIsPlaying(false);
    setSelectedNode(null);
  }, [exampleConfig]);

  // Drive node simState from playback position
  useEffect(() => {
    if (!runResult?.trace.length) return;
    const ev = runResult.trace[Math.min(playbackIndex, runResult.trace.length - 1)];
    const nsMap = ev.state.nodeStates;
    setNodes((nds: Node<NodeData>[]) => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        simState: nsMap[n.id]
          ? { ...nsMap[n.id], busyServers: nsMap[n.id].busyServers }
          : undefined,
      },
    })));
  }, [playbackIndex, runResult, setNodes]);

  useEffect(() => { if (selectedNode) setPanelTab("properties"); }, [selectedNode?.id]);
  useEffect(() => { if (runResult) setPanelTab("metrics"); }, [runResult]);

  // Pre-computed minute-by-minute chart data for the full run (queue + utilization)
  const totalCapacity = useMemo(
    () => nodes.filter((n: Node<NodeData>) => n.data.type === 'server')
              .reduce((s: number, n: Node<NodeData>) => s + (n.data.capacity || 1), 0),
    [nodes],
  );

  const fullChartData = useMemo(() => {
    if (!runResult?.trace.length) return [];
    const data: { time: number; queueLength: number; utilPct: number }[] = [];
    let lastMin = -1;
    for (const ev of runResult.trace) {
      const min = Math.floor(ev.t);
      if (min !== lastMin) {
        const q = Object.values(ev.state.nodeStates).reduce((s, n) => s + n.queueLength, 0);
        const b = Object.values(ev.state.nodeStates).reduce((s, n) => s + n.busyServers, 0);
        data.push({ time: ev.t, queueLength: q, utilPct: totalCapacity > 0 ? (b / totalCapacity) * 100 : 0 });
        lastMin = min;
      }
    }
    return data;
  }, [runResult, totalCapacity]);

  const currentT   = runResult?.trace[playbackIndex]?.t ?? 0;
  const chartData  = useMemo(
    () => fullChartData.filter(d => d.time <= currentT),
    [fullChartData, currentT],
  );

  // Wait-time histogram from observation-window entities
  const waitHistogram = useMemo(() => {
    if (!runResult?.entities.length) return [];
    const waits = runResult.entities
      .filter(e => e.departureTime !== undefined && e.arrivalTime >= runConfig.warmup)
      .map(e => e.waitTime);
    if (!waits.length) return [];
    const maxW = Math.max(...waits);
    if (maxW <= 0) return [{ label: '0', count: waits.length }];
    const BINS = 15;
    const binSize = maxW / BINS;
    const counts  = new Array(BINS).fill(0);
    for (const w of waits) counts[Math.min(Math.floor(w / binSize), BINS - 1)]++;
    return counts.map((count, i) => ({ label: (i * binSize).toFixed(1), count }));
  }, [runResult, runConfig.warmup]);

  // Metrics to display: CI mean if multi-rep, else single-run metrics
  const displayMetrics = useMemo(() => {
    if (!runOutput) return null;
    if (runOutput.reps.length === 1) return runOutput.primary.metrics;
    // Build Partial<RunMetrics> from CI means
    const m: Record<string, number> = {};
    for (const [k, ci] of Object.entries(runOutput.ci)) {
      if (ci) m[k] = ci.mean;
    }
    return { ...runOutput.primary.metrics, ...m };
  }, [runOutput]);

  // Node name map for event log
  const nodeNames: Record<string, string> = useMemo(
    () => Object.fromEntries(nodes.map((n: Node<NodeData>) => [n.id, n.data.label])),
    [nodes],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<NodeData>>[]) => setNodes((nds: Node<NodeData>[]) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds: Edge[]) => addEdge<Edge>({ ...params, type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<NodeData> = {
        id: getId(),
        type,
        position,
        data: {
          label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
          type: type as any,
          ...(type === 'source' ? { distribution: { type: 'exponential', mean: 5 } } : {}),
          ...(type === 'server' ? { capacity: 1, distribution: { type: 'exponential', mean: 4 } } : {}),
        },
      };

      setNodes((nds: Node<NodeData>[]) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes],
  );

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node as Node<NodeData>);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = (nodeId: string, newData: Partial<NodeData>) => {
    setNodes((nds: Node<NodeData>[]) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
    
    if (selectedNode?.id === nodeId) {
      setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, ...newData } } : null);
    }
  };

  const updateDistribution = (nodeId: string, distParams: Partial<DistributionParams>) => {
    setNodes((nds: Node<NodeData>[]) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const currentDist = node.data.distribution || { type: 'exponential', mean: 1 };
          return {
            ...node,
            data: {
              ...node.data,
              distribution: { ...currentDist, ...distParams } as DistributionParams,
            },
          };
        }
        return node;
      })
    );
    
    if (selectedNode?.id === nodeId) {
      setSelectedNode((prev) => {
        if (!prev) return null;
        const currentDist = prev.data.distribution || { type: 'exponential', mean: 1 };
        return {
          ...prev,
          data: {
            ...prev.data,
            distribution: { ...currentDist, ...distParams } as DistributionParams,
          },
        };
      });
    }
  };

  const m   = displayMetrics;
  const fmt = (v: number | undefined) => (v !== undefined ? v.toFixed(2) : '—');

  const inputCls = "w-full h-[34px] px-3 rounded-[6px] text-sm border outline-none transition-colors";
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-sunken)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontFamily: 'var(--font-sans)',
  };
  const labelCls = "block text-xs font-semibold mb-1";
  const labelStyle: React.CSSProperties = { color: 'var(--text-muted)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Controls bar */}
      <div style={{
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Run config */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Horizon', key: 'horizon' as const, min: 10, max: 100000, step: 10, suffix: 'min', width: 72 },
            { label: 'Warm-up', key: 'warmup'  as const, min: 0,  max: 100000, step: 10, suffix: 'min', width: 72 },
            { label: 'Seed',    key: 'seed'    as const, min: 0,  max: 999999, step: 1,  suffix: '',    width: 64 },
            { label: 'Reps',    key: 'replications' as const, min: 1, max: 50, step: 1, suffix: '', width: 48 },
          ].map(({ label, key, min, max, step, suffix, width }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
              {label}
              <input
                type="number" min={min} max={max} step={step}
                value={runConfig[key]}
                onChange={e => setRunConfig(c => ({ ...c, [key]: Math.max(min, parseInt(e.target.value) || min) }))}
                style={{ width, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-sunken)', color: 'var(--text)', fontSize: 12 }}
              />
              {suffix && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{suffix}</span>}
            </label>
          ))}
          {runResult && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)', borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
              t = {currentT.toFixed(1)} | {playbackIndex + 1}/{runResult.trace.length} events
              {runResult.truncatedAt && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>⚠ capped</span>}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handleValidate} className={`ui-btn${isValid ? ' ui-btn--success' : ''}`}
            title={isValid ? 'Model is valid — no issues found' : 'Validate model'}
            aria-label={isValid ? 'Validate model: valid, no issues found' : 'Validate model'}>
            <ShieldCheck size={14} /> Validate
          </button>
          <button
            onClick={handleRun}
            disabled={!!validationResult?.hasErrors}
            className="ui-btn"
            style={validationResult?.hasErrors
              ? { opacity: 0.4, cursor: 'not-allowed' }
              : { background: 'var(--primary)', border: '1px solid var(--primary)', color: 'var(--text-on-primary)' }
            }
            title={validationResult?.hasErrors ? 'Fix errors before running' : 'Compute simulation and play from the beginning'}
          >
            <Play size={14} /> Run
          </button>

          {/* Playback controls — only shown after a run */}
          {runResult && (<>
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            <button
              onClick={() => setPlaybackIndex(0)}
              className="icon-btn" title="Jump to start"
              disabled={playbackIndex === 0}
              style={playbackIndex === 0 ? { opacity: 0.4 } : {}}
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setPlaybackIndex(i => Math.max(0, i - 1))}
              className="icon-btn" title="Step back"
              disabled={playbackIndex === 0}
              style={playbackIndex === 0 ? { opacity: 0.4 } : {}}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => {
                if (!isPlaying && playbackIndex >= runResult.trace.length - 1) setPlaybackIndex(0);
                setIsPlaying(p => !p && runResult.trace.length > 1);
              }}
              disabled={runResult.trace.length < 2}
              className="ui-btn"
              style={isPlaying
                ? { background: 'var(--error-soft)', border: '1px solid var(--error)', color: 'var(--error)' }
                : {}
              }
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => setPlaybackIndex(i => Math.min(runResult.trace.length - 1, i + 1))}
              className="icon-btn" title="Step forward"
              disabled={playbackIndex >= runResult.trace.length - 1}
              style={playbackIndex >= runResult.trace.length - 1 ? { opacity: 0.4 } : {}}
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => { setPlaybackIndex(runResult.trace.length - 1); setIsPlaying(false); }}
              className="icon-btn" title="Jump to end"
              disabled={playbackIndex >= runResult.trace.length - 1}
              style={playbackIndex >= runResult.trace.length - 1 ? { opacity: 0.4 } : {}}
            >
              <ChevronsRight size={14} />
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', marginLeft: 2 }}>
              <input
                type="range" min="1" max="20" step="1"
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(parseInt(e.target.value))}
                style={{ width: 72, accentColor: 'var(--primary)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--primary)', width: 28, fontVariantNumeric: 'tabular-nums' }}>{playbackSpeed}×</span>
            </label>
          </>)}
          <button onClick={handleReset} className="icon-btn" title="Reset">
            <RotateCcw size={15} />
          </button>


        </div>
      </div>

      {/* Validation panel */}
      {validationResult && (
        <ValidationPanel
          result={validationResult}
          onSelectNode={handleSelectNode}
        />
      )}

      {/* Modeler workspace */}
      <div className="modeler-workspace" style={{ marginTop: 0 }}>
      <div className="modeler-canvas-col">
        {/* Node palette */}
        <div className="editor-component-toolbar">
          <div className="editor-component-palette" role="group" aria-label="Components">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)' }}>
            Components
          </div>

          {[
            { type: 'source', icon: <PlayCircle size={15} style={{ color: 'var(--success)' }} />, label: 'Source' },
            { type: 'server', icon: <Server size={15} style={{ color: 'var(--accent)' }} />, label: 'Server' },
            { type: 'sink',   icon: <LogOut size={15} style={{ color: 'var(--error)' }} />,   label: 'Sink' },
          ].map(item => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', item.type); e.dataTransfer.effectAllowed = 'move'; }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                cursor: 'grab',
                fontSize: 13,
                color: 'var(--text)',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
          </div>

          <div className="editor-component-hint">
            Drag nodes onto the canvas. Connect by dragging handles.
          </div>
        </div>

        <div className="editor-canvas-area">
          <div id="model-canvas" style={{ flex: 1, position: 'relative', minWidth: 0 }} ref={reactFlowWrapper}>
            <ReactFlow
              proOptions={{ hideAttribution: true }}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              style={{ background: 'var(--canvas-bg)' }}
            >
              <Controls />
            </ReactFlow>
          </div>
        </div>

      </div>{/* end modeler-canvas-col */}

      </div>{/* end modeler-workspace */}

      {/* Results ribbon — always visible */}
      <div style={{
        height: 32, flexShrink: 0,
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        paddingLeft: 12, gap: 8,
      }}>
        {runResult && chartPaneVisible && (
          <div
            style={{ width: 32, height: 3, background: 'var(--border)', borderRadius: 2, cursor: 'ns-resize', flexShrink: 0 }}
            onPointerDown={(e) => {
              chartPaneResize.current = { pointerId: e.pointerId, startY: e.clientY, startH: chartPaneHeight };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = chartPaneResize.current;
              if (!d || d.pointerId !== e.pointerId) return;
              setChartPaneHeight(Math.max(150, Math.min(700, d.startH - (e.clientY - d.startY))));
            }}
            onPointerUp={() => { chartPaneResize.current = null; }}
            onPointerCancel={() => { chartPaneResize.current = null; }}
          />
        )}
        <button
          onClick={() => runResult && setChartPaneVisible(v => !v)}
          disabled={!runResult}
          title={!runResult ? 'Run a simulation to see results' : chartPaneVisible ? 'Hide results' : 'Show results'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            border: 'none', background: 'none', cursor: runResult ? 'pointer' : 'default',
            color: runResult ? 'var(--primary)' : 'var(--text-subtle)',
            fontSize: 12, fontWeight: 650, padding: '0 4px',
            fontFamily: 'inherit',
          }}
        >
          {chartPaneVisible && runResult ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          Results
        </button>
      </div>

      {/* Results pane */}
      {runResult && chartPaneVisible && (
        <div style={{ height: chartPaneHeight, flexShrink: 0, overflow: 'hidden', display: 'flex', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: '10px 16px', minWidth: 0 }}>
            <div style={{ marginBottom: 6, flexShrink: 0 }}>
              <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--text)' }}>Queue &amp; utilisation over time</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{`t = ${currentT.toFixed(1)} min`}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--chart-axis)" tickFormatter={(v: number) => `${v.toFixed(0)}`} tick={{ fontSize: 10 }} minTickGap={20} />
                  <YAxis yAxisId="left" stroke="var(--chart-1)" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--chart-3)" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 11 }}
                    formatter={(v: any, name: string) => name === 'Util %' ? [`${Number(v).toFixed(1)}%`, name] : [v, name]}
                    labelFormatter={(l: any) => `t = ${Number(l).toFixed(1)} min`} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Line yAxisId="left"  type="stepAfter" dataKey="queueLength" name="Queue" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="stepAfter" dataKey="utilPct" name="Util %" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          {waitHistogram.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 16px', borderLeft: '1px solid var(--border)', minWidth: 0, maxWidth: '33.33%' }}>
              <div style={{ marginBottom: 6, flexShrink: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--text)' }}>Wait-time distribution</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  Arrivals ≥ warm-up {runConfig.warmup > 0 ? `(${runConfig.warmup} min)` : ''}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitHistogram} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} minTickGap={15} />
                    <YAxis stroke="var(--chart-axis)" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: any) => [v, 'Count']} labelFormatter={(l: any) => `Wq ≥ ${l} min`} />
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
          {(["properties", "metrics", "events", "formal", "export"] as const).map((tab) => (
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

          {/* Properties tab */}
          {panelTab === "properties" && (
            selectedNode ? (
              <div className="panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  <Settings size={15} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>Properties</span>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Name</label>
                  <input type="text" value={selectedNode.data.label}
                    onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                    className={inputCls} style={inputStyle} />
                </div>
                {selectedNode.data.type === 'server' && (
                  <div>
                    <label className={labelCls} style={labelStyle}>Capacity (servers)</label>
                    <input type="number" min="1" value={selectedNode.data.capacity || 1}
                      onChange={(e) => updateNodeData(selectedNode.id, { capacity: parseInt(e.target.value) || 1 })}
                      className={inputCls} style={inputStyle} />
                  </div>
                )}
                {(selectedNode.data.type === 'source' || selectedNode.data.type === 'server') && selectedNode.data.distribution && (
                  <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                      {selectedNode.data.type === 'source' ? 'Inter-arrival time' : 'Service time'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <label className={labelCls} style={labelStyle}>Distribution</label>
                        <select value={selectedNode.data.distribution.type}
                          onChange={(e) => updateDistribution(selectedNode.id, { type: e.target.value as DistributionType })}
                          className={inputCls} style={inputStyle}>
                          <option value="exponential">Exponential</option>
                          <option value="normal">Normal</option>
                          <option value="uniform">Uniform</option>
                          <option value="triangular">Triangular</option>
                          <option value="constant">Constant</option>
                        </select>
                      </div>
                      {selectedNode.data.distribution.type === 'exponential' && (
                        <div>
                          <label className={labelCls} style={labelStyle}>Mean (minutes)</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.mean || 1}
                            onChange={(e) => updateDistribution(selectedNode.id, { mean: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                      )}
                      {selectedNode.data.distribution.type === 'normal' && (<>
                        <div>
                          <label className={labelCls} style={labelStyle}>Mean</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.mean || 1}
                            onChange={(e) => updateDistribution(selectedNode.id, { mean: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label className={labelCls} style={labelStyle}>Std deviation</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.stdDev || 0.5}
                            onChange={(e) => updateDistribution(selectedNode.id, { stdDev: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                      </>)}
                      {selectedNode.data.distribution.type === 'uniform' && (<>
                        <div>
                          <label className={labelCls} style={labelStyle}>Min</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.min || 0}
                            onChange={(e) => updateDistribution(selectedNode.id, { min: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label className={labelCls} style={labelStyle}>Max</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.max || 10}
                            onChange={(e) => updateDistribution(selectedNode.id, { max: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                      </>)}
                      {selectedNode.data.distribution.type === 'triangular' && (<>
                        <div>
                          <label className={labelCls} style={labelStyle}>Min</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.min || 0}
                            onChange={(e) => updateDistribution(selectedNode.id, { min: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label className={labelCls} style={labelStyle}>Mode</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.mode || 5}
                            onChange={(e) => updateDistribution(selectedNode.id, { mode: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                        <div>
                          <label className={labelCls} style={labelStyle}>Max</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.max || 10}
                            onChange={(e) => updateDistribution(selectedNode.id, { max: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                      </>)}
                      {selectedNode.data.distribution.type === 'constant' && (
                        <div>
                          <label className={labelCls} style={labelStyle}>Value</label>
                          <input type="number" step="0.1" value={selectedNode.data.distribution.value || 5}
                            onChange={(e) => updateDistribution(selectedNode.id, { value: parseFloat(e.target.value) || 0 })}
                            className={inputCls} style={inputStyle} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ paddingTop: 12, marginTop: 4 }}>
                  <button
                    onClick={() => { setNodes((nds: Node<NodeData>[]) => nds.filter(n => n.id !== selectedNode.id)); setSelectedNode(null); }}
                    className="ui-btn"
                    style={{ width: '100%', justifyContent: 'center', background: 'var(--error-soft)', border: '1px solid var(--error)', color: 'var(--error)' }}
                  >
                    Delete node
                  </button>
                </div>
              </div>
            ) : (
              <div className="panel-pad">
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a node to view its properties.</p>
              </div>
            )
          )}

          {/* Metrics tab */}
          {panelTab === "metrics" && (
            runResult ? (
              <div className="panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <BarChart3 size={15} style={{ color: 'var(--chart-3)' }} />
                    <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>Performance Metrics</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                      {runResult.runDurationMs.toFixed(0)} ms · seed {runResult.seed}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {[
                      { label: 'Mean wait time (Wq)',   value: fmt(m?.avgWaitTime),    unit: 'min' },
                      { label: 'Mean sojourn (W)',       value: fmt(m?.avgSojournTime), unit: 'min' },
                      { label: 'Total departures',       value: m ? fmt(m.totalDepartures) : '—', unit: 'entities' },
                      { label: 'Throughput',             value: m ? fmt(m.throughput) : '—',   unit: '/min' },
                      { label: 'Avg queue length (Lq)',  value: fmt(m?.avgQueueLength), unit: 'entities' },
                      { label: 'Server utilisation (ρ̂)', value: m ? (m.avgUtilization * 100).toFixed(1) : '—', unit: '%' },
                      { label: 'Peak queue length',      value: m ? fmt(m.maxQueueLength) : '—',   unit: 'entities' },
                      { label: 'Total arrivals',         value: m ? fmt(m.totalArrivals) : '—',    unit: 'entities' },
                    ].map(kpi => (
                      <div key={kpi.label} className="kpi-tile">
                        <div className="kpi-label"><MathText>{kpi.label}</MathText></div>
                        <div className="kpi-value">{kpi.value}</div>
                        <div className="kpi-unit">{kpi.unit}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {runOutput && runOutput.reps.length > 1 && (
                  <ReplicationsPanel output={runOutput} />
                )}
              </div>
            ) : (
              <div className="panel-pad">
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Run the simulation to see metrics.</p>
              </div>
            )
          )}

          {/* Events tab */}
          {panelTab === "events" && (
            runResult ? (
              <div style={{ height: '100%' }}>
                <EventLog trace={runResult.trace} playbackIndex={playbackIndex} nodeNames={nodeNames} />
              </div>
            ) : (
              <div className="panel-pad">
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Run the model to see the event log.</p>
              </div>
            )
          )}

          {/* Formal tab */}
          {panelTab === "formal" && (
            <div className="panel-pad">
              <FormalModel model={formalModel} />
            </div>
          )}

          {/* Export tab */}
          {panelTab === "export" && (
            <div className="panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <CodeExport model={formalModel} config={runConfig} />
              <SimmerCodeExport model={formalModel} config={runConfig} />
            </div>
          )}

          </div>
        </>,
        rightPanelElement
      )}
    </div>
  );
}
