import { MathText } from './Math';
import React, { useState } from 'react';
import { ValidationResult, ValidationIssue, Severity } from '../lib/model';
import { AlertTriangle, Info, Lightbulb, ChevronDown, ChevronRight, XCircle } from 'lucide-react';

interface ValidationPanelProps {
  result: ValidationResult;
  onSelectNode?: (nodeId: string) => void;
}

const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'recommendation', 'info'];

const SEVERITY_META: Record<Severity, { icon: React.ReactNode; label: string; colorVar: string; bgVar: string }> = {
  error: {
    icon: <XCircle size={14} />,
    label: 'Error',
    colorVar: 'var(--error)',
    bgVar: 'var(--error-soft)',
  },
  warning: {
    icon: <AlertTriangle size={14} />,
    label: 'Warning',
    colorVar: 'var(--warning)',
    bgVar: 'var(--warning-soft)',
  },
  recommendation: {
    icon: <Lightbulb size={14} />,
    label: 'Recommendation',
    colorVar: 'var(--accent)',
    bgVar: 'var(--primary-soft)',
  },
  info: {
    icon: <Info size={14} />,
    label: 'Info',
    colorVar: 'var(--text-muted)',
    bgVar: 'var(--bg-subtle)',
  },
};

function IssueRow({ issue, onSelectNode }: { issue: ValidationIssue; onSelectNode?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[issue.severity];

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      transition: 'box-shadow 120ms',
    }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '9px 12px',
          background: open ? 'var(--bg-subtle)' : 'var(--bg-elevated)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'background 100ms',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
      >
        <span style={{ color: meta.colorVar, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.4 }}>
          <MathText>{issue.title}</MathText>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {issue.nodeId && onSelectNode && (
            <span
              onClick={e => { e.stopPropagation(); onSelectNode(issue.nodeId!); }}
              style={{
                fontSize: 11, color: 'var(--primary)', cursor: 'pointer',
                padding: '2px 7px', borderRadius: 4,
                border: '1px solid var(--primary)',
                lineHeight: 1.6,
              }}
            >
              Select node
            </span>
          )}
          <span style={{ color: 'var(--text-subtle)' }}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        </span>
      </button>

      {/* Detail panel */}
      {open && (
        <div style={{
          padding: '10px 12px 12px 36px',
          background: meta.bgVar,
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>Why:</span> <MathText>{issue.explanation}</MathText>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>Consequence:</span> <MathText>{issue.consequence}</MathText>
          </div>
          {issue.suggestedFix && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 650, color: 'var(--text)' }}>Fix:</span> <MathText>{issue.suggestedFix}</MathText>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <span style={{
              fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em',
              padding: '2px 7px', borderRadius: 4,
              color: meta.colorVar, background: 'var(--bg-elevated)',
              border: `1px solid ${meta.colorVar}`,
            }}>
              {issue.severity}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.07em',
              padding: '2px 7px', borderRadius: 4,
              color: 'var(--text-subtle)', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {issue.category}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ValidationPanel({ result, onSelectNode }: ValidationPanelProps) {
  const { issues, hasErrors, hasWarnings } = result;

  const errorCount  = issues.filter(i => i.severity === 'error').length;
  const warnCount   = issues.filter(i => i.severity === 'warning').length;
  const otherCount  = issues.filter(i => i.severity !== 'error' && i.severity !== 'warning').length;

  const sorted = [...issues].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  if (issues.length === 0) return null;

  const summaryBg = hasErrors
    ? 'var(--error-soft)'
    : hasWarnings
      ? 'var(--warning-soft)'
      : 'var(--bg-subtle)';
  const summaryBorder = hasErrors
    ? 'var(--error)'
    : hasWarnings
      ? 'var(--warning)'
      : 'var(--border)';

  return (
    <div style={{
      border: `1px solid ${summaryBorder}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 16px',
        background: summaryBg,
        borderBottom: `1px solid ${summaryBorder}`,
      }}>
        {hasErrors
          ? <XCircle size={15} style={{ color: 'var(--error)', flexShrink: 0 }} />
          : <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        }
        <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)', flex: 1 }}>
          Validation {hasErrors ? 'failed' : 'passed with warnings'}
        </span>
        <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
          {errorCount > 0 && (
            <span style={{ color: 'var(--error)', fontWeight: 650 }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
          {warnCount > 0 && (
            <span style={{ color: 'var(--warning)', fontWeight: 650 }}>{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>
          )}
          {otherCount > 0 && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{otherCount} note{otherCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Issue list */}
      <div style={{
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 6,
        maxHeight: 320, overflowY: 'auto',
      }}>
        {sorted.map(issue => (
          <IssueRow key={issue.id} issue={issue} onSelectNode={onSelectNode} />
        ))}
      </div>
    </div>
  );
}
