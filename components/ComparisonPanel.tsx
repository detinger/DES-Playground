import { MathText } from './Math';
import React from 'react';
import { Scenario, ScenarioComparison, ComparisonKpi } from '../lib/scenarios';
import { GitCompare } from 'lucide-react';

interface ComparisonPanelProps {
  baseline: Scenario;
  alternative: Scenario;
  comparison: ScenarioComparison;
  onLoadBaseline: () => void;
  onLoadAlternative: () => void;
}

function deltaColor(kpi: ComparisonKpi): string {
  if (kpi.lowerIsBetter === null) return 'var(--text-muted)';
  const isImproved = kpi.lowerIsBetter ? kpi.pctDiff < 0 : kpi.pctDiff > 0;
  const magnitude  = Math.abs(kpi.pctDiff);
  if (magnitude < 2) return 'var(--text-subtle)';
  return isImproved ? 'var(--success)' : 'var(--error)';
}

function deltaLabel(kpi: ComparisonKpi): string {
  const magnitude = Math.abs(kpi.pctDiff);
  if (magnitude < 2) return '≈ no change';
  const sign = kpi.absDiff > 0 ? '+' : '';
  const pct  = `${sign}${kpi.pctDiff.toFixed(1)}%`;
  if (kpi.lowerIsBetter === null) return pct;
  const isImproved = kpi.lowerIsBetter ? kpi.pctDiff < 0 : kpi.pctDiff > 0;
  const strength   = magnitude >= 20 ? 'strong' : magnitude >= 5 ? 'moderate' : 'slight';
  return `${pct} ${isImproved ? '▲ better' : '▼ worse'} (${strength})`;
}

function ciStr(kpi: ComparisonKpi, which: 'baseline' | 'alt'): string {
  const ci = which === 'baseline' ? kpi.baselineCI : kpi.altCI;
  if (!ci || ci.n <= 1) return '';
  return ` [${kpi.fmt(ci.lower)}, ${kpi.fmt(ci.upper)}]`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ComparisonPanel({ baseline, alternative, comparison, onLoadBaseline, onLoadAlternative }: ComparisonPanelProps) {
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

  const headerCell = (scenario: Scenario, onLoad: () => void, color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 13 }}>{scenario.name}</span>
        <button
          onClick={onLoad}
          className="ui-btn"
          style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}
          title={`Restore ${scenario.name} onto canvas`}
        >
          Load
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-subtle)', paddingLeft: 16 }}>
        saved {fmtDate(scenario.savedAt)} · {scenario.config.replications} rep{scenario.config.replications !== 1 ? 's' : ''} · horizon {scenario.config.horizon} min
        {scenario.config.warmup > 0 && ` · warmup ${scenario.config.warmup} min`}
      </div>
    </div>
  );

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
        flexWrap: 'wrap',
      }}>
        <GitCompare size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', marginRight: 8 }}>
          Scenario Comparison
        </span>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {headerCell(baseline,    onLoadBaseline,    'var(--chart-1)')}
          <span style={{ color: 'var(--border)', alignSelf: 'center' }}>vs</span>
          {headerCell(alternative, onLoadAlternative, 'var(--chart-3)')}
        </div>
      </div>

      {/* Model diffs */}
      {comparison.modelDiffs.length > 0 && (
        <div style={{
          padding: '8px 14px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-sunken)',
          display: 'flex', flexWrap: 'wrap', gap: '4px 20px',
        }}>
          <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em', width: '100%', marginBottom: 4 }}>
            Model changes (baseline → alternative)
          </span>
          {comparison.modelDiffs.map((d, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-subtle)' }}>{d.nodeName}</span>
              <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
              <span style={{ color: 'var(--text-muted)' }}>{d.field}: </span>
              <span style={{ color: 'var(--chart-1)' }}>{d.baseline}</span>
              <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>→</span>
              <span style={{ color: 'var(--chart-3)' }}>{d.alternative}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI comparison table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              <th style={{ ...thStyle, textAlign: 'right', color: 'var(--chart-1)' }}>
                {baseline.name}
              </th>
              <th style={{ ...thStyle, textAlign: 'right', color: 'var(--chart-3)' }}>
                {alternative.name}
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {comparison.kpis.map(kpi => {
              const color = deltaColor(kpi);
              const label = deltaLabel(kpi);
              return (
                <tr key={kpi.key}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-sans)', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <MathText>{kpi.label}</MathText>
                    {kpi.unit && <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 3 }}>{kpi.unit}</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--chart-1)' }}>
                    {kpi.fmt(kpi.baselineValue)}{kpi.unit === '%' ? '%' : ''}
                    {kpi.baselineCI && kpi.baselineCI.n > 1 && (
                      <span style={{ fontSize: 10, color: 'var(--text-subtle)', display: 'block' }}>
                        CI {ciStr(kpi, 'baseline')}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--chart-3)' }}>
                    {kpi.fmt(kpi.altValue)}{kpi.unit === '%' ? '%' : ''}
                    {kpi.altCI && kpi.altCI.n > 1 && (
                      <span style={{ fontSize: 10, color: 'var(--text-subtle)', display: 'block' }}>
                        CI {ciStr(kpi, 'alt')}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color, fontWeight: color !== 'var(--text-subtle)' ? 600 : 400 }}>
                    {label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
