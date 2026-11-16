import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, FlaskConical, Trophy, ChevronDown, ChevronRight, CheckCircle2, Circle, Lightbulb, ExternalLink } from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { NodeData } from '../types';
import { LESSONS, EXAMPLES, CHALLENGES, ExampleModel, Challenge } from '../lib/theoryContent';

interface TheoryProps {
  onLoadExample: (nodes: Node<NodeData>[], edges: Edge[], config?: ExampleModel['config']) => void;
  initialSection?: Section;
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

const inlineCode: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '1px 6px',
  color: 'var(--text)',
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
    3: ['Advanced',     'var(--error)'],
  };
  return <Badge text={map[d][0]} color={map[d][1]} />;
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
  const W = 500, tMax = 18;
  const tx = (t: number) => 44 + (t / tMax) * 418;
  const events = [
    { t: 2,  label: 'Arrival',    color: 'var(--chart-1)', above: true },
    { t: 2,  label: 'Svc Start',  color: 'var(--success)', above: false },
    { t: 7,  label: 'Arrival',    color: 'var(--chart-1)', above: true },
    { t: 9,  label: 'Svc End',    color: 'var(--warning)', above: false },
    { t: 14, label: 'Departure',  color: 'var(--error)',   above: true },
  ];
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Simulation clock — jumps between events, frozen between them</div>
      <svg viewBox={`0 0 ${W} 105`} style={{ width: '100%', height: 105 }}>
        <line x1={42} y1={58} x2={W - 10} y2={58} stroke="var(--border)" strokeWidth={2} />
        <polygon points={`${W-10},54 ${W},58 ${W-10},62`} fill="var(--border)" />
        <text x={W - 6} y={62} fontSize={10} fill="var(--text-subtle)">t</text>
        {/* gap annotation */}
        <text x={tx(4.8)} y={53} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">← idle gap →</text>
        {events.map((ev, i) => {
          const x = tx(ev.t) + (i === 1 ? 7 : 0);
          return (
            <g key={i}>
              <line x1={x} y1={ev.above ? 44 : 58} x2={x} y2={ev.above ? 58 : 72} stroke={ev.color} strokeWidth={1.5} />
              <circle cx={x} cy={58} r={5} fill={ev.color} />
              <text x={x} y={ev.above ? 37 : 86} fontSize={8.5} fill={ev.color} textAnchor="middle">{ev.label}</text>
              <text x={x} y={ev.above ? 27 : 97} fontSize={8} fill="var(--text-subtle)" textAnchor="middle">t={ev.t}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DistributionViz() {
  const W = 500, H = 110, xMax = 20, mean = 5, lam = 1 / mean;
  const tx = (x: number) => 48 + (x / xMax) * 418;
  const ty = (y: number) => 95 - (y / (lam * 1.05)) * 82;
  const pts: string[] = [];
  for (let x = 0; x <= xMax; x += 0.4) pts.push(`${tx(x)},${ty(lam * Math.exp(-lam * x))}`);
  const curve = 'M' + pts.join(' L');
  const fill  = curve + ` L${tx(xMax)},95 L${tx(0)},95 Z`;
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Exponential interarrival times — mean = 5 min, rate λ = 0.2/min</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {[0, 5, 10, 15, 20].map(x => (
          <g key={x}>
            <line x1={tx(x)} y1={12} x2={tx(x)} y2={95} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3" />
            <text x={tx(x)} y={H - 2} fontSize={9} fill="var(--text-subtle)" textAnchor="middle">{x}</text>
          </g>
        ))}
        <line x1={48} y1={95} x2={W - 10} y2={95} stroke="var(--chart-axis,var(--border))" strokeWidth={1.5} />
        <line x1={48} y1={10} x2={48}     y2={95} stroke="var(--chart-axis,var(--border))" strokeWidth={1.5} />
        <path d={fill} fill="var(--primary)" opacity={0.12} />
        <path d={curve} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
        <line x1={tx(mean)} y1={28} x2={tx(mean)} y2={95} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4,3" />
        <text x={tx(mean) + 5} y={42} fontSize={9} fill="var(--accent)">mean = 5</text>
        <text x={tx(11)}     y={35} fontSize={9} fill="var(--primary-strong,var(--primary))">P(X ≥ t) = e^(−t/5)</text>
        <text x={W - 14}    y={94} fontSize={9} fill="var(--text-subtle)">t</text>
        <text x={30}        y={16} fontSize={9} fill="var(--text-subtle)">f(t)</text>
      </svg>
    </div>
  );
}

function StabilityViz() {
  const W = 500, H = 160, lqMax = 20;
  const tx = (r: number) => 52 + r * 390;
  const ty = (lq: number) => 138 - Math.min(lq / lqMax, 1) * 118;
  const pts: string[] = [];
  for (let r = 0; r <= 0.972; r += 0.008) pts.push(`${tx(r)},${ty(r * r / (1 - r))}`);
  const curve = 'M' + pts.join(' L');
  const kp = [{ r: 0.5, lq: 0.5 }, { r: 0.8, lq: 3.2 }, { r: 0.9, lq: 8.1 }];
  return (
    <div style={vizBox}>
      <div style={vizTitle}>M/M/1 steady state — Lq = ρ²/(1−ρ) explodes as utilisation approaches 100%</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(r => (
          <g key={r}>
            <line x1={tx(r)} y1={18} x2={tx(r)} y2={138} stroke="var(--border)" strokeWidth={0.5} />
            <text x={tx(r)} y={H - 4} fontSize={8.5} fill="var(--text-subtle)" textAnchor="middle">{r.toFixed(1)}</text>
          </g>
        ))}
        {[0, 5, 10, 15, 20].map(lq => (
          <g key={lq}>
            <line x1={52} y1={ty(lq)} x2={442} y2={ty(lq)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={46} y={ty(lq) + 4} fontSize={8.5} fill="var(--text-subtle)" textAnchor="end">{lq}</text>
          </g>
        ))}
        <rect x={tx(1.0) - 54} y={18} width={54} height={120} fill="var(--error)" opacity={0.07} />
        <text x={tx(0.985)} y={30} fontSize={8} fill="var(--error)" textAnchor="end">unstable</text>
        <line x1={52} y1={138} x2={445} y2={138} stroke="var(--border)" strokeWidth={1.5} />
        <line x1={52} y1={18}  x2={52}  y2={138} stroke="var(--border)" strokeWidth={1.5} />
        <path d={curve} fill="none" stroke="var(--chart-2,var(--accent))" strokeWidth={2.5} />
        {kp.map(({ r, lq }) => {
          const x = tx(r), y = ty(lq);
          return (
            <g key={r}>
              <circle cx={x} cy={y} r={4} fill="var(--chart-2,var(--accent))" />
              <line x1={x} y1={y - 5} x2={x} y2={y - 20} stroke="var(--chart-2,var(--accent))" strokeWidth={1} strokeDasharray="2,2" />
              <text x={x} y={y - 23} fontSize={8} fill="var(--chart-2,var(--accent))" textAnchor="middle">ρ={r}</text>
              <text x={x} y={y - 13} fontSize={8} fill="var(--chart-2,var(--accent))" textAnchor="middle">Lq={lq}</text>
            </g>
          );
        })}
        <text x={447} y={137} fontSize={9} fill="var(--text-subtle)">ρ</text>
        <text x={36}  y={18}  fontSize={9} fill="var(--text-subtle)">Lq</text>
      </svg>
    </div>
  );
}

function EntityLifecycleViz() {
  const steps = [
    { label: 'Arrival',   sub: 'entity born',       color: 'var(--chart-1)' },
    { label: 'Queue',     sub: 'waiting…',          color: 'var(--warning)' },
    { label: 'Svc Start', sub: 'server claimed',     color: 'var(--success)' },
    { label: 'Svc End',   sub: 'server released',    color: 'var(--accent)'  },
    { label: 'Departure', sub: 'entity leaves',      color: 'var(--error)'   },
  ];
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Entity lifecycle — 5 event kinds per entity</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 10px', borderRadius: 6, minWidth: 70, flexShrink: 0,
              background: `color-mix(in srgb, ${s.color} 14%, var(--bg-elevated))`,
              border: `1px solid color-mix(in srgb, ${s.color} 38%, transparent)`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 650, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ fontSize: 9, color: 'var(--text-subtle)', textAlign: 'center' }}>{s.sub}</span>
            </div>
            {i < steps.length - 1 && <span style={{ color: 'var(--text-subtle)', fontSize: 16, flexShrink: 0 }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
        Wq = Σ queue waits per station &nbsp;·&nbsp; W = departure − arrival &nbsp;·&nbsp; Wq ≤ W always
      </div>
    </div>
  );
}

function LittlesLawViz() {
  return (
    <div style={vizBox}>
      <div style={vizTitle}>Little's Law — L = λW (holds for any stable system)</div>
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
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginTop: 2, fontWeight: 650 }}>L = λ · W</div>
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
          <div>λ = 0.18 / min</div>
          <div>W = 8.5 min</div>
          <div style={{ color: 'var(--primary)', fontWeight: 650 }}>L = 1.53 entities</div>
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
                    {p}
                  </p>
                ))}

                <LessonViz level={lesson.level} />

                {/* Key fact */}
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <Lightbulb size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--primary-strong)', lineHeight: 1.5 }}>
                    {lesson.keyFact}
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
                    {lesson.misconception.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--success)' }}>Correction: </strong>{lesson.misconception.fix}
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

  useEffect(() => {
    if (highlightedId && cardRefs.current[highlightedId]) {
      cardRefs.current[highlightedId]!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Pre-configured models illustrating key queueing concepts. Click <strong>Load in Editor</strong> to send the model to the Model Explorer, then click <strong>Run</strong> to simulate and compare results with the M/M/c Theory panel.
      </p>
      {EXAMPLES.map(ex => {
        const isHighlighted = ex.id === highlightedId;
        return (
        <div
          key={ex.id}
          ref={el => { cardRefs.current[ex.id] = el; }}
          style={{ ...card, ...(isHighlighted ? { border: '1px solid var(--primary)', boxShadow: 'var(--focus-ring)' } : {}) }}
        >
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge text={ex.badge} color="var(--accent)" />
                <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>{ex.name}</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '72ch' }}>
                {ex.description}
              </p>
            </div>
            <button
              onClick={() => onLoad(ex)}
              className="ui-btn ui-btn--primary"
              style={{ flexShrink: 0 }}
              title="Load this model into the Model Explorer"
            >
              <ExternalLink size={13} /> Load in Editor
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
                  <li key={i} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{o}</li>
                ))}
              </ul>
            </div>

            {/* Parameters + expected KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Parameters',    value: ex.parameters },
                { label: 'Expected KPIs', value: ex.expectedKpis },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: 'var(--bg-sunken)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '8px 12px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ── Challenges tab ────────────────────────────────────────────────────────────

function ChallengesTab() {
  const [completed, setCompleted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('des-challenges') ?? '[]')); }
    catch { return new Set(); }
  });
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [hintsShown, setHintsShown] = useState<Record<string, number>>({});

  const markComplete = (id: string) => {
    setCompleted(prev => {
      const next = new Set([...prev, id]);
      localStorage.setItem('des-challenges', JSON.stringify([...next]));
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
              You've mastered the core DES concepts. Try loading examples from the Examples tab and experimenting with the Model Explorer.
            </div>
          </div>
        </div>
      )}
      {/* Progress bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
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

      {CHALLENGES.map(ch => {
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
                {ch.task}
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
                      {opt.label}
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
                      <span>Hint {i + 1}: {hint}</span>
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
                    <strong style={{ color: 'var(--text)' }}>Explanation: </strong>{ch.explanation}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Theory component ─────────────────────────────────────────────────────

export default function Theory({ onLoadExample, initialSection = 'lessons' }: TheoryProps) {
  const [section, setSection] = useState<Section>(initialSection);
  const [pendingExampleId, setPendingExampleId] = useState<string | null>(null);
  const [highlightedExampleId, setHighlightedExampleId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingExampleId) {
      setSection('examples');
      setHighlightedExampleId(pendingExampleId);
      setPendingExampleId(null);
    }
  }, [pendingExampleId]);

  // Clear highlight when user manually switches away from examples
  useEffect(() => {
    if (section !== 'examples') setHighlightedExampleId(null);
  }, [section]);

  const handleLoadExample = (ex: ExampleModel) => {
    onLoadExample(ex.nodes as Node<NodeData>[], ex.edges as Edge[], ex.config);
  };

  const goToExample = (id: string) => {
    setPendingExampleId(id);
  };

  const tabs: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'lessons',    label: 'Lessons',    icon: <BookOpen size={14} /> },
    { id: 'examples',   label: 'Examples',   icon: <FlaskConical size={14} /> },
    { id: 'challenges', label: 'Challenges', icon: <Trophy size={14} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 920 }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 4, boxShadow: 'var(--shadow-sm)',
        width: 'fit-content',
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 16px', borderRadius: 'calc(var(--radius) - 2px)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: section === t.id ? 'var(--primary)' : 'transparent',
              color: section === t.id ? 'var(--text-on-primary)' : 'var(--text-muted)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { if (section !== t.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (section !== t.id) e.currentTarget.style.background = 'transparent'; }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {section === 'lessons'    && <LessonsTab onGoToExample={goToExample} />}
      {section === 'examples'   && <ExamplesTab onLoad={handleLoadExample} highlightedId={highlightedExampleId} />}
      {section === 'challenges' && <ChallengesTab />}
    </div>
  );
}
