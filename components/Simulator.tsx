import FormalModel from './FormalModel';
import { MathFormula, MathText } from './Math';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { compileModel } from '../lib/compiler';
import { DEFAULT_RUN_CONFIG } from '../lib/engine';
import { Code2, Play, Pause, RotateCcw, Settings, BarChart3 } from 'lucide-react';
import { SimulationParams, Entity, ServerState, SimulationStats, NodeData } from '../types';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Node, Edge } from '@xyflow/react';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';

const TICK_RATE_MS = 50; // 20 ticks per second
const MAX_QUEUE_VISUAL = 20;

export default function Simulator({ headerActionsElement }: { headerActionsElement: HTMLDivElement | null }) {
  const [showExport, setShowExport] = useState(false);
  const exportPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showExport) exportPanelRef.current?.scrollIntoView({ block: 'start' });
  }, [showExport]);
  const [params, setParams] = useState<SimulationParams>({
    arrivalRate: 2.0, // arrivals per second
    serviceRate: 2.5, // services per second
    numServers: 1,
    simulationSpeed: 1,
  });

  const [isRunning, setIsRunning] = useState(false);
  
  // Expose state to UI
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

  // Mutable simulation engine state
  const engine = useRef({
    time: 0,
    queue: [] as Entity[],
    servers: Array.from({ length: params.numServers }, (_, i) => ({
      id: i,
      currentEntity: null,
      remainingServiceTime: 0,
    })) as ServerState[],
    stats: {
      totalArrivals: 0,
      totalDepartures: 0,
      totalWaitTime: 0,
      totalSystemTime: 0,
      serverBusyTime: 0,
      maxQueueLength: 0,
    } as SimulationStats,
    nextEntityId: 1,
    history: [] as any[],
    lastTickTime: 0,
  });

  // Handle parameter changes
  useEffect(() => {
    // Adjust servers if numServers changed
    if (engine.current.servers.length !== params.numServers) {
      const newServers = Array.from({ length: params.numServers }, (_, i) => {
        if (i < engine.current.servers.length) {
          return engine.current.servers[i];
        }
        return { id: i, currentEntity: null, remainingServiceTime: 0 };
      });
      engine.current.servers = newServers;
    }
  }, [params.numServers]);

  const resetSimulation = useCallback(() => {
    setIsRunning(false);
    engine.current = {
      time: 0,
      queue: [],
      servers: Array.from({ length: params.numServers }, (_, i) => ({
        id: i,
        currentEntity: null,
        remainingServiceTime: 0,
      })),
      stats: {
        totalArrivals: 0,
        totalDepartures: 0,
        totalWaitTime: 0,
        totalSystemTime: 0,
        serverBusyTime: 0,
        maxQueueLength: 0,
      },
      nextEntityId: 1,
      history: [],
      lastTickTime: performance.now(),
    };
    updateUi();
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

  // Main simulation loop
  useEffect(() => {
    if (!isRunning) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const tick = (currentTime: number) => {
      const deltaTimeMs = currentTime - lastTime;
      
      if (deltaTimeMs >= TICK_RATE_MS) {
        lastTime = currentTime;
        
        // Calculate simulation delta time based on speed
        const dt = (deltaTimeMs / 1000) * params.simulationSpeed;
        const state = engine.current;
        
        state.time += dt;

        // 1. Process Arrivals
        // Probability of arrival in dt = 1 - e^(-lambda * dt) approx lambda * dt
        const probArrival = params.arrivalRate * dt;
        if (Math.random() < probArrival) {
          state.queue.push({
            id: state.nextEntityId++,
            arrivalTime: state.time,
          });
          state.stats.totalArrivals++;
          state.stats.maxQueueLength = Math.max(state.stats.maxQueueLength, state.queue.length);
        }

        // 2. Process Servers
        let busyServers = 0;
        state.servers.forEach(server => {
          if (server.currentEntity) {
            // Server is busy
            server.remainingServiceTime -= dt;
            busyServers++;
            
            if (server.remainingServiceTime <= 0) {
              // Entity finished service
              const entity = server.currentEntity;
              entity.endServiceTime = state.time;
              
              const waitTime = entity.startServiceTime! - entity.arrivalTime;
              const systemTime = entity.endServiceTime - entity.arrivalTime;
              
              state.stats.totalDepartures++;
              state.stats.totalWaitTime += waitTime;
              state.stats.totalSystemTime += systemTime;
              
              server.currentEntity = null;
              server.remainingServiceTime = 0;
            }
          }

          // If server is idle and queue has entities, start service
          if (!server.currentEntity && state.queue.length > 0) {
            const nextEntity = state.queue.shift()!;
            nextEntity.startServiceTime = state.time;
            server.currentEntity = nextEntity;
            
            // Sample service time from exponential distribution
            // t = -ln(1 - U) / mu
            const u = Math.random();
            server.remainingServiceTime = -Math.log(1 - u) / params.serviceRate;
            busyServers++;
          }
        });

        // Update busy time stat
        state.stats.serverBusyTime += (busyServers / state.servers.length) * dt;

        // Record history every ~1 second of simulation time
        if (Math.floor(state.time) > Math.floor(state.time - dt)) {
          state.history.push({
            time: Math.floor(state.time),
            queueLength: state.queue.length,
            utilization: (state.stats.serverBusyTime / state.time) * 100,
          });
          // Keep last 60 points
          if (state.history.length > 60) state.history.shift();
        }

        updateUi();
      }
      
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, params]);

  // Derived metrics
  const avgWaitTime = uiState.stats.totalDepartures > 0 
    ? (uiState.stats.totalWaitTime / uiState.stats.totalDepartures).toFixed(2) 
    : '0.00';
  const avgSystemTime = uiState.stats.totalDepartures > 0 
    ? (uiState.stats.totalSystemTime / uiState.stats.totalDepartures).toFixed(2) 
    : '0.00';
  const utilization = uiState.time > 0 
    ? ((uiState.stats.serverBusyTime / uiState.time) * 100).toFixed(1) 
    : '0.0';

  // Theoretical M/M/c metrics
  const c = params.numServers;
  const lambda = params.arrivalRate;
  const mu = params.serviceRate;
  const rho = lambda / (c * mu);
  
  let theoreticalWaitTime = '∞';
  let theoreticalQueueLength = '∞';

  if (rho < 1) {
    if (c === 1) {
      // M/M/1 formulas
      theoreticalWaitTime = (rho / (mu - lambda)).toFixed(2);
      theoreticalQueueLength = (Math.pow(lambda / mu, 2) / (1 - rho)).toFixed(2);
    } else {
      // M/M/c formulas (Erlang C)
      let sum = 0;
      for (let n = 0; n < c; n++) {
        let factorial = 1;
        for (let i = 1; i <= n; i++) factorial *= i;
        sum += Math.pow(c * rho, n) / factorial;
      }
      
      let cFactorial = 1;
      for (let i = 1; i <= c; i++) cFactorial *= i;
      
      const p0 = 1 / (sum + (Math.pow(c * rho, c) / (cFactorial * (1 - rho))));
      const lq = (p0 * Math.pow(c * rho, c) * rho) / (cFactorial * Math.pow(1 - rho, 2));
      const wq = lq / lambda;
      
      theoreticalWaitTime = wq.toFixed(2);
      theoreticalQueueLength = lq.toFixed(2);
    }
  }

  const exportModel = useMemo(() => {
    const syntheticNodes: Node<NodeData>[] = [
      {
        id: '1',
        type: 'source',
        position: { x: 0, y: 0 },
        data: {
          label: 'Arrivals',
          type: 'source',
          distribution: { type: 'exponential', mean: 1 / params.arrivalRate },
        },
      },
      {
        id: '2',
        type: 'server',
        position: { x: 0, y: 0 },
        data: {
          label: 'Process',
          type: 'server',
          capacity: params.numServers,
          distribution: { type: 'exponential', mean: 1 / params.serviceRate },
        },
      },
      {
        id: '3',
        type: 'sink',
        position: { x: 0, y: 0 },
        data: {
          label: 'Departures',
          type: 'sink',
        },
      },
    ];

    const syntheticEdges: Edge[] = [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
    ];

    return compileModel(syntheticNodes, syntheticEdges, { name: 'MMC Visualizer', unit: 'second' });
  }, [params.arrivalRate, params.serviceRate, params.numServers]);

  const panelStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-sm)',
  };

  const sliderRow = (label: string, sub: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}><MathText>{label}</MathText></span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{value} {sub}</span>
    </div>
  );

  const isUnstable = rho >= 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {headerActionsElement && createPortal(
        <button onClick={() => setShowExport(s => !s)}
          className={`ui-btn${showExport ? ' ui-btn--primary' : ''}`}
          title="Toggle Python / R code export" aria-expanded={showExport}
          aria-controls={showExport ? 'visualizer-code-export' : undefined}>
          <Code2 size={16} /> {showExport ? 'Hide Export' : 'Export Code'}
        </button>, headerActionsElement,
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Parameters panel */}
        <div style={{ ...panelStyle, padding: '18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Settings size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Parameters</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              {sliderRow('Arrival rate (λ)', '/s', params.arrivalRate.toFixed(1))}
              <input type="range" min="0.1" max="10" step="0.1" value={params.arrivalRate}
                onChange={(e) => setParams({...params, arrivalRate: parseFloat(e.target.value)})}
                style={{ width: '100%', accentColor: 'var(--primary)' }} />
            </div>
            <div>
              {sliderRow('Service rate (μ)', '/s', params.serviceRate.toFixed(1))}
              <input type="range" min="0.1" max="10" step="0.1" value={params.serviceRate}
                onChange={(e) => setParams({...params, serviceRate: parseFloat(e.target.value)})}
                style={{ width: '100%', accentColor: 'var(--chart-3)' }} />
            </div>
            <div>
              {sliderRow('Servers (c)', '', String(params.numServers))}
              <input type="range" min="1" max="5" step="1" value={params.numServers}
                onChange={(e) => setParams({...params, numServers: parseInt(e.target.value)})}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
            <div>
              {sliderRow('Speed', '×', String(params.simulationSpeed))}
              <input type="range" min="0.5" max="10" step="0.5" value={params.simulationSpeed}
                onChange={(e) => setParams({...params, simulationSpeed: parseFloat(e.target.value)})}
                style={{ width: '100%', accentColor: 'var(--chart-2)' }} />
            </div>

            <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <button onClick={() => setIsRunning(!isRunning)} className="ui-btn"
                style={isRunning
                  ? { flex: 1, justifyContent: 'center', background: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)' }
                  : { flex: 1, justifyContent: 'center', background: 'var(--primary)', borderColor: 'var(--primary)', color: 'var(--text-on-primary)' }
                }>
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
                {isRunning ? 'Pause' : 'Run'}
              </button>
              <button onClick={resetSimulation} className="icon-btn" title="Reset">
                <RotateCcw size={15} />
              </button>
            </div>
          </div>

          {/* Stability indicator */}
          {isUnstable && (
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--warning)', lineHeight: 1.4 }}>
              <MathFormula tex={`\\rho = ${rho.toFixed(2)} \\geq 1`} />. No finite steady state under these assumptions — queue may grow without bound.
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Live visualizer */}
          <div style={{ ...panelStyle, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Live Simulation</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                t = {uiState.time.toFixed(1)} s
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24, overflowX: 'auto', padding: '16px 0' }}>
              {/* Queue */}
              <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, borderRight: '2px dashed var(--border)', paddingRight: 20, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -20, right: 20, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Queue ({uiState.queueLength})</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
                  {Array.from({ length: Math.min(uiState.queueLength, MAX_QUEUE_VISUAL) }).map((_, i) => (
                    <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', opacity: 0.8 }} />
                  ))}
                  {uiState.queueLength > MAX_QUEUE_VISUAL && (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                      +{uiState.queueLength - MAX_QUEUE_VISUAL}
                    </div>
                  )}
                  {uiState.queueLength === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic', height: 24, display: 'flex', alignItems: 'center' }}>Empty</div>
                  )}
                </div>
              </div>

              {/* Servers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {uiState.servers.map(server => (
                  <div key={server.id} style={{
                    width: 72, height: 72,
                    borderRadius: 'var(--radius)',
                    border: `2px solid ${server.currentEntity ? 'var(--success)' : 'var(--border)'}`,
                    background: server.currentEntity ? 'var(--success-soft)' : 'var(--bg-subtle)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 300ms, background 300ms',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {server.currentEntity ? (
                      <>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--success)', zIndex: 1 }} />
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, height: 3,
                          background: 'var(--success)',
                          width: `${Math.max(0, 100 - (server.remainingServiceTime * params.serviceRate * 100))}%`,
                          transition: 'width 100ms',
                        }} />
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Idle</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Departures */}
              <div style={{ paddingLeft: 20, borderLeft: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Completed</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{uiState.stats.totalDepartures}</div>
              </div>
            </div>
          </div>

          {/* KPI tiles */}
          <div style={{ ...panelStyle, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <BarChart3 size={15} style={{ color: 'var(--chart-3)' }} />
              <span style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Performance Metrics</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
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

          {/* Queue chart */}
          <div style={{ ...panelStyle, padding: '18px 20px', height: 340, display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>Queue length over time</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Waiting entities (time-stepped)</div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={uiState.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--chart-axis)" tickFormatter={(v) => `${v}s`} tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis stroke="var(--chart-axis)" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, fontSize: 12 }} />
                  <Line type="stepAfter" dataKey="queueLength" name="Queue length" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>

      <FormalModel model={exportModel} />

      {/* Code exports */}
      {showExport && <div id="visualizer-code-export" ref={exportPanelRef} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Export the current arrival rate, service rate and server count. Scripts run for {DEFAULT_RUN_CONFIG.horizon} seconds
          with {DEFAULT_RUN_CONFIG.warmup} seconds of warm-up, seed {DEFAULT_RUN_CONFIG.seed}, and {DEFAULT_RUN_CONFIG.replications} replication(s).
          Playback speed does not affect the exported model; scripts generate a new random trace.
        </p>
        <CodeExport model={exportModel} config={DEFAULT_RUN_CONFIG} />
        <SimmerCodeExport model={exportModel} config={DEFAULT_RUN_CONFIG} />
      </div>}
    </div>
  );
}
