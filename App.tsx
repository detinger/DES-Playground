
import React, { useState } from 'react';
import Simulator from './components/Simulator';
import Editor from './components/Editor';
import Theory from './components/Theory';
import { Activity, LayoutDashboard, Share2, BookOpen } from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<'theory' | 'playground' | 'editor'>('theory');
  
  // Shared state for the node editor so it persists across tab changes
  const [nodes, setNodes] = useState<Node<NodeData>[]>([
    {
      id: '1',
      type: 'source',
      position: { x: 100, y: 150 },
      data: {
        label: 'Arrivals',
        type: 'source',
        distribution: { type: 'exponential', mean: 5 },
      },
    },
    {
      id: '2',
      type: 'server',
      position: { x: 400, y: 150 },
      data: {
        label: 'Process 1',
        type: 'server',
        capacity: 1,
        distribution: { type: 'exponential', mean: 4 },
      },
    },
    {
      id: '3',
      type: 'sink',
      position: { x: 700, y: 150 },
      data: {
        label: 'Departures',
        type: 'sink',
      },
    },
  ]);
  
  const [edges, setEdges] = useState<Edge[]>([
    { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
    { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } },
  ]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans selection:bg-indigo-500/30">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
              <Activity className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                DES Playground
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                Interactive Discrete Event Simulation & Queueing Theory
              </p>
            </div>
          </div>
          
          <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
            <button
              onClick={() => setActiveTab('theory')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'theory' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            >
              <BookOpen className="w-4 h-4" />
              Theory
            </button>
            <button
              onClick={() => setActiveTab('playground')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'playground' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              M/M/c Visualizer
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'editor' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
            >
              <Share2 className="w-4 h-4" />
              Model Explorer
            </button>
          </div>
        </header>

        <main>
          {activeTab === 'playground' && <Simulator />}
          {activeTab === 'editor' && <Editor nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} />}
          {activeTab === 'theory' && <Theory />}
        </main>
        
        <footer className="text-center mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm">
          <p>Learn Queueing Theory visually. Build models and export them to SimPy.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
