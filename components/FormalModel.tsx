import React, { useMemo, useState } from 'react';
import { DesModel } from '../lib/model';
import { formalModelRows, FormalRow } from '../lib/formalModel';
import { MathFormula } from './Math';

export function FormalSpecification({ rows, unit, open = false }: { rows: FormalRow[]; unit: string; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <details className="formal-model" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
    <summary>Formal model <span>Activity-cycle notation · time in {unit}s</span></summary>
    {expanded && <div className="formal-model-body">
      {rows.map((row, i) => <div key={i} className="formal-model-row">
        <strong>{row.label}</strong>
        <MathFormula tex={row.tex} display />
        {row.note && <p>{row.note}</p>}
      </div>)}
    </div>}
  </details>;
}
export default function FormalModel({ model }: { model: DesModel }) {
  const rows = useMemo(() => formalModelRows(model), [model]);
  return <FormalSpecification rows={rows} unit={model.unit} />;
}
