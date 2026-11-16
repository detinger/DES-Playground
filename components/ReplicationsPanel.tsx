import React, { useState } from 'react';
import { RunOutput, CIResult } from '../lib/engine';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ReplicationsPanelProps {
  output: RunOutput;
}

const KPIS: Array<{
  key: keyof import('../lib/engine').RunMetrics;
  label: string;
  fmt: (v: number) => string;
  unit: string;
}> = [
  { key: 'avgWaitTime',    label: 'Avg wait (Wq)',   fmt: v => v.toFixed(2), unit: 'min' },
  { key: 'avgSojournTime', label: 'Avg sojourn (W)', fmt: v => v.toFixed(2), unit: 'min' },
  { key: 'avgUtilization', label: 'Utilisation (ρ̂)', fmt: v => (v * 100).toFixed(1), unit: '%' },
  { key: 'avgQueueLength', label: 'Avg queue (Lq)',  fmt: v => v.toFixed(2), unit: '' },
  { key: 'throughput',     label: 'Throughput',      fmt: v => v.toFixed(3), unit: '/min' },
  { key: 'totalDepartures',label: 'Departures',      fmt: v => String(Math.round(v)), unit: '' },
];

function fmtCI(ci: CIResult | undefined, fmt: (v: number) => string, unit: string): string {
  if (!ci || ci.n <= 1) return '—';
  return `[${fmt(ci.lower)}${unit}, ${fmt(ci.upper)}${unit}]`;
}

export default function ReplicationsPanel({ output }: ReplicationsPanelProps) {
  const [showReps, setShowReps] = useState(false);
  const n = output.reps.length;

  const thStyle: React.CSSProperties = {
    padding: '7px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 650,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--text-subtle)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    background: 'var(--bg-subtle)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: 13,
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
  };

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
      }}>
        <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>
          Replication Summary
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
          n = {n} · 95% confidence intervals
        </span>
      </div>

      {/* CI table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>KPI</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Mean</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>95% CI</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Std Dev</th>
            </tr>
          </thead>
          <tbody>
            {KPIS.map(({ key, label, fmt, unit }) => {
              const ci = output.ci[key];
              const mean  = ci ? fmt(ci.mean)  : '—';
              const ciStr = fmtCI(ci, fmt, unit);
              const std   = ci && ci.n > 1 ? fmt(ci.std) : '—';

              return (
                <tr key={key}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-sans)', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {label} {unit && <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{unit}</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--primary)', fontWeight: 650 }}>{mean}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{ciStr}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-subtle)', fontSize: 12 }}>{std}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-replication accordion */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => setShowReps(r => !r)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
            transition: 'background 100ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {showReps ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Per-replication breakdown
        </button>
        {showReps && (
          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, fontSize: 10 }}>Rep</th>
                  <th style={{ ...thStyle, fontSize: 10 }}>Seed</th>
                  {KPIS.map(({ key, label, unit }) => (
                    <th key={key} style={{ ...thStyle, fontSize: 10, textAlign: 'right' }}>
                      {label}{unit ? ` (${unit})` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {output.reps.map(rep => (
                  <tr key={rep.repIndex}>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-subtle)' }}>{rep.repIndex + 1}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-subtle)' }}>{rep.seed}</td>
                    {KPIS.map(({ key, fmt, unit }) => (
                      <td key={key} style={{ ...tdStyle, fontSize: 11, textAlign: 'right' }}>
                        {fmt(rep.metrics[key])}{unit === '%' ? '%' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
