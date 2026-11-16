import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { runFactory, runInventory, CaseResult } from '../lib/caseStudyEngine';
import { caseFormalRows } from '../lib/caseStudies';
import { FormalSpecification } from './FormalModel';

export default function CaseStudyLab({ kind }: { kind: 'factory' | 'inventory' }) {
  const inventory = kind === 'inventory';
  const [params, setParams] = useState<Record<string, number>>(inventory
    ? { cutoff: 10, target: 30, horizon: 35, seed: 3 }
    : { repairers: 3, spares: 20, horizon: 2080, seed: 0 });
  const [result, setResult] = useState<CaseResult | null>(null);
  const [baseline, setBaseline] = useState<CaseResult | null>(null);
  const [error, setError] = useState('');
  const fields = inventory
    ? [['cutoff', 'Reorder point s', 1, 1000], ['target', 'Target stock S', 1, 1000], ['horizon', 'Horizon (days)', 1, 10000], ['seed', 'Seed', 0, 4294967295]]
    : [['repairers', 'Repairers', 1, 50], ['spares', 'Initial spares', 0, 100], ['horizon', 'Horizon (working hours)', 1, 10000], ['seed', 'Seed', 0, 4294967295]];
  const stale = result && JSON.stringify(params) !== JSON.stringify(result.config);
  const rows = useMemo(() => caseFormalRows(kind, params), [kind, params]);
  return <div className="case-lab">
    <div className="case-lab-controls">
      {fields.map(([key, label, min, max]) => <label key={key}>
        {label}<input type="number" min={min} max={max} step={1} value={Number.isNaN(params[key]) ? '' : params[key]}
          onChange={e => { setParams(p => ({ ...p, [key]: e.target.valueAsNumber })); setError(''); }} />
      </label>)}
      <button className="ui-btn ui-btn--primary" onClick={() => {
        try { setResult(inventory ? runInventory(params) : runFactory(params)); setError(''); }
        catch (e) { setError((e as Error).message); }
      }}>Run {inventory ? 'Inventory' : 'Factory'}</button>
      {result && <button className="ui-btn" onClick={() => setBaseline(result)}>Save as baseline</button>}
    </div>
    {error && <p role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
    <FormalSpecification rows={rows} unit={inventory ? 'day' : 'working hour'} />
    {result && <>
      <p role="status">{stale ? 'Parameters changed — run again to update results. ' : ''}Results: seed {result.config.seed}, {result.config.horizon} {inventory ? 'days' : 'working hours'}. One replication; use several seeds before choosing a policy.</p>
      <div className="case-metrics">{result.metrics.map((m, i) => <div className="kpi-tile" key={m.label}>
        <div className="kpi-label">{m.label}</div><div className="kpi-value">{m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div><div className="kpi-unit">{m.unit}</div>
        {baseline && <div className="case-baseline">Baseline: {baseline.metrics[i].value.toFixed(2)} {m.unit}</div>}
      </div>)}</div>
      {baseline && <p>Baseline parameters: {Object.entries(baseline.config).map(([k,v]) => `${k}=${v}`).join(', ')}.</p>}
      <div style={{ height: 300, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={result.points} margin={{ top: 15, right: 15, left: 0, bottom: 20 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="time" type="number" domain={[0, result.config.horizon]} tickFormatter={v => Number(v).toFixed(0)} label={{ value: inventory ? 'Days' : 'Working hours', position: 'insideBottom', offset: -10 }} />
            <YAxis allowDecimals={false} /><Tooltip contentStyle={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text)' }} labelFormatter={v => `Time: ${Number(v).toFixed(2)}`} /><Legend />
            <Line type="stepAfter" dataKey="stock" name={inventory ? 'Stock' : 'Spares'} stroke="var(--primary)" dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="queue" name={inventory ? 'Units on order' : 'Repair queue'} stroke="var(--accent)" dot={false} isAnimationActive={false} />
            {!inventory && <Line type="stepAfter" dataKey="down" name="Down machines" stroke="var(--error)" dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details><summary>Event log · {result.points.length} records</summary><div className="case-event-log">
        <table><thead><tr><th>Time</th><th>Event</th><th>{inventory ? 'Stock' : 'Spares'}</th><th>{inventory ? 'On order' : 'Repair queue'}</th></tr></thead>
          <tbody>{result.points.slice(-200).map((point, i) => <tr key={i}><td>{point.time.toFixed(3)}</td><td>{point.event}</td><td>{point.stock}</td><td>{point.queue}</td></tr>)}</tbody>
        </table><p>Showing the last {Math.min(result.points.length, 200)} records.</p>
      </div></details>
    </>}
  </div>;
}
