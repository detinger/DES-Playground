import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Play, Download, AlertTriangle } from 'lucide-react';
import { generateSimmerCode } from '../lib/simmerGenerator';
import { DesModel } from '../lib/model';
import { RunConfig } from '../lib/engine';

interface SimmerCodeExportProps {
  model: DesModel | null;
  config: RunConfig;
}

export default function SimmerCodeExport({ model, config }: SimmerCodeExportProps) {
  const [code, setCode]           = useState('');
  const [codeModel, setCodeModel] = useState<DesModel | null>(null);
  const [copied, setCopied]       = useState(false);

  const isStale = code !== '' && model !== null && model !== codeModel;

  const handleGenerate = () => {
    if (!model) return;
    setCode(generateSimmerCode(model, config));
    setCodeModel(model);
  };

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

  return (
    <div>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Header — title + stale badge */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-subtle)', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--text)' }}>R simmer Code Export</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
              {!model
                ? 'Run the simulation first to enable code generation'
                : code
                ? `Generated from '${model.name}' · R 4.1+ / simmer`
                : 'Generate executable R simulation code'}
            </div>
          </div>
          {isStale && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--warning)',
              background: 'var(--warning-soft)', border: '1px solid var(--warning)',
              borderRadius: 4, padding: '3px 8px',
            }}>
              <AlertTriangle size={11} /> Model updated — regenerate
            </span>
          )}
        </div>

        {/* Code pane with floating action buttons top-right */}
        <div style={{ position: 'relative', background: 'var(--bg-sunken)', minHeight: 280 }}>
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <button
              onClick={handleGenerate}
              disabled={!model}
              className="ui-btn ui-btn--primary"
              style={!model ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              <Play size={13} />
              {code ? 'Regenerate' : 'Generate'}
            </button>
            <button onClick={handleCopy} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={handleDownload} disabled={!code} className="ui-btn" style={!code ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
              <Download size={13} /> .R
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {code ? (
              <SyntaxHighlighter
                language="r"
                style={document.documentElement.getAttribute('data-theme') === 'light' ? vs : vscDarkPlus}
                customStyle={{ margin: 0, padding: '16px', background: 'transparent', fontSize: 12, lineHeight: 1.55 }}
                showLineNumbers
              >
                {code}
              </SyntaxHighlighter>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'var(--text-subtle)', fontStyle: 'italic', fontSize: 13 }}>
                {model ? 'Click "Generate" to create the R simmer script from your model.' : 'Run the simulation first, then click Generate.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* How-to card */}
      <div style={{ marginTop: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', marginBottom: 10 }}>How to run in RStudio or R console</div>
        <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <li>Ensure R 4.1+ is installed or use RStudio / Posit Cloud.</li>
          <li>Install packages: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text)' }}>install.packages(c("simmer", "jsonlite"))</code></li>
          <li>Download the generated script and source it, or paste into an R console.</li>
          <li>The script uses a simmer trajectory to advance the ordered process calendar and prints model measurements as JSON. R uses its own random stream.</li>
        </ol>
      </div>
    </div>
  );
}
