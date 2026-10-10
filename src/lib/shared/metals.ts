/**
 * Plain metals reference data shared by the server engine and the browser
 * calculators: gauge tables, densities and shape weight formulas.
 */

/**
 * Gauge → nominal thickness (in). Gauge is material dependent:
 * - Carbon steel: Manufacturers' Standard Gauge for sheet steel.
 * - Stainless steel: common stainless sheet gauge (nominal decimals).
 * - Aluminum: Brown & Sharpe (AWG).
 */
export const GAUGE_TABLES: Record<'carbon steel' | 'stainless steel' | 'aluminum', { name: string; table: Record<number, number> }> = {
  'carbon steel': {
    name: "Manufacturers' Standard Gauge (sheet steel)",
    table: { 7: 0.1793, 8: 0.1644, 10: 0.1345, 11: 0.1196, 12: 0.1046, 13: 0.0897, 14: 0.0747, 16: 0.0598, 18: 0.0478, 20: 0.0359, 22: 0.0299, 24: 0.0239, 26: 0.0179, 28: 0.0149 },
  },
  'stainless steel': {
    name: 'Stainless sheet gauge (nominal mill decimals)',
    table: { 7: 0.18, 8: 0.165, 10: 0.135, 11: 0.12, 12: 0.105, 14: 0.075, 16: 0.06, 18: 0.048, 20: 0.036, 22: 0.03, 24: 0.024, 26: 0.018, 28: 0.015 },
  },
  aluminum: {
    name: 'Brown & Sharpe (AWG) aluminum gauge',
    table: { 8: 0.1285, 10: 0.1019, 11: 0.0907, 12: 0.0808, 14: 0.0641, 16: 0.0508, 18: 0.0403, 20: 0.032, 22: 0.0253, 24: 0.0201, 26: 0.0159 },
  },
};

/** Densities in lb/in³ (published nominal values). */
export const DENSITIES: { id: string; label: string; family: string; lbPerIn3: number }[] = [
  { id: 'cs', label: 'Carbon steel (A36, 1018, 1045)', family: 'carbon steel', lbPerIn3: 0.2836 },
  { id: 'as', label: 'Alloy steel (4130, 4140, 4340)', family: 'alloy steel', lbPerIn3: 0.2836 },
  { id: 'ss304', label: 'Stainless 304 / 304L', family: 'stainless steel', lbPerIn3: 0.289 },
  { id: 'ss316', label: 'Stainless 316 / 316L', family: 'stainless steel', lbPerIn3: 0.289 },
  { id: 'ss17', label: 'Stainless 17-4 PH', family: 'stainless steel', lbPerIn3: 0.282 },
  { id: 'al6061', label: 'Aluminum 6061', family: 'aluminum', lbPerIn3: 0.0975 },
  { id: 'al5052', label: 'Aluminum 5052', family: 'aluminum', lbPerIn3: 0.0968 },
  { id: 'al3003', label: 'Aluminum 3003', family: 'aluminum', lbPerIn3: 0.0987 },
  { id: 'al7075', label: 'Aluminum 7075', family: 'aluminum', lbPerIn3: 0.1015 },
  { id: 'brass', label: 'Brass 360', family: 'other', lbPerIn3: 0.307 },
  { id: 'cu', label: 'Copper 110', family: 'other', lbPerIn3: 0.323 },
  { id: 'ti', label: 'Titanium Gr 5', family: 'other', lbPerIn3: 0.16 },
];

export type Shape = 'sheet' | 'round bar' | 'square bar' | 'hex bar' | 'flat bar' | 'round tube' | 'square tube' | 'angle';

export const SHAPES: { id: Shape; label: string; dims: { key: string; label: string }[] }[] = [
  { id: 'sheet', label: 'Sheet / plate', dims: [{ key: 't', label: 'Thickness' }, { key: 'w', label: 'Width' }] },
  { id: 'flat bar', label: 'Flat bar', dims: [{ key: 't', label: 'Thickness' }, { key: 'w', label: 'Width' }] },
  { id: 'round bar', label: 'Round bar', dims: [{ key: 'd', label: 'Diameter' }] },
  { id: 'square bar', label: 'Square bar', dims: [{ key: 'a', label: 'Side' }] },
  { id: 'hex bar', label: 'Hex bar', dims: [{ key: 'a', label: 'Across flats' }] },
  { id: 'round tube', label: 'Round tube', dims: [{ key: 'd', label: 'Outside diameter' }, { key: 't', label: 'Wall' }] },
  { id: 'square tube', label: 'Square / rect tube', dims: [{ key: 'w', label: 'Width' }, { key: 'h', label: 'Height' }, { key: 't', label: 'Wall' }] },
  { id: 'angle', label: 'Angle', dims: [{ key: 'w', label: 'Leg A' }, { key: 'h', label: 'Leg B' }, { key: 't', label: 'Thickness' }] },
];

/** Cross-section area in in² from dimensions in inches (null when the shape is impossible). */
export function crossSection(shape: Shape, d: Record<string, number>): number | null {
  const v = (k: string) => d[k] ?? 0;
  let area: number;
  switch (shape) {
    case 'sheet': case 'flat bar': area = v('t') * v('w'); break;
    case 'round bar': area = (Math.PI / 4) * v('d') ** 2; break;
    case 'square bar': area = v('a') ** 2; break;
    case 'hex bar': area = (Math.sqrt(3) / 2) * v('a') ** 2; break;
    case 'round tube': if (2 * v('t') >= v('d')) return null; area = (Math.PI / 4) * (v('d') ** 2 - (v('d') - 2 * v('t')) ** 2); break;
    case 'square tube': if (2 * v('t') >= Math.min(v('w'), v('h'))) return null; area = v('w') * v('h') - (v('w') - 2 * v('t')) * (v('h') - 2 * v('t')); break;
    case 'angle': if (v('t') >= Math.min(v('w'), v('h'))) return null; area = v('t') * (v('w') + v('h') - v('t')); break;
  }
  return Number.isFinite(area) && area > 0 ? area : null;
}

export const MM_PER_IN = 25.4;

/** "1-1/2", "1 1/2", "3/16", ".060", "1.5" → number (null if not a positive number). */
export function parseFraction(raw: string): number | null {
  const s = raw.trim().replace(/["”″]/g, '');
  let n: number;
  let m = /^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) n = Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : NaN;
  else {
    m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m) n = Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN;
    else n = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : /^(?:\d{1,3})(?:,\d{3})+(?:\.\d+)?$/.test(s) ? Number(s.replace(/,/g, '')) : NaN;
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Nearest fraction with a power-of-two denominator up to 1/64, e.g. 0.19 → "3/16" (+0.0025). */
export function nearestFraction(value: number, maxDen = 64): { text: string; error: number } {
  const whole = Math.floor(value);
  const frac = value - whole;
  let best = { num: 0, den: 1, err: Math.abs(frac) };
  for (let den = 2; den <= maxDen; den *= 2) {
    const num = Math.round(frac * den);
    const err = Math.abs(frac - num / den);
    if (err < best.err - 1e-12) best = { num, den, err };
  }
  let { num, den } = best;
  while (num && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const w = whole + (num === den ? 1 : 0);
  const text = num === 0 || num === den ? `${w}` : w ? `${w}-${num}/${den}` : `${num}/${den}`;
  return { text, error: value - (w + (num === den ? 0 : num / den)) };
}
