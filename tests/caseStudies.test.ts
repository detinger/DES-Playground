import assert from 'node:assert/strict';
import { runFactory, runInventory } from '../lib/caseStudyEngine';
import { CASE_STUDIES, caseFormalRows } from '../lib/caseStudies';
import { EXAMPLES, LESSONS, CHALLENGES } from '../lib/theoryContent';
import { compileModel } from '../lib/compiler';
import { formalModelRows } from '../lib/formalModel';
import { renderMath } from '../lib/mathRenderer';
import { mathProse } from '../lib/mathProse';
import { validateModel } from '../lib/validator';

const factory = { repairers: 3, spares: 20, horizon: 2080, seed: 0 };
const inventory = { cutoff: 10, target: 30, horizon: 35, seed: 3 };
const get = (result: ReturnType<typeof runFactory>, name: string) => result.metrics.find(m => m.label === name)!.value;
for (const seed of [0, 1, 3, 42, 100]) {
  const p = { ...inventory, seed };
  const r = runInventory(p);
  assert.deepEqual(r, runInventory(p), 'Inventory seed is reproducible');
  assert(r.points.every(x => x.stock >= 0 && x.stock <= p.target && x.queue >= 0));
  assert.equal(r.points.at(-1)!.time, p.horizon);
  const area = r.points.slice(0, -1).reduce((sum, point, i) => sum + point.stock * (r.points[i + 1].time - point.time), 0);
  assert(Math.abs(get(r, 'Holding cost') - 2 * area) < 1e-8, 'Holding cost is the exact stock integral');
  assert.equal(get(r, 'Operating balance'), get(r, 'Revenue') - get(r, 'Ordering cost') - get(r, 'Holding cost'));
  for (const spares of [0, 1, 20]) {
    const f = runFactory({ ...factory, seed, spares });
    assert.deepEqual(f, runFactory({ ...factory, seed, spares }));
    assert(f.points.every(x => x.stock >= 0 && x.stock <= spares && x.down >= 0 && x.down <= 50));
    const downArea = f.points.slice(0, -1).reduce((sum, point, i) => sum + point.down * (f.points[i + 1].time - point.time), 0);
    assert(Math.abs(downArea - get(f, 'Downtime')) < 1e-8);
    assert.equal(get(f, 'Total cost'), get(f, 'Staff and spares') + 20 * downArea);
  }
}
const short = runFactory({ ...factory, horizon: 8 });
assert.equal(get(short, 'Failures'), 0);
assert.equal(get(short, 'Availability'), 100);
assert.equal(get(short, 'Total cost'), 690);
assert.throws(() => runInventory({ ...inventory, cutoff: 31 }));
assert.throws(() => runFactory({ ...factory, repairers: 0 }));
assert.throws(() => runInventory({ ...inventory, seed: NaN }));
const clinic = CASE_STUDIES.find(x => x.id === 'clinic')!;
assert(!validateModel(compileModel(clinic.nodes, clinic.edges)).hasErrors);
assert.equal(clinic.nodes[1].data.distribution.stdDev, 1);
let formulas = 0;
function check(tex: string) {
  const svg = renderMath(tex, true);
  assert(svg.includes('<svg'), tex);
  assert(!svg.includes('data-mml-node="merror"'), `Invalid TeX: ${tex}`);
  formulas++;
}
for (const ex of EXAMPLES.filter(x => !x.caseStudy)) {
  for (const row of formalModelRows(compileModel(ex.nodes, ex.edges))) check(row.tex);
}
for (const row of [...caseFormalRows('factory', factory), ...caseFormalRows('inventory', inventory)]) check(row.tex);
function scan(value: unknown) {
  if (typeof value === 'string') {
    const prose = value.includes('\\(') ? value : mathProse(value);
    for (const match of prose.matchAll(/\\\((.*?)\\\)/g)) check(match[1]);
  } else if (Array.isArray(value)) value.forEach(scan);
  else if (value && typeof value === 'object') Object.values(value).forEach(scan);
}
scan([EXAMPLES, LESSONS, CHALLENGES]);
assert.equal(mathProse('The queue grows without bound.'), 'The queue grows without bound.');
console.log(`Passed case-study invariants, accounting, reproducibility, invalid inputs, clinic validation and ${formulas} MathJax formulas.`);

// Render the React surfaces too: this catches malformed props or missing example wiring.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Theory from '../components/Theory';
import CaseStudyLab from '../components/CaseStudyLab';
for (const section of ['examples', 'lessons', 'challenges'] as const) {
  const html = renderToStaticMarkup(React.createElement(Theory, { section, onLoadExample: () => {}, highlightedExampleId: null, onGoToExample: () => {} }));
  for (const match of html.matchAll(/role="math" aria-label="([^"]*)"/g)) {
    check(match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'"));
  }
  if (section === 'examples') for (const name of ['Clinic', 'Factory', 'Inventory']) assert(html.includes(name));
  if (section === 'lessons') assert(html.includes('Formal Models'));
}
for (const kind of ['factory', 'inventory'] as const) {
  const html = renderToStaticMarkup(React.createElement(CaseStudyLab, { kind }));
  assert(html.includes('Formal model'));
  assert(html.includes(kind === 'factory' ? 'Run Factory' : 'Run Inventory'));
}
console.log('React lessons, examples, challenges and both case-study labs render successfully.');
