import { mathProse } from '../lib/mathProse';
import React, { useEffect, useState } from 'react';

const loadRenderer = () => import('../lib/mathRenderer');
export function MathFormula({ tex, display = false }: { tex: string; display?: boolean }) {
  const [rendered, setRendered] = useState<{ tex: string; html: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadRenderer().then(({ renderMath }) => {
      const html = renderMath(tex, display);
      if (!cancelled) setRendered({ tex, html });
    }).catch(() => { if (!cancelled) setRendered(null); });
    return () => { cancelled = true; };
  }, [tex, display]);
  return <span className={display ? 'math-formula math-display' : 'math-formula'} role="math" aria-label={tex}>
    {rendered?.tex === tex ? <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: rendered.html }} /> : <span>{tex}</span>}
  </span>;
}

/** Explicit TeX delimiters in authored prose; never scan or mutate React's DOM. */
export function MathText({ children }: { children: string }) {
  const content = children.includes('\\(') || children.includes('\\[') ? children : mathProse(children);
  const parts = content.split(/(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);
  return <>{parts.map((part, i) => part.startsWith('\\(') || part.startsWith('\\[')
    ? <MathFormula key={i} tex={part.slice(2, -2)} display={part.startsWith('\\[')} />
    : <React.Fragment key={i}>{part}</React.Fragment>)}</>;
}
