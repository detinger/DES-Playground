import { createPortal } from 'react-dom';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Controls,
  Background,
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
  Flag, Layers, GitCompare, Code2,
} from 'lucide-react';
import { LineChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';
import ValidationPanel from './ValidationPanel';
import EventLog from './EventLog';
import ReplicationsPanel from './ReplicationsPanel';
import TheoryPanel from './TheoryPanel';
import ComparisonPanel from './ComparisonPanel';
import { Scenario, compareScenarios } from '../lib/scenarios';
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
  headerActionsElement: HTMLDivElement | null;
  nodes: Node<NodeData>[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  exampleConfig?: Partial<RunConfig>;
}

export default function Editor({ headerActionsElement, nodes, setNodes, edges, setEdges, exampleConfig }: EditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

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
  const [lastCompiledModel, setLastCompiledModel] = useState<import('../lib/model').DesModel | null>(null);
  const [baseline, setBaseline]       = useState<Scenario | null>(null);
  const [alternative, setAlternative] = useState<Scenario | null>(null);
  const [showExport, setShowExport]   = useState(false);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showExport) exportPanelRef.current?.scrollIntoView({ block: 'start' });
  }, [showExport]);

  const handleRun = useCallback(() => {
    const model = compileModel(nodes, edges);
    const vr = validateModel(model);
    setValidationResult(vr);
    if (vr.hasErrors) return;
    const output = runReplications(model, runConfig);
    setRunOutput(output);
    setRunResult(output.primary);
    setLastCompiledModel(model);
    setPlaybackIndex(output.primary.trace.length - 1);
    setIsPlaying(false);
  }, [nodes, edges, runConfig]);

  const handleReset = useCallback(() => {
    setShowExport(false);
    setRunResult(null);
    setRunOutput(null);
    setLastCompiledModel(null);
    setPlaybackIndex(0);
    setIsPlaying(false);
    setNodes((nds: Node[]) => nds.map(n => ({ ...n, data: { ...n.data, simState: undefined } })));
  }, [setNodes]);

  const saveScenario = useCallback((id: 'baseline' | 'alternative') => {
    if (!runOutput || !lastCompiledModel) return;
    const s: Scenario = {
      id,
      name: id === 'baseline' ? 'Baseline' : 'Alternative',
      nodes: nodes.map(n => ({ ...n, data: { ...n.data, simState: undefined } })),
      edges: [...edges],
      config: { ...runConfig },
      output: runOutput,
      model: lastCompiledModel,
      savedAt: Date.now(),
    };
    if (id === 'baseline') setBaseline(s); else setAlternative(s);
  }, [nodes, edges, runConfig, runOutput, lastCompiledModel]);

  const loadScenario = useCallback((s: Scenario) => {
    setNodes(s.nodes);
    setEdges(s.edges);
    setRunConfig(s.config);
    setRunOutput(s.output);
    setRunResult(s.output.primary);
    setLastCompiledModel(s.model);
    setValidationResult(null);
    setPlaybackIndex(s.output.primary.trace.length - 1);
    setIsPlaying(false);
  }, [setNodes, setEdges]);

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
    setLastCompiledModel(null);
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
    setNodes((nds: Node[]) => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        simState: nsMap[n.id]
          ? { ...nsMap[n.id], busyServers: nsMap[n.id].busyServers }
          : undefined,
      },
    })));
  }, [playbackIndex, runResult, setNodes]);

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
    return m as typeof runOutput.primary.metrics;
  }, [runOutput]);

  // Node name map for event log
  const nodeNames: Record<string, string> = useMemo(
    () => Object.fromEntries(nodes.map((n: Node<NodeData>) => [n.id, n.data.label])),
    [nodes],
  );

  // Scenario comparison (only when both snapshots exist)
  const comparison = useMemo(
    () => baseline && alternative ? compareScenarios(baseline, alternative) : null,
    [baseline, alternative],
  );

  // Playback-derived node states (for the server visualizer)
  const currentNodeStates = useMemo(() => {
    if (!runResult?.trace.length) return {} as Record<string, any>;
    const ev = runResult.trace[Math.min(playbackIndex, runResult.trace.length - 1)];
    return ev.state.nodeStates;
  }, [runResult, playbackIndex]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds: Node[]) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds: Edge[]) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)),
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

      setNodes((nds: Node[]) => nds.concat(newNode));
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
    setNodes((nds: Node[]) =>
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
    setNodes((nds: Node[]) =>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {headerActionsElement && createPortal(
        <button
          onClick={() => setShowExport(s => !s)}
          className={`ui-btn${showExport ? ' ui-btn--primary' : ''}`}
          title={lastCompiledModel ? 'Toggle Python / R code export' : 'Run the model to enable Python / R code export'}
          disabled={!lastCompiledModel}
          aria-expanded={showExport}
          aria-controls={showExport ? 'model-code-export' : undefined}
          style={!lastCompiledModel ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          <Code2 size={16} /> {showExport ? 'Hide Export' : 'Export Code'}
        </button>,
        headerActionsElement,
      )}

      {/* Controls bar */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
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
          <button onClick={handleValidate} className="ui-btn" title="Validate model">
            <ShieldCheck size={14} /> Validate
          </button>
          <button
            onClick={handleRun}
            disabled={!!validationResult?.hasErrors}
            className="ui-btn"
            style={validationResult?.hasErrors
              ? { opacity: 0.4, cursor: 'not-allowed' }
              : { background: 'var(--primary)', borderColor: 'var(--primary)', color: 'var(--text-on-primary)' }
            }
            title={validationResult?.hasErrors ? 'Fix errors before running' : 'Compute simulation'}
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
              onClick={() => setIsPlaying(p => !p)}
              className="ui-btn"
              style={isPlaying
                ? { background: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)' }
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

          {/* Scenario save buttons — shown after a run */}
          {runOutput && (<>
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
            <button
              onClick={() => saveScenario('baseline')}
              className="ui-btn"
              title="Save current run as Baseline for comparison"
              style={baseline ? { borderColor: 'var(--chart-1)', color: 'var(--chart-1)' } : {}}
            >
              <Flag size={13} />
              {baseline ? 'Baseline ✓' : 'Save Baseline'}
            </button>
            <button
              onClick={() => saveScenario('alternative')}
              className="ui-btn"
              title="Save current run as Alternative for comparison"
              style={alternative ? { borderColor: 'var(--chart-3)', color: 'var(--chart-3)' } : {}}
            >
              <Layers size={13} />
              {alternative ? 'Alt ✓' : 'Save Alt'}
            </button>
            {baseline && alternative && (
              <span style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <GitCompare size={12} /> Compare ↓
              </span>
            )}
          </>)}

        </div>
      </div>

      {/* Validation panel */}
      {validationResult && (
        <ValidationPanel
          result={validationResult}
          onSelectNode={handleSelectNode}
        />
      )}

      {/* Editor workspace */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: 'var(--canvas-bg)',
      }}>
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
        {/* React Flow canvas */}
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
            <Background color="var(--border)" gap={20} size={1} />
            <Controls />

          </ReactFlow>
        </div>

        {/* Properties panel */}
        {selectedNode && (
          <div style={{
            width: 280,
            background: 'var(--bg-elevated)',
            borderLeft: '1px solid var(--border)',
            padding: 14,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 14, paddingBottom: 10,
              borderBottom: '1px solid var(--border)',
            }}>
              <Settings size={15} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>Properties</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className={labelCls} style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={selectedNode.data.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {selectedNode.data.type === 'server' && (
                <div>
                  <label className={labelCls} style={labelStyle}>Capacity (servers)</label>
                  <input
                    type="number" min="1"
                    value={selectedNode.data.capacity || 1}
                    onChange={(e) => updateNodeData(selectedNode.id, { capacity: parseInt(e.target.value) || 1 })}
                    className={inputCls}
                    style={inputStyle}
                  />
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
                      <select
                        value={selectedNode.data.distribution.type}
                        onChange={(e) => updateDistribution(selectedNode.id, { type: e.target.value as DistributionType })}
                        className={inputCls}
                        style={inputStyle}
                      >
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
                  onClick={() => { setNodes((nds: Node[]) => nds.filter(n => n.id !== selectedNode.id)); setSelectedNode(null); }}
                  className="ui-btn"
                  style={{ width: '100%', justifyContent: 'center', background: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)' }}
                >
                  Delete node
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Server state visualizer (playback-driven) */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>
            {runResult ? 'Playback' : 'Station State'}
          </span>
          {runResult && (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              t = {currentT.toFixed(2)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflowX: 'auto' }}>
          {nodes.filter((n: Node<NodeData>) => n.data.type === 'server').map((node: Node<NodeData>) => {
            const ns = currentNodeStates[node.id];
            const queueLength  = ns?.queueLength  ?? 0;
            const busyServers  = ns?.busyServers   ?? 0;
            const capacity     = node.data.capacity ?? 1;

            return (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.data.label}>{node.data.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>cap: {capacity}</div>
                </div>

                {/* Queue */}
                <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, borderRight: '2px dashed var(--border)', paddingRight: 20, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -18, right: 20, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Queue ({queueLength})</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
                    {Array.from({ length: Math.min(queueLength, 20) }).map((_, i) => (
                      <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', opacity: 0.8 }} />
                    ))}
                    {queueLength > 20 && (
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                        +{queueLength - 20}
                      </div>
                    )}
                    {queueLength === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic', height: 20, display: 'flex', alignItems: 'center' }}>Empty</div>
                    )}
                  </div>
                </div>

                {/* Server slots */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 360, position: 'relative', paddingTop: 14 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Servers</div>
                  {Array.from({ length: capacity }).map((_, idx) => {
                    const isBusy = idx < busyServers;
                    return (
                      <div
                        key={idx}
                        style={{
                          width: 56, height: 56,
                          borderRadius: 'var(--radius)',
                          border: `2px solid ${isBusy ? 'var(--success)' : 'var(--border)'}`,
                          background: isBusy ? 'var(--success-soft)' : 'var(--bg-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'border-color 200ms, background 200ms',
                        }}
                      >
                        {isBusy
                          ? <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--success)' }} />
                          : <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Idle</span>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {nodes.filter((n: Node<NodeData>) => n.data.type === 'server').length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontStyle: 'italic', padding: '24px 0' }}>
              Add a Server node to the canvas, then Run.
            </div>
          )}
          {!runResult && nodes.filter((n: Node<NodeData>) => n.data.type === 'server').length > 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontStyle: 'italic', padding: '12px 0', fontSize: 13 }}>
              Click Run to compute the simulation and enable playback.
            </div>
          )}
        </div>
      </div>

      {/* Performance Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <BarChart3 size={16} style={{ color: 'var(--chart-3)' }} />
            <span style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Performance Metrics</span>
            {runResult && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                {runResult.runDurationMs.toFixed(0)} ms compute · seed {runResult.seed}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {[
              { label: 'Mean wait time (Wq)',   value: fmt(m?.avgWaitTime),    unit: 'min' },
              { label: 'Mean sojourn (W)',       value: fmt(m?.avgSojournTime), unit: 'min' },
              { label: 'Total departures',       value: m ? String(m.totalDepartures) : '—', unit: 'entities' },
              { label: 'Throughput',             value: m ? m.throughput.toFixed(3) : '—',   unit: '/min' },
              { label: 'Avg queue length (Lq)',  value: fmt(m?.avgQueueLength), unit: 'entities' },
              { label: 'Server utilisation (ρ̂)', value: m ? (m.avgUtilization * 100).toFixed(1) : '—', unit: '%' },
              { label: 'Peak queue length',      value: m ? String(m.maxQueueLength) : '—',   unit: 'entities' },
              { label: 'Total arrivals',         value: m ? String(m.totalArrivals) : '—',    unit: 'entities' },
            ].map(kpi => (
              <div key={kpi.label} className="kpi-tile">
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-unit">{kpi.unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Queue length + utilisation dual-axis chart */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', height: 320, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Queue length & utilisation over time</div>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
              {runResult
                ? `Trace up to t = ${currentT.toFixed(1)} min · step through events to scrub`
                : 'Run the simulation to see queue dynamics'}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="time" stroke="var(--chart-axis)" tickFormatter={(v: number) => `${v.toFixed(0)}`} tick={{ fontSize: 11 }} minTickGap={20} label={{ value: 'min', position: 'insideRight', offset: -4, fontSize: 10, fill: 'var(--chart-axis)' }} />
                <YAxis yAxisId="left" stroke="var(--chart-1)" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'Queue', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--chart-1)' }} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--chart-3)" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} label={{ value: 'Util %', angle: 90, position: 'insideRight', fontSize: 10, fill: 'var(--chart-3)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 12 }}
                  formatter={(v: any, name: string) => name === 'Util %' ? [`${Number(v).toFixed(1)}%`, name] : [v, name]}
                  labelFormatter={(l: any) => `t = ${Number(l).toFixed(1)} min`}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Line yAxisId="left"  type="stepAfter" dataKey="queueLength" name="Queue" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="stepAfter" dataKey="utilPct" name="Util %" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Event log */}
        {runResult && (
          <EventLog
            trace={runResult.trace}
            playbackIndex={playbackIndex}
            nodeNames={nodeNames}
          />
        )}

        {/* Wait-time histogram */}
        {waitHistogram.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', height: 260, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Wait-time distribution</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                Entities with arrival ≥ warm-up {runConfig.warmup > 0 ? `(${runConfig.warmup} min)` : ''}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waitHistogram} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} minTickGap={15} label={{ value: 'Wait time (min)', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--chart-axis)' }} />
                  <YAxis stroke="var(--chart-axis)" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 12 }}
                    formatter={(v: any) => [v, 'Count']}
                    labelFormatter={(l: any) => `Wq ≥ ${l} min`}
                  />
                  <Bar dataKey="count" name="Count" fill="var(--chart-2)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Replication summary (shown for multi-rep runs) */}
        {runOutput && runOutput.reps.length > 1 && (
          <ReplicationsPanel output={runOutput} />
        )}

        {/* M/M/c theory comparison */}
        {lastCompiledModel && (
          <TheoryPanel
            model={lastCompiledModel}
            simMean={displayMetrics}
            horizon={runConfig.horizon}
            warmup={runConfig.warmup}
          />
        )}

        {/* Scenario comparison */}
        {comparison && baseline && alternative && (
          <ComparisonPanel
            baseline={baseline}
            alternative={alternative}
            comparison={comparison}
            onLoadBaseline={() => loadScenario(baseline)}
            onLoadAlternative={() => loadScenario(alternative)}
          />
        )}

        {showExport && lastCompiledModel && (
          <div id="model-code-export" ref={exportPanelRef} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
            <CodeExport model={lastCompiledModel} config={runConfig} />
            <SimmerCodeExport model={lastCompiledModel} config={runConfig} />
          </div>
        )}

      </div>
    </div>
  );
}
