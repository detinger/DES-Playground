import { isExtendedModel } from '../lib/model';
import ProcessFormalView from './ProcessFormalView';
import { useMemo } from 'react';
import { DesModel } from '../lib/model';
import { formalModelRows, FormalRow } from '../lib/formalModel';
import { MathFormula } from './Math';

export function FormalSpecification({ rows, unit }: { rows: FormalRow[]; unit: string }) {
  return (
    <div className="formal-model">
      <div className="formal-model-header">
        Formal model <span>Activity-cycle notation · time in {unit}s</span>
      </div>
      <div className="formal-model-body">
        {rows.map((row, i) => (
          <div key={i} className="formal-model-row">
            <strong>{row.label}</strong>
            <MathFormula tex={row.tex} display />
            {row.note && <p>{row.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FormalModel({ model }: { model: DesModel }) {
  const rows = useMemo(() => isExtendedModel(model) ? [] : formalModelRows(model), [model]);
  if (isExtendedModel(model)) {
    return (
      <div className="formal-model">
        <div className="formal-model-header">
          Formal model <span>Process specification · {model.unit}s</span>
        </div>
        <ProcessFormalView model={model} />
      </div>
    );
  }
  return <FormalSpecification rows={rows} unit={model.unit} />;
}
