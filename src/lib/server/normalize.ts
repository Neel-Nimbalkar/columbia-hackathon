/**
 * Deterministic normalization. The model extracts values verbatim; this
 * module (not the model) turns "304 SS", "1-1/2\"", "16ga", "12 ft" into
 * comparable values. Unknowns stay null — nothing is guessed.
 */
import type { Spec } from '../shared/schema';
import { GAUGE_TABLES, TUBE_WALL_GAUGE } from '../shared/metals';

/* ------------------------------------------------------------------ */
/* Numbers and units                                                    */
/* ------------------------------------------------------------------ */

/** Parse "0.060", ".060", "1/8", "1-1/2", "1 1/2", "3/16\"" → number; null if not a positive number. */
export function parseMeasure(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  const s = raw.trim().replace(/["”″']|in(ch(es)?)?\.?$|mm$|ft$|feet$/gi, '').trim();
  let m = /^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) { const n = Number(m[1]) + Number(m[2]) / Number(m[3]); return Number(m[3]) > 0 && Number.isFinite(n) && n > 0 ? n : null; }
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) { const n = Number(m[1]) / Number(m[2]); return Number.isFinite(n) && n > 0 ? n : null; }
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type LengthUnit = 'in' | 'mm' | 'ft';

export function normalizeUnit(raw: string | null | undefined): LengthUnit | null {
  if (!raw) return null;
  const u = raw.trim().toLowerCase().replace(/\.$/, '');
  if (['in', 'inch', 'inches', '"', '″', 'in.'].includes(u)) return 'in';
  if (['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'].includes(u)) return 'mm';
  if (['ft', 'foot', 'feet', "'", '′'].includes(u)) return 'ft';
  return null;
}

export function toInches(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value : unit === 'mm' ? value / 25.4 : value * 12;
}

/** Round to 4 decimals to avoid 0.1+0.2 artifacts in comparisons and display. */
export const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/* ------------------------------------------------------------------ */
/* Materials, grades, forms, finishes                                   */
/* ------------------------------------------------------------------ */

export type Material = 'stainless steel' | 'aluminum' | 'carbon steel' | 'alloy steel';

const MATERIAL_SYNONYMS: [RegExp, Material][] = [
  [/^(ss|s\/s|sst|stainless|stainless steel|inox|corrosion resistant steel|cres)$/, 'stainless steel'],
  [/^(al|alu|alum|aluminum|aluminium|aluminum alloy)$/, 'aluminum'],
  [/^(cs|crs|hrs|cold rolled steel|hot rolled steel|mild steel|carbon steel|low carbon steel|steel|ms)$/, 'carbon steel'],
  [/^(alloy steel|chromoly|chrome moly|cromoly)$/, 'alloy steel'],
];

const GRADE_MATERIAL: [RegExp, Material][] = [
  [/^(201|301|302|303|304|304L|304H|309|310|316|316L|317L|321|347|410|416|420|430|440C|17-4 PH|15-5 PH|2205|904L)$/, 'stainless steel'],
  [/^(1100|2011|2024|3003|5005|5052|5083|5086|6061|6063|6082|7050|7075)$/, 'aluminum'],
  [/^(A36|A572|1008|1010|1018|1020|1026|1045|1117|1144|12L14|A500|A513|A1011)$/, 'carbon steel'],
  [/^(4130|4140|4340|8620|52100)$/, 'alloy steel'],
];

export function normalizeMaterial(raw: string | null | undefined): Material | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');
  // Catalog-style "Steel, Mild" / "Steel, Cold Rolled" / "Stainless, 304" → "mild steel" / "cold rolled steel".
  const comma = /^([a-z ]+?),\s*([a-z ]+)$/.exec(s);
  if (comma) s = `${comma[2]} ${comma[1]}`.trim();
  for (const [re, m] of MATERIAL_SYNONYMS) if (re.test(s)) return m;
  if (/\bstainless\b/.test(s)) return 'stainless steel';
  if (/\balumin(i)?um\b/.test(s)) return 'aluminum';
  if (/\b(chromoly|chrome moly|alloy steel)\b/.test(s)) return 'alloy steel';
  if (/^(mild|carbon|low carbon|structural|hot rolled|cold rolled|cold finished|cold drawn|hr|cr|hrpo|p ?& ?o|commercial quality|cq)( steel)?( steel)?$|^(mild|carbon|structural) steel\b/.test(s)) return 'carbon steel';
  return null;
}

/**
 * "SS304" → 304, "type 316l" → 316L, "6061-T6" → {6061, T6}, "17-4PH" → "17-4 PH",
 * "ASTM A36" → A36. Returns the temper if it was embedded in the grade.
 */
export function normalizeGrade(raw: string | null | undefined): { grade: string | null; temper: string | null } {
  if (!raw) return { grade: null, temper: null };
  let s = raw.trim().toUpperCase()
    .replace(/^(TYPE|GRADE|GR\.?|AISI|SAE|ASTM|UNS|ALLOY)\s*/g, '')
    .replace(/\b(SS|S\/S|SST|STAINLESS|ALUM(INUM)?|AL)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^SS\s*/, '').replace(/\s*SS$/, '');
  const ph = /^(17|15)\s*-?\s*(4|5)\s*-?\s*PH$/.exec(s);
  if (ph) return { grade: `${ph[1]}-${ph[2]} PH`, temper: null };
  const withTemper = /^(\d{4})\s*[- ]?\s*(T\d{1,5}|O|H\d{2,3}|F)$/.exec(s);
  if (withTemper) return { grade: withTemper[1]!, temper: withTemper[2]! };
  return { grade: s || null, temper: null };
}

