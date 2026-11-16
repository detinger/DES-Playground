import { MathFormula, MathText } from './Math';
import React from 'react';
import { DesModel } from '../lib/model';
import { RunMetrics } from '../lib/engine';
import { detectMMc, mmcAnalysis } from '../lib/theory';

interface TheoryPanelProps {
  model: DesModel | null;
  simMean: Partial<RunMetrics> | null;
  horizon: number;
  warmup: number;
}

function pct(sim: number | undefined, theory: number): string {
  if (sim === undefined || !isFinite(theory) || theory === 0) return '—';
  const dev = ((sim - theory) / theory) * 100;
  const sign = dev > 0 ? '+' : '';
  return `${sign}${dev.toFixed(1)}%`;
}

function deviationColor(sim: number | undefined, theory: number): string {
  if (sim === undefined || !isFinite(theory)) return 'var(--text-subtle)';
  const absdev = Math.abs((sim - theory) / theory);
  if (absdev < 0.05) return 'var(--success)';
  if (absdev < 0.15) return 'var(--warning)';
  return 'var(--error)';
}

export default function TheoryPanel({ model, simMean, horizon, warmup }: TheoryPanelProps) {
  if (!model) return null;

  const params = detectMMc(model);

  if (!params) {
    return (
      <details style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 18px',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 13,
        color: 'var(--text-subtle)',
      }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 650 }}>
          M/M/c Reference <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>— unavailable for this model</span>
        </summary>
        <p style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          This reference compares simulated waiting times, queue length and utilisation with theoretical values.
          It requires one Source with exponential interarrival times feeding one Server with exponential service
          times and c parallel service slots, followed by a Sink. Other distributions or multiple processing
          stages do not fit this reference. You can still simulate and analyse those models.
        </p>
      </details>
    );
  }

  const theory = mmcAnalysis(params);
  const { lambda, mu, c, rho } = params;
  const obsHorizon = Math.max(horizon - warmup, 1);

  const rows: Array<{
    label: string;
    theoryVal: number;
    simVal: number | undefined;
    fmt: (v: number) => string;
    unit: string;
    description: string;
  }> = [
    {
      label: 'ρ (utilisation)',
      theoryVal: rho,
      simVal: simMean?.avgUtilization,
      fmt: v => (v * 100).toFixed(2),
      unit: '%',
      description: 'λ/(c·μ) — fraction of server capacity in use at steady state',
    },
    {
      label: 'Wq (avg wait)',
      theoryVal: theory.Wq,
      simVal: simMean?.avgWaitTime,
      fmt: v => v.toFixed(3),
      unit: 'min',
      description: 'Expected time an entity spends waiting before service begins',
    },
    {
      label: 'W (avg sojourn)',
      theoryVal: theory.W,
      simVal: simMean?.avgSojournTime,
      fmt: v => v.toFixed(3),
      unit: 'min',
      description: 'Expected total time from arrival to departure (W = Wq + 1/μ)',
    },
    {
      label: 'Lq (avg queue)',
      theoryVal: theory.Lq,
      simVal: simMean?.avgQueueLength,
      fmt: v => v.toFixed(3),
      unit: '',
      description: "Little's Law: Lq = λ·Wq",
    },
    {
      label: 'L (avg in system)',
      theoryVal: theory.L,
      simVal: simMean ? (simMean.avgQueueLength ?? 0) + (simMean.avgUtilization ?? 0) * c : undefined,
      fmt: v => v.toFixed(3),
      unit: '',
      description: "Little's Law: L = λ·W",
    },
  ];

  const thStyle: React.CSSProperties = {
    padding: '7px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 650,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--text-subtle)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: 13,
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
  };

  const modelLabel = c === 1 ? 'M/M/1' : `M/M/${c}`;
  const rateLabel  = `λ = ${lambda.toFixed(3)}/min · μ = ${mu.toFixed(3)}/min · c = ${c}`;

  return (
    <div style={{
      border: `1px solid ${theory.stable ? 'var(--border)' : 'var(--warning)'}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
      }}>
        <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>
          {modelLabel} Reference
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
          <MathText>{rateLabel}</MathText>
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 650, padding: '2px 8px', borderRadius: 4,
          color: theory.stable ? 'var(--success)' : 'var(--warning)',
          background: theory.stable ? 'var(--success-soft)' : 'var(--warning-soft)',
          border: `1px solid ${theory.stable ? 'var(--success)' : 'var(--warning)'}`,
        }}>
          {theory.stable ? `ρ = ${(rho * 100).toFixed(1)}% — stable` : `ρ = ${(rho * 100).toFixed(1)}% — UNSTABLE`}
        </span>
      </div>

      {!theory.stable && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--warning-soft)',
          borderBottom: '1px solid var(--warning)',
          fontSize: 12, color: 'var(--warning)',
        }}>
          <MathFormula tex={String.raw`\rho\geq1`} /> — no finite steady-state under M/M/c assumptions. Theory formulas return ∞. Simulation results for a finite horizon are still valid but reflect a transient overloaded system, not steady-state behavior.
        </div>
      )}

      <div style={{ padding: '10px 14px', fontSize: 13 }}>
        <MathFormula display tex={String.raw`\rho=\frac{\lambda}{c\mu},\quad a=\frac{\lambda}{\mu},\quad P_0=\left[\sum_{k=0}^{c-1}\frac{a^k}{k!}+\frac{a^c}{c!(1-\rho)}\right]^{-1}`} />
        <MathFormula display tex={String.raw`C=\frac{a^cP_0}{c!(1-\rho)},\quad W_q=\frac{C}{c\mu-\lambda},\quad W=W_q+\frac1\mu,\quad L_q=\lambda W_q,\quad L=\lambda W\quad(\rho<1)`} />
      </div>
      {/* Comparison table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Theory</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Simulation</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Deviation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, theoryVal, simVal, fmt, unit, description }) => {
              const tStr = isFinite(theoryVal) ? `${fmt(theoryVal)}${unit}` : '∞';
              const sStr = simVal !== undefined ? `${fmt(simVal)}${unit}` : '—';
              const dev  = pct(simVal, theoryVal);
              const devColor = deviationColor(simVal, theoryVal);

              return (
                <tr key={label}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-sans)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}><MathText>{label}</MathText></div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}><MathText>{description}</MathText></div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--accent)' }}>{tStr}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text)' }}>{sStr}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: devColor, fontWeight: 600 }}>{dev}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-subtle)',
        background: 'var(--bg-subtle)',
      }}>
        {modelLabel} steady-state theory assumes Poisson arrivals, exponential service, infinite buffer, and ρ &lt; 1.
        Simulation: horizon {horizon} min, warm-up {warmup} min, observation window {obsHorizon} min.
        <MathFormula tex={String.raw`\mathrm{Deviation}=\frac{\mathrm{sim}-\mathrm{theory}}{\mathrm{theory}}\times100\%`} />. Expect some variance for short runs.
      </div>
    </div>
  );
}
