import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { PlayCircle, Server, LogOut, Users, Activity } from 'lucide-react';
import { NodeData } from '../types';

export function SourceNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-gray-800 border-2 ${selected ? 'border-indigo-500' : 'border-gray-600'} min-w-[150px]`}>
      <div className="flex items-center gap-2 mb-2">
        <PlayCircle className="w-5 h-5 text-emerald-400" />
        <div className="font-bold text-gray-200">{data.label}</div>
      </div>
      <div className="text-xs text-gray-400">
        Arrivals: {data.distribution?.type}
      </div>
      {data.simState && (
        <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-emerald-400 flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Generated: {data.simState.generated}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
}

export function ServerNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-gray-800 border-2 ${selected ? 'border-indigo-500' : 'border-gray-600'} min-w-[150px]`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500" />
      <div className="flex items-center gap-2 mb-2">
        <Server className="w-5 h-5 text-amber-400" />
        <div className="font-bold text-gray-200">{data.label}</div>
      </div>
      <div className="text-xs text-gray-400">
        Service: {data.distribution?.type}
      </div>
      <div className="text-xs text-gray-400">
        Capacity: {data.capacity}
      </div>
      {data.simState && (
        <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
          <div className="text-xs text-indigo-400 flex items-center gap-1">
            <Users className="w-3 h-3" />
            Queue: {data.simState.queueLength}
          </div>
          <div className="text-xs text-amber-400 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Busy: {data.simState.busyServers} / {data.capacity}
          </div>
          {/* Visual queue dots */}
          {data.simState.queueLength > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap max-w-[120px]">
              {Array.from({ length: Math.min(data.simState.queueLength, 5) }).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              ))}
              {data.simState.queueLength > 5 && (
                <span className="text-[10px] text-gray-500">+{data.simState.queueLength - 5}</span>
              )}
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500" />
    </div>
  );
}

export function SinkNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-gray-800 border-2 ${selected ? 'border-indigo-500' : 'border-gray-600'} min-w-[150px]`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500" />
      <div className="flex items-center gap-2 mb-2">
        <LogOut className="w-5 h-5 text-red-400" />
        <div className="font-bold text-gray-200">{data.label}</div>
      </div>
      <div className="text-xs text-gray-400">
        Departures
      </div>
      {data.simState && (
        <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-red-400 flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Completed: {data.simState.completed}
        </div>
      )}
    </div>
  );
}
