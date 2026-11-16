import React, { useMemo, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { generateSimmerCode } from '../lib/simmerGenerator';
import { DesModel } from '../lib/model';
import { RunConfig } from '../lib/engine';

interface SimmerCodeExportProps {
  model: DesModel | null;
  config: RunConfig;
}

export default function SimmerCodeExport({ model, config }: SimmerCodeExportProps) {
  const [copied, setCopied] = useState(false);

  const code = useMemo(
    () => (model ? generateSimmerCode(model, config) : ''),
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
    const blob = new Blob([code], { type: 'text/x-r-source' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${model?.name ?? 'simulation'}.R`; a.click();
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
          <div style={{ fontWeight: 650, fontSize: 13, color: 'var(--text)' }}>simmer + ggplot2 (R)</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>R 4.1+ · simmer · ggplot2</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handleCopy} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleDownload} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}} title="Download R script">
            <Download size={13} /> .R
          </button>
        </div>
      </div>
      <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
        <li>Missing packages are installed automatically when the script first runs.</li>
        <li>Run in RStudio, Posit Cloud, or the R console: <code style={mono}>source("simulation.R")</code></li>
        <li>The script prints model measurements as JSON and saves ggplot2 charts as PNG files.</li>
        <li>R uses its own PRNG — traces differ from Python at the same seed, but distributions match.</li>
      </ol>
    </div>
  );
}
