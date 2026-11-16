import FormalModel from './FormalModel';

import { compileModel } from '../lib/compiler';
import { MathText, MathFormula } from './Math';
import React, { useState, useEffect, useRef } from 'react';
import { FlaskConical, Trophy, ChevronDown, ChevronRight, CheckCircle2, Circle, Lightbulb, ExternalLink } from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../types';
import { readCompletedChallenges, savePreference } from '../lib/appStorage';
import { LESSONS, EXAMPLES, CHALLENGES, ExampleModel, Challenge } from '../lib/theoryContent';

interface TheoryProps {
  onLoadExample: (nodes: Node<NodeData>[], edges: Edge[], config?: ExampleModel['config']) => void;
  section: Section;
  highlightedExampleId: string | null;
  onGoToExample: (id: string) => void;
}

type Section = 'lessons' | 'examples' | 'challenges';

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 650, padding: '2px 8px', borderRadius: 20,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      color,
    }}>{text}</span>
  );
}

function DifficultyBadge({ d }: { d: 1 | 2 | 3 }) {
  const map: Record<number, [string, string]> = {
    1: ['Beginner',     'var(--success)'],
    2: ['Intermediate', 'var(--warning)'],
    3: ['Hard',         'var(--error)'],
  };
  return <Badge text={map[d][0]} color={map[d][1]} />;
}

type DifficultyFilterValue = 'all' | '1' | '2' | '3';

function DifficultyFilter({ value, onChange, count }: {
  value: DifficultyFilterValue;
  onChange: (value: DifficultyFilterValue) => void;
  count: number;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
      Difficulty
      <select value={value} onChange={e => onChange(e.target.value as DifficultyFilterValue)} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', font: 'inherit', background: 'var(--bg)', color: 'var(--text)' }}>
        <option value="all">All levels</option>
        <option value="1">Beginner</option>
        <option value="2">Intermediate</option>
        <option value="3">Hard</option>
      </select>
      <span aria-live="polite">{count} shown</span>
    </label>
  );
}

function ExperimentSteps({ steps }: { steps?: string[] }) {
  if (!steps?.length) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', marginBottom: 6 }}>
        Try the experiment
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map(step => <li key={step} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}><MathText>{step}</MathText></li>)}
      </ol>
    </div>
  );
}

// ── Lesson visualizations ─────────────────────────────────────────────────────

const vizBox: React.CSSProperties = {
  background: 'var(--bg-sunken)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '10px 14px', overflow: 'hidden',
};
const vizTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 650, textTransform: 'uppercase' as const,
  letterSpacing: '0.07em', color: 'var(--text-subtle)', marginBottom: 8,
};

