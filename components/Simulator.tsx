import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Settings, BarChart3 } from 'lucide-react';
import { SimulationParams, Entity, ServerState, SimulationStats, NodeData } from '../types';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Node, Edge } from '@xyflow/react';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';

const TICK_RATE_MS = 50; // 20 ticks per second
const MAX_QUEUE_VISUAL = 20;

export default function Simulator() {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Controls Sidebar */}
      <div className="lg:col-span-1 bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          Parameters
        </h2>
        
        <div className="space-y-6">
          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              <span>Arrival Rate (λ)</span>
              <span className="text-indigo-400">{params.arrivalRate.toFixed(1)} /s</span>
            </label>
            <input 
              type="range" 
              min="0.1" max="10" step="0.1" 
              value={params.arrivalRate}
              onChange={(e) => setParams({...params, arrivalRate: parseFloat(e.target.value)})}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              <span>Service Rate (μ)</span>
              <span className="text-emerald-400">{params.serviceRate.toFixed(1)} /s</span>
            </label>
            <input 
              type="range" 
              min="0.1" max="10" step="0.1" 
              value={params.serviceRate}
              onChange={(e) => setParams({...params, serviceRate: parseFloat(e.target.value)})}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              <span>Servers (c)</span>
              <span className="text-amber-400">{params.numServers}</span>
            </label>
            <input 
              type="range" 
              min="1" max="5" step="1" 
              value={params.numServers}
              onChange={(e) => setParams({...params, numServers: parseInt(e.target.value)})}
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              <span>Simulation Speed</span>
              <span className="text-purple-400">{params.simulationSpeed}x</span>
            </label>
            <input 
              type="range" 
              min="0.5" max="10" step="0.5" 
              value={params.simulationSpeed}
              onChange={(e) => setParams({...params, simulationSpeed: parseFloat(e.target.value)})}
              className="w-full accent-purple-500"
            />
          </div>

          <div className="pt-4 border-t border-gray-700 flex gap-3">
            <button 
              onClick={() => setIsRunning(!isRunning)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors",
                isRunning ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              )}
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button 
              onClick={resetSimulation}
              className="p-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors"
              title="Reset Simulation"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Visualization & Metrics */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Visualizer */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Live Simulation</h2>
            <div className="text-sm font-mono text-gray-400">
              Time: {uiState.time.toFixed(1)}s
            </div>
          </div>
          
          <div className="flex items-center gap-8 py-8 px-4 overflow-x-auto">
            {/* Queue Area */}
            <div className="flex-1 min-w-[300px] flex flex-col items-end gap-2 border-r-2 border-dashed border-gray-600 pr-8 relative">
              <div className="absolute top-[-30px] right-8 text-sm text-gray-400 font-medium">Queue ({uiState.queueLength})</div>
              <div className="flex gap-2 flex-wrap-reverse justify-end w-full">
                {Array.from({ length: Math.min(uiState.queueLength, MAX_QUEUE_VISUAL) }).map((_, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse" />
                ))}
                {uiState.queueLength > MAX_QUEUE_VISUAL && (
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
                    +{uiState.queueLength - MAX_QUEUE_VISUAL}
                  </div>
                )}
                {uiState.queueLength === 0 && (
                  <div className="text-gray-500 italic h-8 flex items-center">Empty</div>
                )}
              </div>
            </div>

            {/* Servers Area */}
            <div className="flex flex-col gap-4">
              <div className="absolute top-[-30px] text-sm text-gray-400 font-medium">Servers</div>
              {uiState.servers.map(server => (
                <div 
                  key={server.id} 
                  className={cn(
                    "w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden",
                    server.currentEntity 
                      ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                      : "border-gray-600 bg-gray-700/50"
                  )}
                >
                  {server.currentEntity ? (
                    <>
                      <div className="w-8 h-8 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] z-10" />
                      {/* Progress bar background */}
                      <div 
                        className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-100"
                        style={{ width: `${Math.max(0, 100 - (server.remainingServiceTime * params.serviceRate * 100))}%` }}
                      />
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm font-medium">Idle</span>
                  )}
                </div>
              ))}
            </div>

            {/* Departures Area */}
            <div className="pl-8 border-l-2 border-dashed border-gray-600 flex flex-col items-center justify-center min-w-[120px]">
              <div className="text-sm text-gray-400 font-medium mb-2">Completed</div>
              <div className="text-3xl font-bold text-gray-200">{uiState.stats.totalDepartures}</div>
            </div>
          </div>
        </div>

        {/* Metrics Dashboard */}
        <div className="flex flex-col gap-6">
          {/* Stats Cards */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              Performance Metrics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-sm text-gray-400 mb-1">Avg Wait Time (Wq)</div>
                <div className="text-2xl font-bold text-indigo-400">{avgWaitTime}s</div>
                <div className="text-xs text-gray-500 mt-1">Theory: {theoreticalWaitTime}s</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-sm text-gray-400 mb-1">Avg System Time (W)</div>
                <div className="text-2xl font-bold text-purple-400">{avgSystemTime}s</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-sm text-gray-400 mb-1">Utilization (ρ)</div>
                <div className="text-2xl font-bold text-emerald-400">{utilization}%</div>
                <div className="text-xs text-gray-500 mt-1">Theory: {(rho * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="text-sm text-gray-400 mb-1">Max Queue Length</div>
                <div className="text-2xl font-bold text-amber-400">{uiState.stats.maxQueueLength}</div>
                <div className="text-xs text-gray-500 mt-1">Avg Theory: {theoreticalQueueLength}</div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 h-[400px] flex flex-col">
            <h3 className="text-lg font-bold mb-4">Queue Length Over Time</h3>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={uiState.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#9CA3AF" 
                  tickFormatter={(val) => `${val}s`}
                  minTickGap={20}
                />
                <YAxis stroke="#9CA3AF" allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                  itemStyle={{ color: '#818CF8' }}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="queueLength" 
                  name="Queue Length"
                  stroke="#818CF8" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
      </div>

      {/* Code Export Section */}
      <div className="mt-8 space-y-8">
        <CodeExport nodes={syntheticNodes} edges={syntheticEdges} />
        <SimmerCodeExport nodes={syntheticNodes} edges={syntheticEdges} />
      </div>
    </div>
  );
}