export function materialForGrade(grade: string | null): Material | null {
  if (!grade) return null;
  for (const [re, m] of GRADE_MATERIAL) if (re.test(grade)) return m;
  return null;
}

export function normalizeTemper(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return /^(T\d{1,5}|O|H\d{2,3}|F|ANNEALED|COND(ITION)?A|H\d{3,4}|H1150|H1025|H900)$/.test(s) ? s.replace(/^CONDITIONA$|^CONDA$/, 'CONDITION A') : raw.trim();
}

export function normalizeForm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Mill processing words describe the material, not the shape: "hot rolled sheets" → "sheets".
  s = s.replace(/^(?:hot rolled|cold rolled|cold drawn|cold finished|hr|cr|crs|hrs|cf|cd|extruded|drawn|seamless|welded)\s+(?=\S)/, '');
  if (/^(sht|sheet|sheets|shts|sh)$/.test(s)) return 'sheet';
  if (/^(pl|plt|plate|plates)$/.test(s)) return 'plate';
  if (/^(rd|rnd|round|rounds|rod|rods|round bar|round bars|rd bar|rnd bar|round rod|bar round)$/.test(s)) return 'round bar';
  if (/^(flat|flat bar|flat bars|flats|fb|flat stock)$/.test(s)) return 'flat bar';
  if (/^(sq|square|squares|square bar|square bars|sq bar)$/.test(s)) return 'square bar';
  if (/^(hex|hex bar|hexes)$/.test(s)) return 'hex bar';
  if (/^(tube|tubing|round tube|round tubing|rd tube|tubes)$/.test(s)) return 'tube';
  if (/^(square tube|square tubing|sq tube|sq tubing|rectangular tube|rectangular tubing|rect tube|rect tubing)$/.test(s)) return 'square tube';
  if (/^(pipe|pipes)$/.test(s)) return 'pipe';
  if (/^(angle|angles|ang)$/.test(s)) return 'angle';
  if (/^(channel|channels)$/.test(s)) return 'channel';
  if (/^(bar)$/.test(s)) return 'bar';
  return s || null;
}

export function normalizeFinish(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^(#|no\.?\s*)?2b\b/.test(s)) return '2B';
  if (/^(#|no\.?\s*)2\b/.test(s)) return '#2';
  if (/^(#|no\.?\s*)4\b|brushed|satin/.test(s)) return '#4';
  if (/^(#|no\.?\s*)8\b|mirror/.test(s)) return '#8';
  if (/^ba\b|bright anneal/.test(s)) return 'BA';
  if (/^mill\b/.test(s)) return 'mill';
  if (/^(hr|hot rolled)\b/.test(s)) return 'hot rolled';
  if (/^(cr|cf|cold rolled|cold finish|cold drawn|cd)\b/.test(s)) return 'cold finished';
  if (/^(hrpo|pickled)/.test(s)) return 'HRPO';
  return raw.trim();
}

/* ------------------------------------------------------------------ */
/* Gauge                                                                */
/* ------------------------------------------------------------------ */

export { GAUGE_TABLES };

export function gaugeToInches(gauge: number, material: string | null, form: string | null = null): { inches: number; table: string } | null {
  // Tube walls use one wire-gauge scale regardless of material; sheet gauges depend on the material.
  const entry = form === 'tube' ? (material ? TUBE_WALL_GAUGE : undefined)
    : material === 'alloy steel' ? GAUGE_TABLES['carbon steel'] : GAUGE_TABLES[material as keyof typeof GAUGE_TABLES];
  const inches = entry?.table[gauge];
  return entry && inches ? { inches, table: entry.name } : null;
}

/* ------------------------------------------------------------------ */
/* Quantity                                                             */
/* ------------------------------------------------------------------ */

export type QtyUnit = 'pc' | 'ft' | 'lb' | 'kg' | 'in' | 'm';

export function normalizeQtyUnit(raw: string | null | undefined): QtyUnit | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[().]/g, '');
  if (/^(pc|pcs|piece|pieces|ea|each|sheet|sheets|sh|sht|shts|plate|plates|bar|bars|length|lengths|lg|lgs|lgth|lgths|units?|qty|nos?|blank|blanks|tube|tubes|stick|sticks)$/.test(s)) return 'pc';
  if (/^(ft|feet|foot|lf|lin ft|linear feet)$/.test(s)) return 'ft';
  if (/^(lb|lbs|pound|pounds|#)$/.test(s)) return 'lb';
  if (/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/.test(s)) return 'kg';
  if (/^(in|inch|inches)$/.test(s)) return 'in';
  if (/^(m|meter|meters|metre|metres)$/.test(s)) return 'm';
  return null;
}

/* ------------------------------------------------------------------ */
/* Spec comparison helpers                                               */
/* ------------------------------------------------------------------ */

/** Dimensions in inches (null if unit unknown). */
export function specDimsInches(spec: Spec): { thickness: number | null; width: number | null; length: number | null; diameter: number | null; tolerance: number | null } | null {
  const u = spec.dimensionUnit;
  const anyDim = [spec.thickness, spec.width, spec.length, spec.diameter, spec.tolerance].some((v) => v !== null);
  if (!anyDim) return { thickness: null, width: null, length: null, diameter: null, tolerance: null };
  if (!u) return null;
  const c = (v: number | null) => (v === null ? null : r4(toInches(v, u)));
  return { thickness: c(spec.thickness), width: c(spec.width), length: c(spec.length), diameter: c(spec.diameter), tolerance: c(spec.tolerance) };
}