function EventTimelineViz() {
  const W = 560, H = 160, tMax = 20;
  const tx = (t: number) => 48 + (t / tMax) * 480;
  // Events: arrival, service-start, 2nd arrival, service-end, departure
  const events = [
    { t: 2,   label: 'Arrival',    sub: 'e₁ joins queue', color: 'var(--chart-1)' },
    { t: 2.1, label: 'Svc Start',  sub: 'e₁ served',      color: 'var(--success)' },
    { t: 8,   label: 'Arrival',    sub: 'e₂ joins queue', color: 'var(--chart-1)' },
    { t: 10,  label: 'Svc End',    sub: 'e₁ leaves svc',  color: 'var(--warning)' },
    { t: 16,  label: 'Departure',  sub: 'e₂ exits',       color: 'var(--error)'   },
  ];
  // Server state bars: busy t=2→10, busy t=10→16, idle t=0→2
  const busySegs = [[2,10],[10,16]];

  return (
    <div style={vizBox}>
      <div style={vizTitle}>DES clock — jumps instantly from event to event; time is frozen between events</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {/* axes */}
        <line x1={48} y1={H-20} x2={W-10} y2={H-20} stroke="var(--border)" strokeWidth={1.5} />
        <text x={W-8} y={H-16} fontSize={9} fill="var(--text-subtle)">time</text>

        {/* Server busy/idle row */}
        <text x={44} y={30} fontSize={8} fill="var(--text-subtle)" textAnchor="end">server</text>
        {/* idle segments */}
        <rect x={tx(0)} y={22} width={tx(2)-tx(0)} height={12} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={0.8} rx={2} />
        <text x={(tx(0)+tx(2))/2} y={31} fontSize={7.5} fill="var(--text-subtle)" textAnchor="middle">idle</text>
        {/* busy segments */}
        {busySegs.map(([a,b],i) => (
          <g key={i}>
            <rect x={tx(a)} y={22} width={tx(b)-tx(a)} height={12} fill="var(--success)" opacity={0.25} stroke="var(--success)" strokeWidth={0.8} rx={2} />
            <text x={(tx(a)+tx(b))/2} y={31} fontSize={7.5} fill="var(--success)" textAnchor="middle">busy</text>
          </g>
        ))}

        {/* Queue depth row */}
        <text x={44} y={56} fontSize={8} fill="var(--text-subtle)" textAnchor="end">queue</text>
        {/* 0 waiting 0→2 */}
        <rect x={tx(0)} y={48} width={tx(2)-tx(0)} height={12} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={0.8} rx={2} />
        <text x={(tx(0)+tx(2))/2} y={57} fontSize={7.5} fill="var(--text-subtle)" textAnchor="middle">0</text>
        {/* 0 waiting 2→8 (served immediately) */}
        <rect x={tx(2)} y={48} width={tx(8)-tx(2)} height={12} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={0.8} rx={2} />
        <text x={(tx(2)+tx(8))/2} y={57} fontSize={7.5} fill="var(--text-subtle)" textAnchor="middle">0</text>
        {/* 1 waiting 8→10 */}
        <rect x={tx(8)} y={48} width={tx(10)-tx(8)} height={12} fill="var(--warning)" opacity={0.22} stroke="var(--warning)" strokeWidth={0.8} rx={2} />
        <text x={(tx(8)+tx(10))/2} y={57} fontSize={7.5} fill="var(--warning)" textAnchor="middle">1</text>
        {/* 0 waiting 10→16 */}
        <rect x={tx(10)} y={48} width={tx(16)-tx(10)} height={12} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={0.8} rx={2} />
        <text x={(tx(10)+tx(16))/2} y={57} fontSize={7.5} fill="var(--text-subtle)" textAnchor="middle">0</text>

        {/* "Frozen" annotations between events */}
        {[[2,8],[10,16]].map(([a,b],i) => (
          <text key={i} x={(tx(a)+tx(b))/2} y={79} fontSize={8} fill="var(--text-subtle)" textAnchor="middle" fontStyle="italic">
            ← clock frozen →
          </text>
        ))}

        {/* Event ticks on time axis */}
        {events.map((ev, i) => {
          const x = tx(ev.t) + (i===1 ? 4 : 0);
          const above = i % 2 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={H-20} x2={x} y2={above ? 90 : 95} stroke={ev.color} strokeWidth={1.5} />
              <circle cx={x} cy={H-20} r={4.5} fill={ev.color} />
              <text x={x} y={above ? 86 : 112} fontSize={8.5} fill={ev.color} textAnchor="middle">{ev.label}</text>
              <text x={x} y={above ? 76 : 122} fontSize={8} fill="var(--text-subtle)" textAnchor="middle">t={ev.t}</text>
            </g>
          );
        })}

        {/* time axis ticks */}
        {[0,4,8,12,16,20].map(t => (
          <g key={t}>
            <line x1={tx(t)} y1={H-20} x2={tx(t)} y2={H-15} stroke="var(--border)" strokeWidth={1} />
            <text x={tx(t)} y={H-6} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">{t}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DistributionViz() {
  const W = 560, H = 160, xMax = 25, mean = 5, lam = 1 / mean;
  const tx = (x: number) => 52 + (x / xMax) * 480;
  const ty = (y: number) => 100 - (y / (lam * 1.08)) * 72;
  const pts: string[] = [];
  for (let x = 0; x <= xMax; x += 0.3) pts.push(`${tx(x)},${ty(lam * Math.exp(-lam * x))}`);
  const curve = 'M' + pts.join(' L');
  const fill  = curve + ` L${tx(xMax)},100 L${tx(0)},100 Z`;

  // Sample arrivals (exponential, seeded-ish)
  const sampleInterarrivals = [1.2, 7.4, 2.1, 9.8, 0.5, 4.2, 3.7, 6.1];
  const sampleTimes: number[] = [];
  let t = 0;
  for (const ia of sampleInterarrivals) {
    t += ia;
    if (t > xMax) break;
    sampleTimes.push(t);
  }

  // Regular (uniform) arrivals at mean spacing
  const regularTimes = [5, 10, 15, 20];

  return (
    <div style={vizBox}>
      <div style={vizTitle}>Exponential vs deterministic interarrivals — exponential creates bursts and long gaps</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {/* Grid */}
        {[0, 5, 10, 15, 20, 25].map(x => (
          <g key={x}>
            <line x1={tx(x)} y1={16} x2={tx(x)} y2={100} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={tx(x)} y={112} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">{x}</text>
          </g>
        ))}
        <line x1={52} y1={100} x2={W-10} y2={100} stroke="var(--border)" strokeWidth={1.5} />
        <line x1={52} y1={14}  x2={52}   y2={100} stroke="var(--border)" strokeWidth={1.5} />

        {/* PDF curve */}
        <path d={fill} fill="var(--primary)" opacity={0.10} />
        <path d={curve} fill="none" stroke="var(--primary)" strokeWidth={2.2} />
        <line x1={tx(mean)} y1={28} x2={tx(mean)} y2={100} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4,3" />
        <text x={tx(mean)+5} y={38} fontSize={8.5} fill="var(--accent)">μ=5</text>

        {/* Exponential sample ticks */}
        <text x={44} y={125} fontSize={8} fill="var(--chart-1)" textAnchor="end">Exp</text>
        {sampleTimes.map((st, i) => (
          <g key={i}>
            <line x1={tx(st)} y1={119} x2={tx(st)} y2={131} stroke="var(--chart-1)" strokeWidth={2} />
            <circle cx={tx(st)} cy={125} r={3} fill="var(--chart-1)" />
          </g>
        ))}
        <line x1={52} y1={125} x2={W-10} y2={125} stroke="var(--chart-1)" strokeWidth={0.8} opacity={0.4} />

        {/* Regular sample ticks */}
        <text x={44} y={145} fontSize={8} fill="var(--text-subtle)" textAnchor="end">Det</text>
        {regularTimes.map((rt, i) => (
          <g key={i}>
            <line x1={tx(rt)} y1={139} x2={tx(rt)} y2={151} stroke="var(--text-subtle)" strokeWidth={2} />
            <circle cx={tx(rt)} cy={145} r={3} fill="var(--text-subtle)" />
          </g>
        ))}
        <line x1={52} y1={145} x2={W-10} y2={145} stroke="var(--text-subtle)" strokeWidth={0.8} opacity={0.4} />

        <text x={W-8} y={99} fontSize={9} fill="var(--text-subtle)">t</text>
        <text x={30}  y={18} fontSize={9} fill="var(--text-subtle)">f(t)</text>
        <text x={300} y={48} fontSize={8.5} fill="var(--primary)">Exponential density</text>
      </svg>
    </div>
  );
}

function StabilityViz() {
  const W = 560, H = 190, lqMax = 20;
  const tx = (r: number) => 52 + r * 460;
  const ty = (lq: number) => 158 - Math.min(lq / lqMax, 1) * 130;
  const pts: string[] = [];
  for (let r = 0; r <= 0.975; r += 0.005) pts.push(`${tx(r)},${ty(r * r / (1 - r))}`);
  const curve = 'M' + pts.join(' L');

  // Color zones
  const zones = [
    { from: 0,    to: 0.6, color: 'var(--success)', label: 'Healthy',  opacity: 0.10 },
    { from: 0.6,  to: 0.8, color: 'var(--warning)', label: 'Moderate', opacity: 0.12 },
    { from: 0.8,  to: 0.9, color: 'var(--error)',   label: 'High',     opacity: 0.10 },
    { from: 0.9,  to: 1.0, color: 'var(--error)',   label: 'Critical', opacity: 0.18 },
  ];
  const kp = [
    { r: 0.5, lq: 0.5,  col: 'var(--success)' },
    { r: 0.7, lq: 1.63, col: 'var(--warning)' },
    { r: 0.85,lq: 4.82, col: 'var(--error)'   },
  ];
  const yAxis = 158;
  return (
    <div style={vizBox}>
      <div style={vizTitle}><MathText>{"M/M/1 queue length — Lq = ρ²/(1−ρ) explodes as utilisation approaches 100%"}</MathText></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {/* Zone bands */}
        {zones.map(z => (
          <rect key={z.from}
            x={tx(z.from)} y={28}
            width={tx(z.to)-tx(z.from)} height={yAxis-28}
            fill={z.color} opacity={z.opacity}
          />
        ))}
        {/* Zone labels at top */}
        {zones.map(z => (
          <text key={z.from}
            x={(tx(z.from)+tx(z.to))/2} y={40}
            fontSize={8} fill={z.color} textAnchor="middle" fontWeight={650}
          >{z.label}</text>
        ))}

        {/* Grid */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(r => (
          <g key={r}>
            <line x1={tx(r)} y1={28} x2={tx(r)} y2={yAxis} stroke="var(--border)" strokeWidth={0.5} />
            <text x={tx(r)} y={H-6} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">{r.toFixed(1)}</text>
          </g>
        ))}
        {[0, 5, 10, 15, 20].map(lq => (
          <g key={lq}>
            <line x1={52} y1={ty(lq)} x2={W-20} y2={ty(lq)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={46} y={ty(lq)+4} fontSize={8.5} fill="var(--text-subtle)" textAnchor="end">{lq}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={52} y1={yAxis} x2={W-18} y2={yAxis} stroke="var(--text-subtle)" strokeWidth={1.5} />
        <line x1={52} y1={26}   x2={52}    y2={yAxis} stroke="var(--text-subtle)" strokeWidth={1.5} />

        {/* Curve */}
        <path d={curve} fill="none" stroke="var(--primary)" strokeWidth={2.8} />

        {/* Key points */}
        {kp.map(({ r, lq, col }) => {
          const x = tx(r), y = ty(lq);
          return (
            <g key={r}>
              <circle cx={x} cy={y} r={5} fill={col} stroke="var(--bg-elevated)" strokeWidth={1.5} />
              <text x={x+8} y={y-6}  fontSize={8.5} fill={col} fontWeight={650}>ρ={r}</text>
              <text x={x+8} y={y+5}  fontSize={8.5} fill={col}>Lq={lq}</text>
            </g>
          );
        })}

        {/* Unstable label */}
        <text x={tx(0.975)} y={52} fontSize={8} fill="var(--error)" textAnchor="end">↑ unstable</text>

        {/* Axis labels */}
        <text x={W-16} y={yAxis-2} fontSize={9} fill="var(--text-subtle)">ρ</text>
        <text x={30}   y={28}      fontSize={9} fill="var(--text-subtle)">Lq</text>
      </svg>
    </div>
  );
}

function EntityLifecycleViz() {
  const W = 560, H = 155, tMax = 20;
  const tx = (t: number) => 52 + (t / tMax) * 476;
  // Entity timeline: arrived t=2, service t=6, departure t=14
  const tArr = 2, tSvcStart = 6, tSvcEnd = 14, tDep = 14;
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Entity lifecycle — queue wait (Wq) + service time = sojourn time (W)</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {/* Time axis */}
        <line x1={52} y1={H-20} x2={W-10} y2={H-20} stroke="var(--border)" strokeWidth={1.5} />
        {[0,4,8,12,16,20].map(t => (
          <g key={t}>
            <line x1={tx(t)} y1={H-20} x2={tx(t)} y2={H-15} stroke="var(--border)" strokeWidth={1} />
            <text x={tx(t)} y={H-6} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">{t}</text>
          </g>
        ))}
        <text x={W-8} y={H-16} fontSize={9} fill="var(--text-subtle)">t</text>

        {/* Queue wait bar: tArr → tSvcStart */}
        <rect x={tx(tArr)} y={56} width={tx(tSvcStart)-tx(tArr)} height={18}
          fill="var(--warning)" opacity={0.3} rx={3} />
        <text x={(tx(tArr)+tx(tSvcStart))/2} y={68} fontSize={9} fill="var(--warning)" textAnchor="middle" fontWeight={650}>
          waiting in queue
        </text>

        {/* Service bar: tSvcStart → tSvcEnd */}
        <rect x={tx(tSvcStart)} y={56} width={tx(tSvcEnd)-tx(tSvcStart)} height={18}
          fill="var(--success)" opacity={0.3} rx={3} />
        <text x={(tx(tSvcStart)+tx(tSvcEnd))/2} y={68} fontSize={9} fill="var(--success)" textAnchor="middle" fontWeight={650}>
          in service
        </text>

        {/* Wq bracket */}
        <line x1={tx(tArr)} y1={88} x2={tx(tSvcStart)} y2={88} stroke="var(--warning)" strokeWidth={1.5} />
        <line x1={tx(tArr)} y1={85} x2={tx(tArr)} y2={91} stroke="var(--warning)" strokeWidth={1.5} />
        <line x1={tx(tSvcStart)} y1={85} x2={tx(tSvcStart)} y2={91} stroke="var(--warning)" strokeWidth={1.5} />
        <text x={(tx(tArr)+tx(tSvcStart))/2} y={100} fontSize={9.5} fill="var(--warning)" textAnchor="middle" fontWeight={650}>
          Wq = 4 min
        </text>

        {/* W bracket */}
        <line x1={tx(tArr)} y1={112} x2={tx(tDep)} y2={112} stroke="var(--primary)" strokeWidth={1.5} />
        <line x1={tx(tArr)} y1={109} x2={tx(tArr)} y2={115} stroke="var(--primary)" strokeWidth={1.5} />
        <line x1={tx(tDep)} y1={109} x2={tx(tDep)} y2={115} stroke="var(--primary)" strokeWidth={1.5} />
        <text x={(tx(tArr)+tx(tDep))/2} y={126} fontSize={9.5} fill="var(--primary)" textAnchor="middle" fontWeight={650}>
          W = 12 min (sojourn)
        </text>

        {/* Event markers */}
        {[
          { t: tArr,      label: 'Arrival',    color: 'var(--chart-1)' },
          { t: tSvcStart, label: 'Svc Start',  color: 'var(--success)' },
          { t: tDep,      label: 'Departure',  color: 'var(--error)'   },
        ].map((ev, i) => (
          <g key={i}>
            <circle cx={tx(ev.t)} cy={65} r={5} fill={ev.color} stroke="var(--bg-elevated)" strokeWidth={1} />
            <line x1={tx(ev.t)} y1={56} x2={tx(ev.t)} y2={H-20} stroke={ev.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
            <text x={tx(ev.t)} y={48} fontSize={8.5} fill={ev.color} textAnchor="middle">{ev.label}</text>
            <text x={tx(ev.t)} y={38} fontSize={8} fill="var(--text-subtle)" textAnchor="middle">t={ev.t}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function LittlesLawViz() {
  return (
    <div style={vizBox}>
      <div style={vizTitle}><MathText>{"Little's Law — L = λW (holds for any stable system)"}</MathText></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 2, minWidth: 230 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--chart-1)', fontWeight: 700 }}>λ</div>
            <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>arrival rate</div>
          </div>
          <span style={{ color: 'var(--text-subtle)', fontSize: 20, flexShrink: 0 }}>→</span>
          <div style={{
            padding: '10px 18px', borderRadius: 8, flex: 1,
            border: '2px solid var(--border)', background: 'var(--bg-elevated)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>System</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: 3 }}>W = sojourn time</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginTop: 2, fontWeight: 650 }}><MathFormula tex={String.raw`L=\lambda W`} /></div>
          </div>
          <span style={{ color: 'var(--text-subtle)', fontSize: 20, flexShrink: 0 }}>→</span>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--chart-1)', fontWeight: 700 }}>λ</div>
            <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>throughput</div>
          </div>
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: 6, flexShrink: 0,
          background: 'var(--primary-soft,var(--bg-elevated))',
          border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.75,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 2 }}>Example</div>
          <div><MathFormula tex={String.raw`\lambda=0.18/\mathrm{min}`} /></div>
          <div><MathFormula tex={String.raw`W=8.5\,\mathrm{min}`} /></div>
          <div style={{ color: 'var(--primary)', fontWeight: 650 }}><MathFormula tex={String.raw`L=1.53`} /> entities</div>
        </div>
      </div>
    </div>
  );
}

const WARMUP_PTS: { t: number; q: number }[] = [
  {t:0,q:0},{t:5,q:0.1},{t:10,q:0.3},{t:15,q:0.7},{t:20,q:1.0},{t:25,q:1.4},
  {t:30,q:1.7},{t:35,q:1.5},{t:40,q:2.0},{t:45,q:2.2},{t:50,q:2.5},{t:55,q:2.3},
  {t:60,q:2.7},{t:65,q:2.5},{t:70,q:2.9},{t:75,q:3.1},{t:80,q:3.0},{t:85,q:2.8},
  {t:90,q:3.2},{t:95,q:3.4},{t:100,q:3.0},
  {t:110,q:3.4},{t:120,q:2.8},{t:130,q:3.6},{t:140,q:3.1},{t:150,q:2.9},
  {t:160,q:3.8},{t:170,q:3.2},{t:180,q:4.1},{t:190,q:3.0},{t:200,q:3.5},
  {t:220,q:2.7},{t:240,q:3.9},{t:260,q:3.3},{t:280,q:2.8},{t:300,q:3.6},
  {t:320,q:4.2},{t:340,q:3.1},{t:360,q:3.5},{t:380,q:2.9},{t:400,q:3.2},
  {t:420,q:3.7},{t:440,q:3.0},{t:460,q:3.4},{t:480,q:2.8},{t:500,q:3.1},
];

function WarmupViz() {
  const W = 500, H = 130, tMax = 500, lqMax = 5, warmupT = 100;
  const tx = (t: number) => 48 + (t / tMax) * 418;
  const ty = (q: number) => 110 - Math.min(q / lqMax, 1) * 92;
  const path = 'M' + WARMUP_PTS.map(d => `${tx(d.t)},${ty(d.q)}`).join(' L');
  const wx = tx(warmupT);
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Warm-up bias — cold-start transient vs steady state</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        <rect x={48}  y={18} width={wx - 48} height={92} fill="var(--warning)" opacity={0.08} />
        <rect x={wx}  y={18} width={W - wx - 10} height={92} fill="var(--success)" opacity={0.05} />
        <text x={(48 + wx) / 2} y={33} fontSize={9} fill="var(--warning)" textAnchor="middle">warm-up</text>
        <text x={(48 + wx) / 2} y={44} fontSize={8} fill="var(--text-subtle)" textAnchor="middle">(exclude)</text>
        <text x={(wx + W - 10) / 2} y={33} fontSize={9} fill="var(--success)" textAnchor="middle">observation window</text>
        <line x1={wx} y1={18} x2={wx} y2={110} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="4,3" />
        <line x1={wx} y1={ty(3.2)} x2={W - 10} y2={ty(3.2)} stroke="var(--success)" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />
        <text x={W - 8} y={ty(3.2) + 4} fontSize={8} fill="var(--success)">Lq≈3.2</text>
        <line x1={48} y1={110} x2={W - 10} y2={110} stroke="var(--border)" strokeWidth={1.5} />
        <line x1={48} y1={18}  x2={48}     y2={110} stroke="var(--border)" strokeWidth={1.5} />
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={1.8} />
        <text x={W - 8} y={110} fontSize={9} fill="var(--text-subtle)">t</text>
        <text x={28}    y={18}  fontSize={9} fill="var(--text-subtle)">Lq</text>
      </svg>
    </div>
  );
}

function CodeEquivalenceViz() {
  const engines = [
    { label: 'Browser Engine', sub: 'TypeScript',  color: 'var(--chart-1)' },
    { label: 'SimPy',          sub: 'Python 3.9+', color: 'var(--chart-2,var(--accent))' },
    { label: 'R simmer',       sub: 'R 4.1+',      color: 'var(--chart-3,var(--success))' },
  ];
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Generated code — all three share the same statistical definition</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          padding: '8px 14px', borderRadius: 6, flexShrink: 0,
          border: '1px solid var(--primary)', background: 'var(--primary-soft,var(--bg-elevated))',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>DesModel</div>
          <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>canonical schema</div>
        </div>
        <span style={{ color: 'var(--text-subtle)', fontSize: 18, flexShrink: 0 }}>→</span>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {engines.map((e, i) => (
            <div key={i} style={{
              padding: '8px 10px', borderRadius: 6, flex: 1, minWidth: 100,
              background: `color-mix(in srgb, ${e.color} 12%, var(--bg-sunken))`,
              border: `1px solid color-mix(in srgb, ${e.color} 35%, transparent)`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 650, color: e.color }}>{e.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 2 }}>{e.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
        Same distributions · same warmup boundary · same t-distribution CI table
      </div>
    </div>
  );
}

const LESSON_EQUATIONS: Record<number, string[]> = {
  1: [String.raw`t_{k+1}=\min\{t_e:e\in\mathcal E_k\},\qquad X_{k+1}=\delta(X_k,e_{k+1})`],
  2: [String.raw`\lambda=\frac1{\mathbb E[A]},\quad\mu=\frac1{\mathbb E[S]},\quad f_A(t)=\lambda e^{-\lambda t},\ t\ge0`],
  3: [String.raw`A/S/c/K/N/\mathrm{Disc}`, String.raw`\rho=\frac{\lambda}{c\mu}<1,\qquad L_q^{M/M/1}=\frac{\rho^2}{1-\rho},\qquad L_q^{M/D/1}=\frac{\rho^2}{2(1-\rho)}`],
  4: [String.raw`e_{\rm next}=\operatorname*{arg\,min}_{e\in\mathcal E}(t_e,p_e,s_e)`],
  5: [String.raw`L=\lambda W,\quad L_q=\lambda W_q,\quad\widehat L_q=\frac{1}{T-w}\int_w^T Q(t)\,dt`, String.raw`\widehat W_q=\frac{1}{|D_w|}\sum_{i\in D_w}W_{q,i}`],
  6: [String.raw`\bar Y=\frac1n\sum_{i=1}^nY_i,\quad s^2=\frac{1}{n-1}\sum_{i=1}^n(Y_i-\bar Y)^2,\quad \mathrm{CI}_{95\%}=\bar Y\pm t_{0.975,n-1}\frac{s}{\sqrt n}`],
  7: [String.raw`\mathbb E[\widehat Y_{\rm browser}]\approx\mathbb E[\widehat Y_{\rm Python}]\approx\mathbb E[\widehat Y_{\rm R}]`],
  8: [String.raw`M_{\rm ACD}=\langle A,Q,I,O,\tau,\mu_0\rangle`, String.raw`I(a_{\rm service})=\{q_{\rm wait},r_{\rm idle}\},\quad O(a_{\rm service})=\{q_{\rm next},r_{\rm idle}\}`],
};
function LessonEquations({ level }: { level: number }) {
  return <div>{(LESSON_EQUATIONS[level] ?? []).map(tex => <MathFormula key={tex} tex={tex} display />)}</div>;
}

function LessonViz({ level }: { level: number }) {
  switch (level) {
    case 1: return <EventTimelineViz />;
    case 2: return <DistributionViz />;
    case 3: return <StabilityViz />;
    case 4: return <EntityLifecycleViz />;
    case 5: return <LittlesLawViz />;
    case 6: return <WarmupViz />;
    case 7: return <CodeEquivalenceViz />;
    default: return null;
  }
}

// ── Lessons tab ───────────────────────────────────────────────────────────────

function LessonsTab({ onGoToExample }: { onGoToExample: (id: string) => void }) {
  const [expanded, setExpanded] = useState<number | null>(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {LESSONS.map(lesson => {
        const isOpen = expanded === lesson.level;
        return (
          <div key={lesson.level} style={card}>
            <button
              onClick={() => setExpanded(isOpen ? null : lesson.level)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px',
                background: isOpen ? 'var(--bg-subtle)' : 'var(--bg-elevated)',
                border: 'none', cursor: 'pointer',
                borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                textAlign: 'left', transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--primary)', color: 'var(--text-on-primary)',
                fontSize: 11, fontWeight: 700,
              }}>
                {lesson.level}
              </span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                {lesson.title}
              </span>
              {isOpen ? <ChevronDown size={15} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
                      : <ChevronRight size={15} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />}
            </button>

            {isOpen && (
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lesson.paragraphs.map((p, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: '80ch' }}>
                    <MathText>{p}</MathText>
                  </p>
                ))}

                <LessonViz level={lesson.level} />
                <LessonEquations level={lesson.level} />

                {/* Key fact */}
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <Lightbulb size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--primary-strong)', lineHeight: 1.5 }}>
                    <MathText>{lesson.keyFact}</MathText>
                  </span>
                </div>

                {/* Misconception */}
                <div style={{
                  borderLeft: '3px solid var(--error)',
                  paddingLeft: 12,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Common misconception
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    <MathText>{lesson.misconception.label}</MathText>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--success)' }}>Correction: </strong><MathText>{lesson.misconception.fix}</MathText>
                  </div>
                </div>

                {/* Try it link */}
                {lesson.exampleId && (
                  <div>
                    <button
                      onClick={() => onGoToExample(lesson.exampleId!)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 12, color: 'var(--accent)', background: 'none',
                        border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                        borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <ExternalLink size={12} /> Try the related example →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Examples tab ──────────────────────────────────────────────────────────────

function ExamplesTab({ onLoad, highlightedId }: { onLoad: (ex: ExampleModel) => void; highlightedId: string | null }) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [difficulty, setDifficulty] = useState<DifficultyFilterValue>('all');
  const examples = EXAMPLES.filter(ex => difficulty === 'all' || String(ex.difficulty ?? 1) === difficulty);

  useEffect(() => { if (highlightedId) setDifficulty('all'); }, [highlightedId]);

  useEffect(() => {
    if (highlightedId && cardRefs.current[highlightedId]) {
      cardRefs.current[highlightedId]!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedId, difficulty]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Explore queueing models, Clinic, Factory, Inventory and IT case studies. Clinic and editor models use minutes; Factory uses working hours and Inventory uses days. Open the model in Queue Modeler or Process Modeler, then select <strong>Run</strong>. Use Scenario Comparison for experiments; the M/M/c Theory panel applies only to compatible single-stage models.
      </p>
      <DifficultyFilter value={difficulty} onChange={setDifficulty} count={examples.length} />
      {examples.map(ex => {
        const isHighlighted = ex.id === highlightedId;
        return (
        <div
          key={ex.id}
          ref={el => { cardRefs.current[ex.id] = el; }}
          style={{ ...card, ...(isHighlighted ? { border: '1px solid var(--primary)', boxShadow: 'var(--focus-ring)' } : {}) }}
        >
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', padding: '16px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge text={ex.badge} color="var(--accent)" />
                <DifficultyBadge d={ex.difficulty ?? 1} />
                <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>{ex.name}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '72ch' }}>
                <MathText>{ex.description}</MathText>
              </p>
            </div>
            <button
              onClick={() => onLoad(ex)}
              className="ui-btn ui-btn--primary"
              style={{ flexShrink: 0 }}
              title="Load this editable model"
            >
              <ExternalLink size={13} /> {ex.config.unit === 'hour' || ex.config.unit === 'day' ? 'Open Process Modeler' : 'Open Queue Modeler'}
            </button>
          </div>

          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Objectives */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-subtle)', marginBottom: 6 }}>
                Learning objectives
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ex.objectives.map((o, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}><MathText>{o}</MathText></li>
                ))}
              </ul>
            </div>

            {/* Parameters + expected KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 10 }}>
              {[
                { label: 'Parameters',    value: ex.parameters },
                { label: 'Expected KPIs', value: ex.expectedKpis },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '8px 12px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}><MathText>{value}</MathText></div>
                </div>
              ))}
            </div>
            {ex.assumptions && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Model assumptions: </strong><MathText>{ex.assumptions}</MathText>
              </p>
            )}
            <ExperimentSteps steps={ex.experiment} />
            <FormalModel model={compileModel(ex.nodes, ex.edges, { name: ex.name, unit: ex.config.unit })} />

          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── Challenges tab ────────────────────────────────────────────────────────────

function ChallengesTab({
  onLoadExample,
}: {
  onLoadExample: (ex: ExampleModel) => void;
}) {
  const [completed, setCompleted] = useState<Set<string>>(readCompletedChallenges);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [hintsShown, setHintsShown] = useState<Record<string, number>>({});
  const [difficulty, setDifficulty] = useState<DifficultyFilterValue>('all');
  const challenges = CHALLENGES.filter(ch => difficulty === 'all' || String(ch.difficulty) === difficulty);

  const markComplete = (id: string) => {
    setCompleted(prev => {
      const next = new Set([...prev, id]);
      savePreference('des-challenges', JSON.stringify([...next]));
      return next;
    });
  };

  const handleSubmit = (ch: Challenge) => {
    setSubmitted(s => ({ ...s, [ch.id]: true }));
    const idx = selected[ch.id];
    if (idx !== undefined && ch.options[idx].correct) {
      markComplete(ch.id);
    }
  };

  const showNextHint = (id: string, max: number) => {
    setHintsShown(h => ({ ...h, [id]: Math.min((h[id] ?? 0) + 1, max) }));
  };

  const nComplete = completed.size;
  const allDone = nComplete === CHALLENGES.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* All-complete banner */}
      {allDone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderRadius: 'var(--radius)',
          background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-elevated))',
          border: '1px solid var(--warning)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <Trophy size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>All challenges complete!</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              You've mastered the core DES concepts. Try loading examples from the Examples tab and experimenting with the Queue Modeler.
            </div>
          </div>
        </div>
      )}
      {/* Progress bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <Trophy size={16} style={{ color: nComplete === CHALLENGES.length ? 'var(--warning)' : 'var(--text-subtle)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {nComplete} / {CHALLENGES.length} challenges completed
        </span>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(nComplete / CHALLENGES.length) * 100}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 300ms' }} />
        </div>
        {[...Array(CHALLENGES.length)].map((_, i) => {
          const ch = CHALLENGES[i];
          const done = completed.has(ch.id);
          return done
            ? <CheckCircle2 key={i} size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
            : <Circle key={i} size={16} style={{ color: 'var(--border)', flexShrink: 0 }} />;
        })}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Solve the question, then load its related model to test your reasoning. The eight IT challenges also include hands-on experiments. Completion records the correct answer; experiments are self-guided.
      </p>
      <DifficultyFilter value={difficulty} onChange={setDifficulty} count={challenges.length} />
      {challenges.map(ch => {
        const isDone      = completed.has(ch.id);
        const isSubmitted = submitted[ch.id] ?? false;
        const selectedIdx = selected[ch.id];
        const isCorrect = isSubmitted && selectedIdx !== undefined && ch.options[selectedIdx].correct;
        const hintsN    = hintsShown[ch.id] ?? 0;

        return (
          <div key={ch.id} style={{ ...card, border: isDone ? '1px solid var(--success)' : '1px solid var(--border)' }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
              background: isDone ? 'color-mix(in srgb, var(--success) 8%, var(--bg-subtle))' : 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border)',
            }}>
              {isDone
                ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                : <Circle size={16} style={{ color: 'var(--border)', flexShrink: 0 }} />}
              <span style={{ flex: 1, fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>{ch.title}</span>
              <DifficultyBadge d={ch.difficulty} />
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Task */}
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.6, maxWidth: '72ch' }}>
                <MathText>{ch.task}</MathText>
              </p>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ch.options.map((opt, idx) => {
                  const isSelected = selectedIdx === idx;
                  const showResult = isSubmitted;
                  const bgColor = showResult && opt.correct
                    ? 'color-mix(in srgb, var(--success) 12%, var(--bg-subtle))'
                    : showResult && isSelected && !opt.correct
                    ? 'color-mix(in srgb, var(--error) 12%, var(--bg-subtle))'
                    : isSelected
                    ? 'var(--primary-soft)'
                    : 'var(--bg-subtle)';
                  const borderColor = showResult && opt.correct
                    ? 'var(--success)'
                    : showResult && isSelected && !opt.correct
                    ? 'var(--error)'
                    : isSelected
                    ? 'var(--primary)'
                    : 'var(--border)';

                  return (
                    <button
                      key={idx}
                      disabled={isSubmitted}
                      onClick={() => setSelected(s => ({ ...s, [ch.id]: idx }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', textAlign: 'left',
                        background: bgColor, border: `1px solid ${borderColor}`,
                        borderRadius: 'var(--radius-sm)', cursor: isSubmitted ? 'default' : 'pointer',
                        fontSize: 13, color: 'var(--text)', transition: 'background 100ms, border-color 100ms',
                      }}
                    >
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected || (showResult && opt.correct) ? borderColor : 'var(--border)'}`,
                        background: isSelected || (showResult && opt.correct) ? borderColor : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {(isSelected || (showResult && opt.correct)) && (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bg-elevated)' }} />
                        )}
                      </span>
                      <MathText>{opt.label}</MathText>
                    </button>
                  );
                })}
              </div>

              {/* Hints */}
              {!isSubmitted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ch.hints.slice(0, hintsN).map((hint, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 8, padding: '8px 12px',
                      background: 'var(--warning-soft)', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
                      borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-muted)',
                    }}>
                      <Lightbulb size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
                      <span>Hint {i + 1}: <MathText>{hint}</MathText></span>
                    </div>
                  ))}
                  {hintsN < ch.hints.length && (
                    <button
                      onClick={() => showNextHint(ch.id, ch.hints.length)}
                      style={{
                        alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12, color: 'var(--warning)', background: 'none',
                        border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                        borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer',
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--warning-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Lightbulb size={12} /> Show hint {hintsN + 1} / {ch.hints.length}
                    </button>
                  )}
                </div>
              )}

              {/* Submit / result */}
              {!isSubmitted ? (
                <button
                  onClick={() => handleSubmit(ch)}
                  disabled={selectedIdx === undefined}
                  className="ui-btn ui-btn--primary"
                  style={{ alignSelf: 'flex-start', ...(selectedIdx === undefined ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                >
                  Submit answer
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    background: isCorrect ? 'color-mix(in srgb, var(--success) 10%, var(--bg-subtle))' : 'color-mix(in srgb, var(--error) 10%, var(--bg-subtle))',
                    border: `1px solid ${isCorrect ? 'var(--success)' : 'var(--error)'}`,
                    borderRadius: 'var(--radius-sm)', fontSize: 13,
                    color: isCorrect ? 'var(--success)' : 'var(--error)',
                  }}>
                    {isCorrect ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    {isCorrect ? '✓ Correct!' : '✗ Not quite — see the explanation below.'}
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
                  }}>
                    <strong style={{ color: 'var(--text)' }}>Explanation: </strong><MathText>{ch.explanation}</MathText>
                  </div>
                  {!isCorrect && (
                    <button
                      onClick={() => {
                        setSubmitted(s => { const n = { ...s }; delete n[ch.id]; return n; });
                        setSelected(s => { const n = { ...s }; delete n[ch.id]; return n; });
                      }}
                      className="ui-btn"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}

              {/* Related example card */}
              {ch.exampleId && (() => {
                const relEx = EXAMPLES.find(e => e.id === ch.exampleId);
                if (!relEx) return null;
                return (
                  <React.Fragment>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 16px',
                      background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-sunken))',
                      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <FlaskConical size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', marginBottom: 2 }}>
                          Related example
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Badge text={relEx.badge} color="var(--accent)" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{relEx.name}</span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {relEx.description}
                        </p>
                      </div>
                      <button
                        onClick={() => onLoadExample(relEx)}
                        className="ui-btn ui-btn--primary"
                        style={{ flexShrink: 0, fontSize: 12 }}
                        title="Load this example into the Queue Modeler"
                      >
                        <ExternalLink size={12} /> Load in Editor
                      </button>
                    </div>
                    <ExperimentSteps steps={relEx.experiment} />
                  </React.Fragment>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Theory component ─────────────────────────────────────────────────────

export default function Theory({ onLoadExample, section, highlightedExampleId, onGoToExample }: TheoryProps) {
  const handleLoadExample = (ex: ExampleModel) => {
    onLoadExample(structuredClone(ex.nodes) as Node<NodeData>[], structuredClone(ex.edges) as Edge[], { ...ex.config });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 920 }}>
      {section === 'lessons'    && <LessonsTab onGoToExample={onGoToExample} />}
      {section === 'examples'   && <ExamplesTab onLoad={handleLoadExample} highlightedId={highlightedExampleId} />}
      {section === 'challenges' && <ChallengesTab onLoadExample={handleLoadExample} />}
    </div>
  );
}
