import React, { useMemo, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { generateSimPyCode } from '../lib/simpyGenerator';
import { generateNotebook } from '../lib/processExport';
import { DesModel } from '../lib/model';
import { RunConfig } from '../lib/engine';

interface CodeExportProps {
  model: DesModel | null;
  config: RunConfig;
}

export default function CodeExport({ model, config }: CodeExportProps) {
  const [copied, setCopied] = useState(false);

  const code = useMemo(
    () => (model ? generateSimPyCode(model, config) : ''),
    [model, config]
  );

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/x-python' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${model?.name ?? 'simulation'}.py`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadNotebook = () => {
    if (!model) return;
    const nb   = generateNotebook(model, config);
    const blob = new Blob([nb], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${model.name ?? 'simulation'}.ipynb`; a.click();
    URL.revokeObjectURL(url);
  };

  const mono: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 11,
    background: 'var(--bg-sunken)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '1px 5px', color: 'var(--text)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>SimPy + matplotlib (Python)</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Python 3.9+ · SimPy 4 · matplotlib</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handleCopy} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleDownload} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}} title="Download Python script">
            <Download size={13} /> .py
          </button>
          <button onClick={handleDownloadNotebook} disabled={!model} className="ui-btn" style={!model ? { opacity: 0.4, cursor: 'not-allowed' } : {}} title="Download Colab / Jupyter notebook">
            <Download size={13} /> .ipynb
          </button>
        </div>
      </div>
      <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
        <li><strong>Colab:</strong> download <code style={mono}>.ipynb</code> → open in <a href="https://colab.research.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google Colab</a>. The first cell installs all packages automatically.</li>
        <li><strong>Local:</strong> install dependencies — <code style={mono}>pip install simpy matplotlib</code> — then run the <code style={mono}>.py</code> script.</li>
        <li>The script prints replication summaries as JSON and saves a <code style={mono}>_results.png</code> chart (utilisation + entity times).</li>
      </ol>
    </div>
  );
}
