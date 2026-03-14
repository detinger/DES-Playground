import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Play } from 'lucide-react';
import { generateSimmerCode } from '../lib/simmerGenerator';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../types';

interface SimmerCodeExportProps {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export default function SimmerCodeExport({ nodes, edges }: SimmerCodeExportProps) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setCode(generateSimmerCode(nodes, edges));
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-gray-200">R Simmer Code Export</h2>
            <p className="text-sm text-gray-400 mt-1">Generate R simulation code from your visual model.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleGenerate}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg transition-colors font-medium text-sm"
            >
              <Play className="w-4 h-4" />
              Generate from Model
            </button>
            <button 
              onClick={handleCopy}
              disabled={!code}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                code 
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>
        
        <div className="p-4 bg-[#1e1e1e] overflow-x-auto min-h-[300px]">
          {code ? (
            <SyntaxHighlighter 
              language="r" 
              style={vscDarkPlus}
              customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
              showLineNumbers
            >
              {code}
            </SyntaxHighlighter>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 italic">
              Click "Generate from Model" to create the R simmer script.
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h3 className="text-lg font-bold text-gray-200 mb-4">How to run locally or in RStudio</h3>
        <ol className="list-decimal list-inside space-y-3 text-gray-300">
          <li>Ensure you have R installed on your system or use RStudio.</li>
          <li>Install the required packages by running: <code className="bg-gray-900 px-2 py-1 rounded text-emerald-400">install.packages(c("simmer", "simmer.plot"))</code></li>
          <li><strong>Copy</strong> the generated code from this page.</li>
          <li><strong>Paste</strong> it into a new R script (e.g., <code className="bg-gray-900 px-2 py-1 rounded text-emerald-400">simulation.R</code>).</li>
          <li>Run the script! You will see the simulation output and plots in your R environment.</li>
        </ol>
      </div>
    </div>
  );
}
