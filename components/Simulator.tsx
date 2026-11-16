import { MathFormula, MathText } from './Math';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { compileModel } from '../lib/compiler';
import { DEFAULT_RUN_CONFIG } from '../lib/engine';
import { Play, Pause, RotateCcw, Settings, BarChart3 } from 'lucide-react';
import { SimulationParams, Entity, ServerState, SimulationStats, NodeData } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Node, Edge } from '@xyflow/react';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';

const TICK_RATE_MS = 50;
const MAX_QUEUE_VISUAL = 20;

interface SimulatorProps {
  rightPanelElement: HTMLDivElement | null;
}

export default function Simulator({ rightPanelElement }: SimulatorProps) {
  const [params, setParams] = useState<SimulationParams>({
    arrivalRate: 2.0,
    serviceRate: 2.5,
    numServers: 1,
    simulationSpeed: 1,
  });

  const [isRunning, setIsRunning] = useState(false);

  const [uiState, setUiState] = useState({
    time: 0,
    queueLength: 0,
    servers: [] as ServerState[],
    stats: {
      totalArrivals: 0,
      totalDepartures: 0,
      totalWaitTime: 0,
      totalSystemTime: 0,
      serverBusyTime: 0,
      maxQueueLength: 0,
    } as SimulationStats,
    history: [] as any[],
  });

  const engine = useRef({
    time: 0,
    queue: [] as Entity[],
    servers: Array.from({ length: params.numServers }, (_, i) => ({
      id: i, currentEntity: null, remainingServiceTime: 0,
    })) as ServerState[],
    stats: {
      totalArrivals: 0, totalDepartures: 0, totalWaitTime: 0,
      totalSystemTime: 0, serverBusyTime: 0, maxQueueLength: 0,
    } as SimulationStats,
    nextEntityId: 1,
    history: [] as any[],
    lastTickTime: 0,
  });

  useEffect(() => {
    if (engine.current.servers.length !== params.numServers) {
      engine.current.servers = Array.from({ length: params.numServers }, (_, i) =>
        i < engine.current.servers.length
          ? engine.current.servers[i]
          : { id: i, currentEntity: null, remainingServiceTime: 0 },
      );
    }
  }, [params.numServers]);

  const updateUi = () => {
    setUiState({
      time: engine.current.time,
      queueLength: engine.current.queue.length,
      servers: [...engine.current.servers],
      stats: { ...engine.current.stats },
      history: [...engine.current.history],
    });
  };

  const resetSimulation = useCallback(() => {
    setIsRunning(false);
    engine.current = {
      time: 0,
      queue: [],
      servers: Array.from({ length: params.numServers }, (_, i) => ({
        id: i, currentEntity: null, remainingServiceTime: 0,
      })),
      stats: {
        totalArrivals: 0, totalDepartures: 0, totalWaitTime: 0,
        totalSystemTime: 0, serverBusyTime: 0, maxQueueLength: 0,
      },
      nextEntityId: 1,
      history: [],
      lastTickTime: performance.now(),
    };
    updateUi();
  }, [params.numServers]);

  useEffect(() => {
    if (!isRunning) return;
    let animationFrameId: number;
    let lastTime = performance.now();
    const tick = (currentTime: number) => {
      const deltaTimeMs = currentTime - lastTime;
      if (deltaTimeMs >= TICK_RATE_MS) {
        lastTime = currentTime;
        const dt = (deltaTimeMs / 1000) * params.simulationSpeed;
        const state = engine.current;
        state.time += dt;
        const probArrival = params.arrivalRate * dt;
        if (Math.random() < probArrival) {
          state.queue.push({ id: state.nextEntityId++, arrivalTime: state.time });
          state.stats.totalArrivals++;
          state.stats.maxQueueLength = Math.max(state.stats.maxQueueLength, state.queue.length);
        }
        let busyServers = 0;
        state.servers.forEach(server => {
          if (server.currentEntity) {
            server.remainingServiceTime -= dt;
            busyServers++;
            if (server.remainingServiceTime <= 0) {
              const entity = server.currentEntity;
              entity.endServiceTime = state.time;
              state.stats.totalDepartures++;
              state.stats.totalWaitTime += entity.startServiceTime! - entity.arrivalTime;
              state.stats.totalSystemTime += entity.endServiceTime - entity.arrivalTime;
              server.currentEntity = null;
              server.remainingServiceTime = 0;
            }
          }
          if (!server.currentEntity && state.queue.length > 0) {
            const next = state.queue.shift()!;
            next.startServiceTime = state.time;
            server.currentEntity = next;
            server.remainingServiceTime = -Math.log(1 - Math.random()) / params.serviceRate;
            busyServers++;
          }
        });
        state.stats.serverBusyTime += (busyServers / state.servers.length) * dt;
        if (Math.floor(state.time) > Math.floor(state.time - dt)) {
          state.history.push({
            time: Math.floor(state.time),
            queueLength: state.queue.length,
            utilization: (state.stats.serverBusyTime / state.time) * 100,
          });
          if (state.history.length > 60) state.history.shift();
        }
        updateUi();
      }
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, params]);

  const avgWaitTime = uiState.stats.totalDepartures > 0
    ? (uiState.stats.totalWaitTime / uiState.stats.totalDepartures).toFixed(2) : '0.00';
  const avgSystemTime = uiState.stats.totalDepartures > 0
    ? (uiState.stats.totalSystemTime / uiState.stats.totalDepartures).toFixed(2) : '0.00';
  const utilization = uiState.time > 0
    ? ((uiState.stats.serverBusyTime / uiState.time) * 100).toFixed(1) : '0.0';

  const c = params.numServers;
  const lambda = params.arrivalRate;
  const mu = params.serviceRate;
  const rho = lambda / (c * mu);
  const isUnstable = rho >= 1;

  let theoreticalWaitTime = '∞';
  let theoreticalQueueLength = '∞';
  if (rho < 1) {
    if (c === 1) {
      theoreticalWaitTime = (rho / (mu - lambda)).toFixed(2);
      theoreticalQueueLength = (Math.pow(lambda / mu, 2) / (1 - rho)).toFixed(2);
    } else {
      let sum = 0;
      for (let n = 0; n < c; n++) {
        let fact = 1; for (let i = 1; i <= n; i++) fact *= i;
        sum += Math.pow(c * rho, n) / fact;
      }
      let cFact = 1; for (let i = 1; i <= c; i++) cFact *= i;
      const p0 = 1 / (sum + Math.pow(c * rho, c) / (cFact * (1 - rho)));
      const lq = (p0 * Math.pow(c * rho, c) * rho) / (cFact * Math.pow(1 - rho, 2));
      theoreticalWaitTime = (lq / lambda).toFixed(2);
      theoreticalQueueLength = lq.toFixed(2);
    }
  }

  const exportModel = useMemo(() => {
    const syntheticNodes: Node<NodeData>[] = [
      { id: '1', type: 'source', position: { x: 0, y: 0 }, data: { label: 'Arrivals', type: 'source', distribution: { type: 'exponential', mean: 1 / params.arrivalRate } } },
      { id: '2', type: 'server', position: { x: 0, y: 0 }, data: { label: 'Process', type: 'server', capacity: params.numServers, distribution: { type: 'exponential', mean: 1 / params.serviceRate } } },
      { id: '3', type: 'sink', position: { x: 0, y: 0 }, data: { label: 'Departures', type: 'sink' } },
    ];
    const syntheticEdges: Edge[] = [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
    ];
    return compileModel(syntheticNodes, syntheticEdges, { name: 'MMC Modeler', unit: 'second' });
  }, [params.arrivalRate, params.serviceRate, params.numServers]);

  const sep: React.CSSProperties = { borderBottom: '1px solid var(--border)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Controls ribbon */}
      <div style={{ ...sep, background: 'var(--bg-elevated)', padding: '10px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={13} style={{ color: 'var(--text-subtle)' }} />
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Parameters</span>
        </div>
        {[
          { label: 'Arrival rate (λ)', sub: '/s', min: 0.1, max: 10, step: 0.1, key: 'arrivalRate' as const, color: 'var(--primary)', fmt: params.arrivalRate.toFixed(1) },
          { label: 'Service rate (μ)', sub: '/s', min: 0.1, max: 10, step: 0.1, key: 'serviceRate' as const, color: 'var(--chart-3)', fmt: params.serviceRate.toFixed(1) },
          { label: 'Servers (c)', sub: '', min: 1, max: 5, step: 1, key: 'numServers' as const, color: 'var(--accent)', fmt: String(params.numServers) },
          { label: 'Speed', sub: '×', min: 0.5, max: 10, step: 0.5, key: 'simulationSpeed' as const, color: 'var(--chart-2)', fmt: String(params.simulationSpeed) },
        ].map(s => (
          <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}><MathText>{s.label}</MathText></span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={params[s.key]}
              onChange={e => setParams(p => ({ ...p, [s.key]: s.step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value) }))}
              style={{ width: 90, accentColor: s.color }} />
            <span style={{ fontFamily: 'var(--font-mono)', color: s.color, minWidth: 32, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{s.fmt}{s.sub}</span>
          </label>
        ))}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={() => setIsRunning(r => !r)} className="ui-btn"
            style={isRunning
              ? { background: 'var(--error-soft)', border: '1px solid var(--error)', color: 'var(--error)' }
              : { background: 'var(--primary)', border: '1px solid var(--primary)', color: 'var(--text-on-primary)' }}>
            {isRunning ? <Pause size={13} /> : <Play size={13} />}
            {isRunning ? 'Pause' : 'Run'}
          </button>
          <button onClick={resetSimulation} className="icon-btn" title="Reset">
            <RotateCcw size={13} />
          </button>
        </div>
        {isUnstable && (
          <span style={{ fontSize: 11, color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)', borderRadius: 4, padding: '2px 8px' }}>
            <MathFormula tex={`\\rho = ${rho.toFixed(2)} \\geq 1`} /> — unstable
          </span>
        )}
      </div>

      {/* Body: stacked sections filling the window */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Live simulation visualizer */}
          <div style={{ ...sep, flexShrink: 0 }}>
            <div style={{ ...sep, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)' }}>
              <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>Live Simulation</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>t = {uiState.time.toFixed(1)} s</span>
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 24, overflowX: 'auto' }}>
              {/* Queue */}
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, borderRight: '2px dashed var(--border)', paddingRight: 20, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -16, right: 20, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Queue ({uiState.queueLength})</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
                  {Array.from({ length: Math.min(uiState.queueLength, MAX_QUEUE_VISUAL) }).map((_, i) => (
                    <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', opacity: 0.8 }} />
                  ))}
                  {uiState.queueLength > MAX_QUEUE_VISUAL && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                      +{uiState.queueLength - MAX_QUEUE_VISUAL}
                    </div>
                  )}
                  {uiState.queueLength === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic', height: 22, display: 'flex', alignItems: 'center' }}>Empty</div>
                  )}
                </div>
              </div>
              {/* Servers */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                {uiState.servers.map(server => (
                  <div key={server.id} style={{
                    width: 64, height: 64,
                    border: `2px solid ${server.currentEntity ? 'var(--success)' : 'var(--border)'}`,
                    background: server.currentEntity ? 'var(--success-soft)' : 'var(--bg-subtle)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 300ms, background 300ms',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {server.currentEntity ? (
                      <>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--success)', zIndex: 1 }} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, height: 3, background: 'var(--success)', width: `${Math.max(0, 100 - server.remainingServiceTime * params.serviceRate * 100)}%`, transition: 'width 100ms' }} />
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Idle</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Departures */}
              <div style={{ paddingLeft: 20, borderLeft: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Completed</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{uiState.stats.totalDepartures}</div>
              </div>
            </div>
          </div>

          {/* KPI tiles */}
          <div style={{ ...sep, flexShrink: 0 }}>
            <div style={{ ...sep, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)' }}>
              <BarChart3 size={13} style={{ color: 'var(--chart-3)' }} />
              <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>Performance Metrics</span>
            </div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Mean wait time (Wq)', value: avgWaitTime, unit: 's', theory: `Theory: ${theoreticalWaitTime} s` },
                { label: 'Mean system time (W)', value: avgSystemTime, unit: 's', theory: null },
                { label: 'Utilisation (ρ̂)', value: utilization, unit: '%', theory: `Theory: ${(rho * 100).toFixed(1)}%` },
                { label: 'Peak queue length', value: String(uiState.stats.maxQueueLength), unit: '', theory: `Avg theory: ${theoreticalQueueLength}` },
              ].map(kpi => (
                <div key={kpi.label} className="kpi-tile">
                  <div className="kpi-label"><MathText>{kpi.label}</MathText></div>
                  <div className="kpi-value">{kpi.value}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{kpi.unit}</span></div>
                  {kpi.theory && <div className="kpi-unit">{kpi.theory}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Queue length chart — fills remaining space */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...sep, padding: '8px 14px', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>Queue length over time</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: '8px 8px 8px 0' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={uiState.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--chart-axis)" tickFormatter={v => `${v}s`} tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis stroke="var(--chart-axis)" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }} />
                  <Line type="stepAfter" dataKey="queueLength" name="Queue length" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

      </div>

      {/* Right panel — Export tab */}
      {rightPanelElement && createPortal(
        <>
          <div className="panel-tabs">
            <button className="panel-tab" aria-selected={true}>Export</button>
          </div>
          <div className="panel-body">
            <div className="panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Exports use the current parameters with {DEFAULT_RUN_CONFIG.horizon}s horizon,{' '}
                {DEFAULT_RUN_CONFIG.warmup}s warm-up, seed {DEFAULT_RUN_CONFIG.seed},{' '}
                {DEFAULT_RUN_CONFIG.replications} replication(s).
              </p>
              <CodeExport model={exportModel} config={DEFAULT_RUN_CONFIG} />
              <SimmerCodeExport model={exportModel} config={DEFAULT_RUN_CONFIG} />
            </div>
          </div>
        </>,
        rightPanelElement,
      )}
    </div>
  );
}
