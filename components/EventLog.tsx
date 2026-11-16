import React, { useRef, useEffect } from 'react';
import { TraceEvent, EventKind } from '../lib/engine';

interface EventLogProps {
  trace: TraceEvent[];
  playbackIndex: number;
  nodeNames: Record<string, string>;
}

const KIND_META: Record<EventKind, { label: string; colorVar: string; bgVar: string }> = {
  ...Object.fromEntries(['initial','decision','signal','stockChange','horizon','assign','batch','unbatch','join','shift'].map(k=>[k,{label:k,colorVar:'var(--text-muted)',bgVar:'var(--bg-subtle)'}])) as Record<'initial'|'decision'|'signal'|'stockChange'|'horizon'|'assign'|'batch'|'unbatch'|'join'|'shift', {label:string;colorVar:string;bgVar:string}>,
  arrival:      { label: 'Arrival',       colorVar: 'var(--success)',   bgVar: 'var(--success-soft)' },
  queueEnter:   { label: 'Queue Enter',   colorVar: 'var(--warning)',   bgVar: 'var(--warning-soft)' },
  serviceStart: { label: 'Service Start', colorVar: 'var(--primary)',   bgVar: 'var(--primary-soft)' },
  serviceEnd:   { label: 'Service End',   colorVar: 'var(--accent)',    bgVar: 'var(--bg-subtle)' },
  departure:    { label: 'Departure',     colorVar: 'var(--text-muted)', bgVar: 'var(--bg-subtle)' },
};

const WINDOW = 80; // number of events to show (40 before, 40 after current)

export default function EventLog({ trace, playbackIndex, nodeNames }: EventLogProps) {
  const currentRowRef = useRef<HTMLTableRowElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  // Follow playback inside the log only. scrollIntoView also scrolls the page.
  useEffect(() => {
    const container = containerRef.current;
    const row = currentRowRef.current;
    if (!container || !row) return;

    const viewport = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const visibleTop = viewport.top + container.clientTop + headerHeight;
    const visibleBottom = viewport.top + container.clientTop + container.clientHeight;

    if (rowBounds.top < visibleTop) {
      container.scrollTop += rowBounds.top - visibleTop;
    } else if (rowBounds.bottom > visibleBottom) {
      container.scrollTop += rowBounds.bottom - visibleBottom;
    }
  }, [playbackIndex, trace]);

  if (!trace.length) {
    return (
      <div style={{
        textAlign: 'center', color: 'var(--text-subtle)', fontStyle: 'italic',
        padding: '24px 0', fontSize: 13,
      }}>
        Run the simulation to see the event log.
      </div>
    );
  }

  // Window: show events around current index
  const half  = Math.floor(WINDOW / 2);
  const start = Math.max(0, playbackIndex - half);
  const end   = Math.min(trace.length - 1, start + WINDOW - 1);
  const slice = trace.slice(start, end + 1);

  const thStyle: React.CSSProperties = {
    padding: '7px 10px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 650,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--text-subtle)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    background: 'var(--bg-subtle)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>Event Log</span>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
          {playbackIndex + 1} / {trace.length} events
        </span>
      </div>

      {/* Table */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 48 }}>#</th>
              <th style={{ ...thStyle, width: 72 }}>Time</th>
              <th style={{ ...thStyle, width: 110 }}>Event</th>
              <th style={{ ...thStyle, width: 72 }}>Entity</th>
              <th style={thStyle}>Node</th>
              <th style={{ ...thStyle, width: 56 }}>Queue</th>
              <th style={{ ...thStyle, width: 56 }}>Busy</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((ev, i) => {
              const globalIdx = start + i;
              const isCurrent = globalIdx === playbackIndex;
              const isFuture  = globalIdx > playbackIndex;
              const meta = KIND_META[ev.kind];
              const nodeSnap = ev.state.nodeStates[ev.nodeId];

              const rowBg = isCurrent
                ? 'var(--primary-soft)'
                : isFuture
                  ? 'var(--bg-sunken)'
                  : undefined;

              return (
                <tr
                  key={ev.id}
                  ref={isCurrent ? currentRowRef : undefined}
                  style={{
                    background: rowBg,
                    opacity: isFuture ? 0.45 : 1,
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 150ms',
                  }}
                >
                  <td style={{ padding: '5px 10px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                    {globalIdx + 1}
                  </td>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {ev.t.toFixed(2)}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 650,
                      color: meta.colorVar,
                      background: meta.bgVar,
                      whiteSpace: 'nowrap',
                    }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 11 }}>
                    {ev.entityId}
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nodeNames[ev.nodeId] ?? ev.nodeId}
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {nodeSnap?.queueLength ?? '—'}
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {nodeSnap?.busyServers ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note when windowed */}
      {trace.length > WINDOW && (
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-subtle)',
          background: 'var(--bg-subtle)',
          flexShrink: 0,
        }}>
          Showing events {start + 1}–{end + 1} of {trace.length}. Step through or use Jump to navigate.
        </div>
      )}
    </div>
  );
}
