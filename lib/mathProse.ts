/** Compatibility for existing educational prose. New content should use explicit TeX delimiters. */
const special: Array<[string, string]> = [
  ['f(t) = λe^(−λt)', String.raw`f(t)=\lambda e^{-\lambda t}`],
  ['ρ = λ/(c·μ)', String.raw`\rho=\frac{\lambda}{c\mu}`],
  ['Lq = ρ²/(1−ρ)', String.raw`L_q=\frac{\rho^2}{1-\rho}`],
  ['Wq = ρ/(μ−λ)', String.raw`W_q=\frac{\rho}{\mu-\lambda}`],
  ['Lq = λ·Wq', String.raw`L_q=\lambda W_q`],
  ['L = λ·W', String.raw`L=\lambda W`],
  ['L = λW', String.raw`L=\lambda W`],
  ['half-width ∝ t·σ/√n', String.raw`\text{half-width}\propto\frac{t\sigma}{\sqrt n}`],
  ['(min + mode + max)/3', String.raw`\frac{a+m+b}{3}`],
  ['ceil(λs/0.8)', String.raw`\left\lceil\frac{\lambda s}{0.8}\right\rceil`],
  ['λ = 1/mean', String.raw`\lambda=\frac{1}{\operatorname{mean}}`],
];
const texSymbols: Record<string, string> = { 'ρ̂': String.raw`\widehat\rho`, 'ρ': String.raw`\rho`, 'λ': String.raw`\lambda`, 'μ': String.raw`\mu`, 'σ': String.raw`\sigma`, 'θ': String.raw`\theta`, '≥': String.raw`\geq`, '≤': String.raw`\leq`, '≈': String.raw`\approx`, '∞': String.raw`\infty`, '∝': String.raw`\propto`, '√': String.raw`\sqrt`, '²': '^2', '×': String.raw`\times`, '·': String.raw`\cdot`, '−': '-', '%': String.raw`\%`, 'Wq': 'W_q', 'Lq': 'L_q' };
const symbol = /ρ̂|[ρλμσθ≥≤≈∞∝√²×·−%]|\b(?:Wq|Lq)\b/g;
const atom = String.raw`(?:ρ̂|[ρλμσθ∞]|\b(?:Wq|Lq|L|W|c|n|t|s)\b|\d+(?:\.\d+)?%?|[()²])`;
const expression = new RegExp(String.raw`(?:ρ̂|[ρλμσθ∞]|\b(?:Wq|Lq)\b|\b[LWc]\b(?=\s*[=≈≥≤<>])|\d+(?:\.\d+)?(?=\s*[×÷]))(?:\s*(?:[=≈≥≤<>+−*/×·²]|\^)?\s*${atom})*`, 'g');
export function mathProse(text: string): string {
  const stored: string[] = [];
  const stash = (tex: string) => { stored.push(`\\(${tex}\\)`); return `\uE000${stored.length - 1}\uE001`; };
  let value = text;
  for (const [plain, tex] of special) value = value.split(plain).join(stash(tex));
  value = value.replace(expression, match => stash(match.trim().replace(symbol, x => `${texSymbols[x]} `)));
  return value.replace(/\uE000(\d+)\uE001/g, (_, i) => stored[Number(i)]);
}
