import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams'] }), OutputJax: new SVG({ fontCache: 'none' }) });
const cache = new Map<string, string>();
export function renderMath(tex: string, display: boolean): string {
  const key = `${display}:${tex}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const svg = adaptor.outerHTML(document.convert(tex, { display }));
  if (cache.size > 1000) cache.clear();
  cache.set(key, svg);
  return svg;
}
