import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { PlayCircle, Server, LogOut, Users, Activity } from 'lucide-react';
import { NodeData } from '../../types';

const nodeBase: React.CSSProperties = {
  background: 'var(--des-fill)',
  color: 'var(--des-label)',
  border: '1.5px solid var(--des-stroke)',
  borderRadius: 'var(--radius-sm)',
  minWidth: 150,
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  padding: '8px 12px',
  boxShadow: 'var(--shadow-sm)',
};

const selectedStyle: React.CSSProperties = {
  borderColor: 'var(--primary)',
  boxShadow: 'var(--focus-ring)',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  marginTop: 6,
  paddingTop: 6,
};

const metaRow: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

export function SourceNode({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div style={{ ...nodeBase, ...(selected ? selectedStyle : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <PlayCircle size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 13 }}>{data.label}</span>
      </div>
      <div style={metaRow}>
        {data.distribution?.type ?? 'exponential'} arrivals
      </div>
      {data.simState && (
        <div style={{ ...dividerStyle, ...metaRow, color: 'var(--success)' }}>
          <Activity size={11} />
          Generated: {data.simState.generated}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: 'var(--primary)', border: '2px solid var(--bg-elevated)' }}
      />
    </div>
  );
}

export function ServerNode({ data, selected }: NodeProps<Node<NodeData>>) {
  const busy = data.simState?.busyServers ?? 0;
  const capacity = data.capacity ?? 1;
  const queueLen = data.simState?.queueLength ?? 0;

  return (
    <div style={{ ...nodeBase, ...(selected ? selectedStyle : {}) }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, background: 'var(--primary)', border: '2px solid var(--bg-elevated)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Server size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 13 }}>{data.label}</span>
      </div>
      <div style={metaRow}>
        {data.distribution?.type ?? 'exponential'} · cap {capacity}
      </div>
      {data.simState && (
        <div style={dividerStyle}>
          <div style={{ ...metaRow, color: 'var(--primary)', marginBottom: 3 }}>
            <Users size={11} />
            Queue: {queueLen}
            &nbsp;&nbsp;
            <Activity size={11} style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--accent)' }}>Busy: {busy}/{capacity}</span>
          </div>
          {queueLen > 0 && (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 120, marginTop: 4 }}>
              {Array.from({ length: Math.min(queueLen, 5) }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    opacity: 0.85,
                  }}
                />
              ))}
              {queueLen > 5 && (
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>+{queueLen - 5}</span>
              )}
            </div>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: 'var(--primary)', border: '2px solid var(--bg-elevated)' }}
      />
    </div>
  );
}

export function SinkNode({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div style={{ ...nodeBase, ...(selected ? selectedStyle : {}) }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, background: 'var(--primary)', border: '2px solid var(--bg-elevated)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <LogOut size={15} style={{ color: 'var(--error)', flexShrink: 0 }} />
        <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 13 }}>{data.label}</span>
      </div>
      <div style={metaRow}>Departures</div>
      {data.simState && (
        <div style={{ ...dividerStyle, ...metaRow, color: 'var(--chart-2)' }}>
          <Activity size={11} />
          Completed: {data.simState.completed}
        </div>
      )}
    </div>
  );
}
