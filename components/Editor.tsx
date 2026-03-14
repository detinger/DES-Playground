import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SourceNode, ServerNode, SinkNode } from './nodes/CustomNodes';
import { NodeData, DistributionType, DistributionParams } from '../types';
import { PlayCircle, Server, LogOut, Settings, Play, Pause, RotateCcw, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';
import CodeExport from './CodeExport';
import SimmerCodeExport from './SimmerCodeExport';

const nodeTypes = {
  source: SourceNode,
  server: ServerNode,
  sink: SinkNode,
};

let id = 4;
const getId = () => `${id++}`;

const TICK_RATE_MS = 50;

const sampleDistribution = (dist: DistributionParams) => {
  const u = Math.random();
  switch (dist.type) {
    case 'exponential':
      return -Math.log(1 - u) / (1 / (dist.mean || 1));
    case 'normal':
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      return Math.max(0, (dist.mean || 0) + z0 * (dist.stdDev || 1));
    case 'uniform':
      return (dist.min || 0) + u * ((dist.max || 1) - (dist.min || 0));
    case 'constant':
      return dist.value || 1;
    case 'triangular':
      const a = dist.min || 0;
      const b = dist.max || 2;
      const c = dist.mode || 1;
      const F = (c - a) / (b - a);
      if (u < F) {
        return a + Math.sqrt(u * (b - a) * (c - a));
      } else {
        return b - Math.sqrt((1 - u) * (b - a) * (b - c));
      }
    default:
      return 1;
  }
};

export default function Editor({ nodes, setNodes, edges, setEdges }: any) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);

  // Simulation State
  const [isRunning, setIsRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  
  const [uiState, setUiState] = useState({
    time: 0,
    nodeStates: {} as Record<string, any>,
    stats: {
      totalArrivals: 0,
      totalDepartures: 0,
      totalWaitTime: 0,
      totalSystemTime: 0,
      maxQueueLength: 0,
    },
    history: [] as any[],
  });

  const engine = useRef({
    time: 0,
    nextEntityId: 1,
    nodeStates: {} as Record<string, any>,
    stats: {
      totalArrivals: 0,
      totalDepartures: 0,
      totalWaitTime: 0,
      totalSystemTime: 0,
      maxQueueLength: 0,
    },
    history: [] as any[],
  });

  const resetSimulation = useCallback(() => {
    setIsRunning(false);
    engine.current = {
      time: 0,
      nextEntityId: 1,
      nodeStates: {},
      stats: {
        totalArrivals: 0,
        totalDepartures: 0,
        totalWaitTime: 0,
        totalSystemTime: 0,
        maxQueueLength: 0,
      },
      history: [],
    };
    
    // Clear simState from all nodes
    setNodes((nds: Node[]) => nds.map(n => ({
      ...n,
      data: { ...n.data, simState: undefined }
    })));
    
    setUiState({
      time: 0,
      nodeStates: {},
      stats: { ...engine.current.stats },
      history: [],
    });
  }, [setNodes]);

  // Main simulation loop
  useEffect(() => {
    if (!isRunning) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const tick = (currentTime: number) => {
      const deltaTimeMs = currentTime - lastTime;
      
      if (deltaTimeMs >= TICK_RATE_MS) {
        lastTime = currentTime;
        
        const dt = (deltaTimeMs / 1000) * simulationSpeed;
        const state = engine.current;
        state.time += dt;

        // Initialize node states if needed
        nodes.forEach((node: Node<NodeData>) => {
          if (!state.nodeStates[node.id]) {
            state.nodeStates[node.id] = {
              queue: [],
              servers: Array.from({ length: node.data.capacity || 1 }, () => ({ entity: null, remainingTime: 0 })),
              nextArrival: node.data.type === 'source' ? sampleDistribution(node.data.distribution!) : undefined,
              generated: 0,
              completed: 0,
            };
          }
        });

        // Process nodes
        let totalQueueLength = 0;
        
        nodes.forEach((node: Node<NodeData>) => {
          const nodeState = state.nodeStates[node.id];
          if (!nodeState) return;

          // Process Source
          if (node.data.type === 'source') {
            if (state.time >= nodeState.nextArrival) {
              // Generate entity
              const newEntity = {
                id: state.nextEntityId++,
                arrivalTime: state.time,
                currentNodeId: node.id,
              };
              nodeState.generated++;
              state.stats.totalArrivals++;
              
              // Find outgoing edges
              const outgoingEdges = edges.filter((e: Edge) => e.source === node.id);
              if (outgoingEdges.length > 0) {
                // Simple random routing
                const targetEdge = outgoingEdges[Math.floor(Math.random() * outgoingEdges.length)];
                const targetNodeState = state.nodeStates[targetEdge.target];
                if (targetNodeState) {
                  targetNodeState.queue.push(newEntity);
                }
              }
              
              // Schedule next arrival
              nodeState.nextArrival = state.time + sampleDistribution(node.data.distribution!);
            }
          }

          // Process Server
          if (node.data.type === 'server') {
            totalQueueLength += nodeState.queue.length;
            state.stats.maxQueueLength = Math.max(state.stats.maxQueueLength, totalQueueLength);

            nodeState.servers.forEach((server: any) => {
              if (server.entity) {
                server.remainingTime -= dt;
                if (server.remainingTime <= 0) {
                  // Service finished
                  const entity = server.entity;
                  entity.endServiceTime = state.time;
                  
                  // Find outgoing edges
                  const outgoingEdges = edges.filter((e: Edge) => e.source === node.id);
                  if (outgoingEdges.length > 0) {
                    const targetEdge = outgoingEdges[Math.floor(Math.random() * outgoingEdges.length)];
                    const targetNodeState = state.nodeStates[targetEdge.target];
                    if (targetNodeState) {
                      targetNodeState.queue.push(entity);
                    }
                  }
                  
                  server.entity = null;
                  server.remainingTime = 0;
                }
              }

              // Start new service if idle and queue has entities
              if (!server.entity && nodeState.queue.length > 0) {
                const nextEntity = nodeState.queue.shift()!;
                nextEntity.startServiceTime = state.time;
                server.entity = nextEntity;
                server.remainingTime = sampleDistribution(node.data.distribution!);
              }
            });
          }

          // Process Sink
          if (node.data.type === 'sink') {
            while (nodeState.queue.length > 0) {
              const entity = nodeState.queue.shift()!;
              nodeState.completed++;
              state.stats.totalDepartures++;
              
              if (entity.startServiceTime) {
                state.stats.totalWaitTime += (entity.startServiceTime - entity.arrivalTime);
              }
              state.stats.totalSystemTime += (state.time - entity.arrivalTime);
            }
          }
        });

        // Record history
        if (Math.floor(state.time) > Math.floor(state.time - dt)) {
          state.history.push({
            time: Math.floor(state.time),
            queueLength: totalQueueLength,
          });
          if (state.history.length > 60) state.history.shift();
        }

        // Update UI
        setUiState({
          time: state.time,
          nodeStates: JSON.parse(JSON.stringify(state.nodeStates)),
          stats: { ...state.stats },
          history: [...state.history],
        });

        // Update Node Data for visualization
        setNodes((nds: Node[]) => nds.map(n => {
          const ns = state.nodeStates[n.id];
          if (!ns) return n;
          
          let simState: any = {};
          if (n.data.type === 'source') {
            simState = { generated: ns.generated };
          } else if (n.data.type === 'server') {
            simState = {
              queueLength: ns.queue.length,
              busyServers: ns.servers.filter((s: any) => s.entity !== null).length,
            };
          } else if (n.data.type === 'sink') {
            simState = { completed: ns.completed };
          }
          
          return {
            ...n,
            data: { ...n.data, simState }
          };
        }));
      }
      
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, simulationSpeed, nodes, edges, setNodes]);

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

  const avgWaitTime = uiState.stats.totalDepartures > 0 
    ? (uiState.stats.totalWaitTime / uiState.stats.totalDepartures).toFixed(2) 
    : '0.00';
  const avgSystemTime = uiState.stats.totalDepartures > 0 
    ? (uiState.stats.totalSystemTime / uiState.stats.totalDepartures).toFixed(2) 
    : '0.00';

  return (
    <div className="flex flex-col gap-6">
      {/* Editor Controls */}
      <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">Speed:</span>
            <input 
              type="range" 
              min="0.5" max="10" step="0.5" 
              value={simulationSpeed}
              onChange={(e) => setSimulationSpeed(parseFloat(e.target.value))}
              className="w-24 accent-purple-500"
            />
            <span className="text-sm text-purple-400 w-8">{simulationSpeed}x</span>
          </div>
          <div className="text-sm font-mono text-gray-400 border-l border-gray-700 pl-4">
            Time: {uiState.time.toFixed(1)}s
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-6 rounded-lg font-medium transition-colors",
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

      {/* Editor Area */}
      <div className="flex h-[600px] border border-gray-700 rounded-xl overflow-hidden bg-gray-900">
        {/* Sidebar - Node Palette */}
        <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-4">
        <h3 className="text-lg font-bold text-gray-200 mb-2">Components</h3>
        
        <div 
          className="p-3 bg-gray-700 border border-gray-600 rounded-lg cursor-grab hover:bg-gray-600 flex items-center gap-3"
          onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', 'source'); e.dataTransfer.effectAllowed = 'move'; }}
          draggable
        >
          <PlayCircle className="w-5 h-5 text-emerald-400" />
          <span className="font-medium">Source</span>
        </div>
        
        <div 
          className="p-3 bg-gray-700 border border-gray-600 rounded-lg cursor-grab hover:bg-gray-600 flex items-center gap-3"
          onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', 'server'); e.dataTransfer.effectAllowed = 'move'; }}
          draggable
        >
          <Server className="w-5 h-5 text-amber-400" />
          <span className="font-medium">Server (Process)</span>
        </div>

        <div 
          className="p-3 bg-gray-700 border border-gray-600 rounded-lg cursor-grab hover:bg-gray-600 flex items-center gap-3"
          onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', 'sink'); e.dataTransfer.effectAllowed = 'move'; }}
          draggable
        >
          <LogOut className="w-5 h-5 text-red-400" />
          <span className="font-medium">Sink</span>
        </div>
        
        <div className="mt-auto text-xs text-gray-500 p-2 bg-gray-900/50 rounded">
          Drag and drop nodes onto the canvas. Connect them by dragging between handles.
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
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
          className="bg-gray-900"
        >
          <Background color="#374151" gap={16} />
          <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
        </ReactFlow>
      </div>

      {/* Properties Panel */}
      {selectedNode && (
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-700">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-gray-200">Properties</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={selectedNode.data.label}
                onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {selectedNode.data.type === 'server' && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Capacity (Servers)</label>
                <input
                  type="number"
                  min="1"
                  value={selectedNode.data.capacity || 1}
                  onChange={(e) => updateNodeData(selectedNode.id, { capacity: parseInt(e.target.value) || 1 })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {(selectedNode.data.type === 'source' || selectedNode.data.type === 'server') && selectedNode.data.distribution && (
              <div className="pt-4 border-t border-gray-700">
                <h4 className="font-medium text-gray-300 mb-3">
                  {selectedNode.data.type === 'source' ? 'Inter-Arrival Time' : 'Service Time'}
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Distribution</label>
                    <select
                      value={selectedNode.data.distribution.type}
                      onChange={(e) => updateDistribution(selectedNode.id, { type: e.target.value as DistributionType })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
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
                      <label className="block text-sm font-medium text-gray-400 mb-1">Mean</label>
                      <input
                        type="number"
                        step="0.1"
                        value={selectedNode.data.distribution.mean || 1}
                        onChange={(e) => updateDistribution(selectedNode.id, { mean: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {selectedNode.data.distribution.type === 'normal' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mean</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.mean || 1}
                          onChange={(e) => updateDistribution(selectedNode.id, { mean: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Standard Deviation</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.stdDev || 0.5}
                          onChange={(e) => updateDistribution(selectedNode.id, { stdDev: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.data.distribution.type === 'uniform' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Min</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.min || 0}
                          onChange={(e) => updateDistribution(selectedNode.id, { min: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Max</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.max || 10}
                          onChange={(e) => updateDistribution(selectedNode.id, { max: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.data.distribution.type === 'triangular' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Min</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.min || 0}
                          onChange={(e) => updateDistribution(selectedNode.id, { min: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mode</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.mode || 5}
                          onChange={(e) => updateDistribution(selectedNode.id, { mode: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Max</label>
                        <input
                          type="number"
                          step="0.1"
                          value={selectedNode.data.distribution.max || 10}
                          onChange={(e) => updateDistribution(selectedNode.id, { max: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.data.distribution.type === 'constant' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Value</label>
                      <input
                        type="number"
                        step="0.1"
                        value={selectedNode.data.distribution.value || 5}
                        onChange={(e) => updateDistribution(selectedNode.id, { value: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="pt-6">
               <button 
                onClick={() => {
                  setNodes((nds: Node[]) => nds.filter(n => n.id !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="w-full py-2 px-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
               >
                 Delete Node
               </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Live Simulation Visualizer */}
      <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Live Simulation</h2>
          <div className="text-sm font-mono text-gray-400">
            Time: {uiState.time.toFixed(1)}s
          </div>
        </div>
        
        <div className="flex flex-col gap-8 py-4 px-4 overflow-x-auto">
          {nodes.filter((n: Node<NodeData>) => n.data.type === 'server').map((node: Node<NodeData>) => {
            const nodeState = uiState.nodeStates[node.id];
            if (!nodeState) return null;
            
            return (
              <div key={node.id} className="flex items-center gap-8 pb-8 border-b border-gray-700 last:border-0 last:pb-0">
                <div className="w-32 text-right shrink-0">
                  <div className="font-bold text-gray-200 truncate" title={node.data.label}>{node.data.label}</div>
                  <div className="text-xs text-gray-500">Capacity: {node.data.capacity}</div>
                </div>
                
                {/* Queue Area */}
                <div className="flex-1 min-w-[200px] flex flex-col items-end gap-2 border-r-2 border-dashed border-gray-600 pr-8 relative">
                  <div className="absolute top-[-20px] right-8 text-xs text-gray-400 font-medium">Queue ({nodeState.queue.length})</div>
                  <div className="flex gap-2 flex-wrap-reverse justify-end w-full">
                    {Array.from({ length: Math.min(nodeState.queue.length, 20) }).map((_, i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] animate-pulse" />
                    ))}
                    {nodeState.queue.length > 20 && (
                      <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300">
                        +{nodeState.queue.length - 20}
                      </div>
                    )}
                    {nodeState.queue.length === 0 && (
                      <div className="text-gray-500 italic h-6 flex items-center text-sm">Empty</div>
                    )}
                  </div>
                </div>

                {/* Servers Area */}
                <div className="flex gap-4 flex-wrap max-w-[400px] relative pt-4">
                  <div className="absolute top-[-10px] left-0 text-xs text-gray-400 font-medium">Servers</div>
                  {nodeState.servers.map((server: any, idx: number) => (
                    <div 
                      key={idx} 
                      className={cn(
                        "w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden",
                        server.entity 
                          ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                          : "border-gray-600 bg-gray-700/50"
                      )}
                    >
                      {server.entity ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] z-10" />
                      ) : (
                        <span className="text-gray-500 text-xs font-medium">Idle</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          
          {nodes.filter((n: Node<NodeData>) => n.data.type === 'server').length === 0 && (
            <div className="text-center text-gray-500 italic py-8">
              Add a Server node to see the live simulation.
            </div>
          )}
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="flex flex-col gap-6">
        {/* Stats Cards */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Global Performance Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Avg Wait Time (Wq)</div>
              <div className="text-2xl font-bold text-indigo-400">{avgWaitTime}s</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Avg System Time (W)</div>
              <div className="text-2xl font-bold text-purple-400">{avgSystemTime}s</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Total Departures</div>
              <div className="text-2xl font-bold text-emerald-400">{uiState.stats.totalDepartures}</div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
              <div className="text-sm text-gray-400 mb-1">Max Total Queue</div>
              <div className="text-2xl font-bold text-amber-400">{uiState.stats.maxQueueLength}</div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 h-[400px] flex flex-col">
          <h3 className="text-lg font-bold mb-4">Total Queue Length Over Time</h3>
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
                  name="Total Queue Length"
                  stroke="#818CF8" 
                  strokeWidth={2} 
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Code Export Section */}
        <div className="mt-8 space-y-8">
          <CodeExport nodes={nodes} edges={edges} />
          <SimmerCodeExport nodes={nodes} edges={edges} />
        </div>
      </div>
    </div>
  );
}
