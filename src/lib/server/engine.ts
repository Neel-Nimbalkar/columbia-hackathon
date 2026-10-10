/**
 * Deterministic quote engine. Given customer requirements (items' spec,
 * inclusion, target margin) it derives everything else: normalization,
 * questions, catalog matching, aggregate inventory, pricing, compliance,
 * blockers, status, totals and readiness. Process, clarify and export all
 * call this, so client-supplied derived fields are never trusted.
 */
import type { Compliance, ExtractedItem, Pricing, Quote, QuoteItem, Spec } from '../shared/schema';
import { CATALOG, CATALOG_DISCLOSURE, type CatalogProduct } from './catalog';
import { gaugeToInches, r4, specDimsInches } from './normalize';

export interface QuoteInputs {
  id: string;
  customer: string;
  rfqReference?: string | null;
  date: string;
  expires: string;
  originalText: string;
  targetMargin: number;
  items: ExtractedItem[];
  provider: { extraction: string; classification: string };
  warnings?: string[];
}

const DIM_TOL = 0.0015; // inches; absorbs 0.060 vs 0.0598-style rounding, not real size differences
const BENCHMARK_STALE_DAYS = 120;
const SIZED_FORMS = new Set(['sheet', 'plate', 'round bar', 'flat bar', 'square bar', 'hex bar', 'tube']);

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '?' : `${r4(n)}`);
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const close = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= DIM_TOL;

/* ------------------------------------------------------------------ */
/* Normalization                                                        */
/* ------------------------------------------------------------------ */

export interface Normalized {
  spec: Spec;
  notes: string[];
}

/** Customer spec → comparable spec in inches with explicit unit; gauge resolved with a material-specific table. */
export function normalizeSpec(spec: Spec): Normalized {
  const notes: string[] = [];
  const out: Spec = { ...spec, standards: [...spec.standards], certifications: [...spec.certifications] };
  const inches = specDimsInches(spec);
  if (!inches) {
    // Unit-less customer numbers are not normalized inches.
    for (const key of ['thickness', 'width', 'length', 'diameter', 'tolerance'] as const) out[key] = null;
  }
  if (inches) {
    Object.assign(out, inches);
    const anyDim = Object.values(inches).some((v) => v !== null);
    out.dimensionUnit = anyDim ? 'in' : spec.dimensionUnit;
    if (anyDim && spec.dimensionUnit && spec.dimensionUnit !== 'in') notes.push(`Dimensions converted from ${spec.dimensionUnit} to inches.`);
  }
  if (spec.gauge !== null && out.thickness === null) {
    const g = gaugeToInches(spec.gauge, spec.material);
    if (g) {
      out.thickness = g.inches;
      out.dimensionUnit = 'in';
      notes.push(`${spec.gauge} ga ${spec.material} = ${g.inches} in (${g.table}).`);
    }
  }
  if (out.form && ['sheet', 'plate', 'flat bar'].includes(out.form) && out.width !== null && out.length !== null && out.width > out.length) {
    [out.width, out.length] = [out.length, out.width];
  }
  return { spec: out, notes };
}

/* ------------------------------------------------------------------ */
/* Required information                                                 */
/* ------------------------------------------------------------------ */

function describe(spec: Spec): string {
  const head = [spec.grade, spec.material, spec.temper, spec.form].filter(Boolean).join(' ') || 'this item';
  const u = spec.dimensionUnit ?? '';
  const dims = spec.form === 'round bar'
    ? [spec.diameter !== null ? `${fmt(spec.diameter)}${u} dia` : null, spec.length !== null ? `${fmt(spec.length)}${u}` : null]
    : [spec.gauge !== null ? `${spec.gauge} ga` : spec.thickness !== null ? `${fmt(spec.thickness)}${u}` : null, spec.width !== null ? `${fmt(spec.width)}${u}` : null, spec.length !== null ? `${fmt(spec.length)}${u}` : null];
  const d = dims.filter(Boolean).join(' x ');
  return d ? `${head} ${d}` : head;
}

/** Precise questions for missing critical information. Nothing is guessed. */
function missingInfoQuestions(item: ExtractedItem, n: Spec, lineNo: number): string[] {
  const s = item.spec;
  const q: string[] = [];
  const what = `Line ${lineNo} (${describe(s)})`;
  if (!s.material && !s.grade) q.push(`${what}: which material and grade are required?`);
  else if (!s.grade) q.push(`${what}: which ${s.material ?? ''} grade is required?`.replace('  ', ' '));
  if (!s.form) q.push(`${what}: which product form is required (sheet, plate, round bar, flat bar, tube)?`);
  if (n.material === 'aluminum' && !s.temper) {
    const tempers = [...new Set(CATALOG.filter((p) => p.grade === n.grade && p.form === n.form).map((p) => p.temper).filter(Boolean))];
    q.push(`${what}: ${s.grade ?? 'aluminum'} is supplied in several tempers and none was stated. Which temper is required${tempers.length ? ` (available: ${tempers.join(', ')})` : ' (e.g. T6, T651)'}?`);
  }
  const anyDim = [s.thickness, s.width, s.length, s.diameter, s.tolerance].some((v) => v !== null);
  if (anyDim && !s.dimensionUnit) q.push(`${what}: are the dimensions in inches or millimeters?`);
  if (s.gauge !== null && s.thickness !== null && s.dimensionUnit) {
    const gauge = gaugeToInches(s.gauge, s.material);
    if (gauge && n.thickness !== null && Math.abs(gauge.inches - n.thickness) > DIM_TOL)
      q.push(`${what}: ${s.gauge} ga means ${gauge.inches} in, but the stated thickness is ${n.thickness} in. Which thickness is required?`);
  }
  const form = n.form;
  if (form === 'sheet' || form === 'plate' || form === 'flat bar') {
    if (n.thickness === null && s.gauge === null) q.push(`${what}: what thickness is required?`);
    else if (n.thickness === null && s.gauge !== null) q.push(`${what}: ${s.gauge} ga cannot be converted for ${s.material ?? 'an unknown material'}; what decimal thickness is required?`);
    if (n.width === null || n.length === null) q.push(`${what}: what width and length are required?`);
  }
  if (form === 'tube') {
    if (n.diameter === null) q.push(`${what}: what outside diameter is required?`);
    if (n.thickness === null) q.push(`${what}: what wall thickness is required?`);
    if (n.length === null) q.push(`${what}: what length per piece is required?`);
  }
  if (form === 'round bar') {
    if (n.diameter === null) q.push(`${what}: what diameter is required?`);
    if (n.length === null) q.push(`${what}: what length per piece is required?`);
  }
  if (form === 'square bar' || form === 'hex bar') {
    if (n.thickness === null) q.push(`${what}: what ${form === 'hex bar' ? 'across-flats size' : 'side size'} is required?`);
    if (n.length === null) q.push(`${what}: what length per piece is required?`);
  }
  if (s.quantity === null) q.push(`${what}: what quantity is required?`);
  else if (s.quantity <= 0 || !Number.isFinite(s.quantity)) q.push(`${what}: the quantity "${s.quantity}" is not valid; how many are required?`);
  else if (!s.quantityUnit) {
    if (!(Number.isInteger(s.quantity) && form && SIZED_FORMS.has(form))) q.push(`${what}: is the quantity ${s.quantity} in pieces, feet or pounds?`);
  }
  for (const [field, origin] of Object.entries(item.provenance)) {
    if (origin === 'suggestion' && Object.hasOwn(s, field))
      q.push(`${what}: ${field} was inferred, not stated. Please confirm the ${field}.`);
  }
  return q;
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

interface Check { field: string; ok: boolean; detail: string }

function checks(n: Spec, raw: Spec, p: CatalogProduct): Check[] {
  const c: Check[] = [];
  const push = (field: string, ok: boolean, want: string, have: string) => c.push({ field, ok, detail: ok ? `${field}: ${have}` : `${field}: requested ${want}, product is ${have}` });
  push('material', n.material === p.material, `${n.material}`, p.material);
  push('grade', (n.grade ?? '').toUpperCase() === p.grade.toUpperCase(), `${n.grade}`, p.grade);
  push('form', n.form === p.form, `${n.form}`, p.form);
  if (n.temper || p.material === 'aluminum') push('temper', (n.temper ?? '').toUpperCase() === (p.temper ?? '').toUpperCase(), `${n.temper ?? 'unspecified'}`, p.temper ?? 'none');
  if (raw.gauge !== null && p.gauge !== null) push('gauge', raw.gauge === p.gauge, `${raw.gauge} ga`, `${p.gauge} ga`);
  if (n.thickness !== null || p.thickness !== null) push('thickness', close(n.thickness, p.thickness), `${fmt(n.thickness)} in`, `${fmt(p.thickness)} in`);
  if (n.diameter !== null || p.diameter !== null) push('diameter', close(n.diameter, p.diameter), `${fmt(n.diameter)} in`, `${fmt(p.diameter)} in`);
  if (n.width !== null || p.width !== null) push('width', close(n.width, p.width), `${fmt(n.width)} in`, `${fmt(p.width)} in`);
  if (n.length !== null || p.length !== null) push('length', close(n.length, p.length), `${fmt(n.length)} in`, `${fmt(p.length)} in`);
  if (n.finish) push('finish', (p.finish ?? '').toLowerCase() === n.finish.toLowerCase(), n.finish, p.finish ?? 'not documented');
  if (n.tolerance !== null) push('tolerance', false, `±${fmt(n.tolerance)} in`, p.thicknessTolerance ? `documented as "${p.thicknessTolerance}" (needs manual verification)` : 'not documented');
  return c;
}

interface MatchResult {
  exact: CatalogProduct[];
  near: { product: CatalogProduct; failures: Check[] }[];
}

function match(n: Spec, raw: Spec): MatchResult {
  const scored = CATALOG.map((p) => {
    const cs = checks(n, raw, p);
    return { product: p, cs, failures: cs.filter((x) => !x.ok) };
  });
  const exact = scored.filter((s) => s.failures.length === 0).map((s) => s.product);
  const near = scored
    .filter((s) => s.failures.length > 0 && s.failures.length <= 2 && s.product.material === n.material && s.product.form === n.form)
    .sort((a, b) => a.failures.length - b.failures.length)
    .slice(0, 3)
    .map((s) => ({ product: s.product, failures: s.failures }));
  return { exact, near };
}

/* ------------------------------------------------------------------ */
/* Compliance and pricing                                               */
/* ------------------------------------------------------------------ */

function compliance(n: Spec, p: CatalogProduct | null): Compliance[] {
  const out: Compliance[] = [];
  if (n.mtr) {
    out.push(!p ? { requirement: 'MTR', status: 'missing', evidence: 'No matched product to verify.' }
      : p.certsAvailable ? { requirement: 'MTR', status: 'pending', evidence: `Supplier offers certs (${p.certNote ?? 'documented on product page'}). A lot-specific MTR is not in hand until the order ships.` }
        : { requirement: 'MTR', status: 'missing', evidence: 'Supplier page does not document MTR availability for this item.' });
  } else out.push({ requirement: 'MTR', status: 'not_requested', evidence: 'Not requested.' });
  for (const std of n.standards) {
    const ok = p?.standards.some((s) => s.replace(/\s+/g, '').toUpperCase() === std.replace(/\s+/g, '').toUpperCase());
    out.push(ok ? { requirement: std, status: 'verified', evidence: `Listed on supplier page ${p!.url} (retrieved ${p!.retrievedDate}).` }
      : { requirement: std, status: 'missing', evidence: p ? 'Not listed for the matched product.' : 'No matched product to verify.' });
  }
  for (const cert of n.certifications) out.push({ requirement: cert, status: 'missing', evidence: 'No documented evidence for this certification in the sourced catalog.' });
  if (n.countryOfOrigin) {
    const origin = p?.countryOfOrigin ?? null;
    out.push(origin && origin.toUpperCase() === n.countryOfOrigin.toUpperCase()
      ? { requirement: `Origin: ${n.countryOfOrigin}`, status: 'verified', evidence: `Supplier documents origin ${origin}.` }
      : { requirement: `Origin: ${n.countryOfOrigin}`, status: 'missing', evidence: origin ? `Documented origin is ${origin}.` : 'Country of origin is not documented; it is treated as unknown.' });
  } else out.push({ requirement: 'Country of origin', status: 'not_requested', evidence: 'No restriction requested.' });
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Integer-cents pricing: unit price = ceil(cost / (1 − margin)), so the target margin is never undercut. */
export function priceLine(p: CatalogProduct, quantity: number, targetMargin: number, quoteDate: string): Pricing {
  // Use the decimal margin as an exact rational to avoid floating-point
  // rounding down the margin or adding a cent to an already integral price.
  const [decimal, exponent = '0'] = String(targetMargin).split('e');
  const places = (decimal!.split('.')[1]?.length ?? 0) - Number(exponent);
  const numerator = BigInt(decimal!.replace('.', '')) * 10n ** BigInt(Math.max(0, -places));
  const denominator = 10n ** BigInt(Math.max(0, places));
  const divisor = denominator - numerator;
  const cost = BigInt(p.costCents) * denominator;
  const unitPriceCents = Number((cost + divisor - 1n) / divisor);
  const lineTotalCents = unitPriceCents * quantity;
  let benchmarkStatus = 'Missing — no comparable price available';
  let benchmark: number | null = null;
  if (p.listPrice) {
    if (p.listPrice.unit !== 'pc') benchmarkStatus = `Incomparable — listed per ${p.listPrice.unit}, quoted per piece`;
    else if (daysBetween(p.retrievedDate, quoteDate) > BENCHMARK_STALE_DAYS) { benchmarkStatus = `Stale — retrieved ${p.retrievedDate}`; benchmark = p.listPrice.usd; }
    else { benchmarkStatus = `${p.listPrice.synthetic ? 'Synthetic' : 'Sourced'} · comparable per piece`; benchmark = p.listPrice.usd; }
  }
  const benchmarkCents = benchmark === null ? null : Math.round(benchmark * 100);
  const competitive = benchmarkCents === null || /^(Incomparable|Stale|Synthetic)/.test(benchmarkStatus) ? null : unitPriceCents <= benchmarkCents;
  const margin = (unitPriceCents - p.costCents) / unitPriceCents;
  const parts = [
    `Cost ${money(p.costCents)} (synthetic seed) ÷ (1 − ${(targetMargin * 100).toFixed(1)}% margin) = ${money(unitPriceCents)} per piece, rounded up to the cent to preserve margin.`,
  ];
  if (benchmarkCents !== null && competitive !== null) {
    const difference = Math.abs(unitPriceCents - benchmarkCents);
    const percentage = benchmarkCents ? (difference / benchmarkCents * 100).toFixed(1) : '0.0';
    parts.push(`${money(difference)} (${percentage}%) ${competitive ? 'at or below' : 'above'} the ${money(benchmarkCents)} ${p.supplier} list-price benchmark for the same cut size, per piece, retrieved ${p.retrievedDate}. ${competitive ? 'The price preserves the target margin while meeting the sourced comparison.' : 'Target margin conflicts with the sourced comparison.'} Comparison excludes tax and freight.`);
  } else if (benchmarkCents !== null) parts.push(`${benchmarkStatus} (${money(benchmarkCents)}). Competitiveness unknown; obtain a current supplier price.`);
  else parts.push('No usable benchmark; competitiveness unknown.');
  return {
    cost: p.costCents / 100,
    unitPrice: unitPriceCents / 100,
    lineTotal: lineTotalCents / 100,
    margin,
    benchmark,
    benchmarkDate: p.listPrice ? p.retrievedDate : null,
    benchmarkSource: p.listPrice ? (p.listPrice.synthetic ? 'Synthetic benchmark seed' : `${p.supplier} list price (${p.url})`) : null,
    benchmarkStatus,
    unit: 'pc',
    explanation: parts.join(' '),
    competitive,
  };
}

/* ------------------------------------------------------------------ */
/* Quote assembly                                                       */
/* ------------------------------------------------------------------ */

export function buildQuote(input: QuoteInputs): Quote {
  const warnings = [...(input.warnings ?? [])];
  const lines = input.items.map((item, idx) => {
    const lineNo = idx + 1;
    const { spec: n, notes } = normalizeSpec(item.spec);
    const questions = missingInfoQuestions(item, n, lineNo);
    const blockers: string[] = [];
    const explanation: string[] = [...notes];
    const m = questions.length ? { exact: [], near: [] } as MatchResult : match(n, item.spec);
    let product: CatalogProduct | null = null;

    if (item.classification?.material && n.material && item.classification.confidence >= 0.8 && item.classification.material !== n.material && !['unknown', 'other metal'].includes(item.classification.material)) {
      questions.push(`Line ${lineNo}: the classifier reads this as ${item.classification.material} but the extracted material is ${n.material}. Which is correct?`);
    }
    if (item.classification?.material === 'not metal' && !n.material && !n.grade) {
      explanation.push('Classified as a non-metal item or service; exclude it if RudCo does not supply it.');
    }

    if (!questions.length) {
      if (m.exact.length === 1) {
        product = m.exact[0]!;
        explanation.push(`Exact match ${product.supplierPartNumber} (${product.description}): ${checks(n, item.spec, product).map((c) => c.detail).join('; ')}.`);
      } else if (m.exact.length > 1) {
        const finishes = [...new Set(m.exact.map((p) => p.finish ?? 'unspecified'))];
        questions.push(finishes.length > 1
          ? `Line ${lineNo}: ${m.exact.length} catalog items match and differ by finish (${finishes.join(', ')}). Which finish is required?`
          : `Line ${lineNo}: ${m.exact.length} catalog items match (${m.exact.map((p) => p.supplierPartNumber).join(', ')}). Which one should be quoted?`);
      } else {
        blockers.push(`Line ${lineNo}: no catalog product satisfies every requirement. No substitution has been made.`);
        explanation.push('No exact match.');
      }
    }

    const alternatives = (product ? [] : m.exact.length > 1 ? m.exact.map((p) => ({ product: p, failures: [] as Check[] })) : m.near).map((a) => ({
      sku: a.product.sku,
      reason: a.failures.length
        ? `${a.product.description} — differs: ${a.failures.map((f) => f.detail).join('; ')}. Review only; not substituted.`
        : `${a.product.description} — candidate; buyer decision required.`,
    }));

    // Quantity in pieces
    let qtyPieces: number | null = null;
    const unit = item.spec.quantityUnit;
    if (item.spec.quantity !== null && item.spec.quantity > 0) {
      if (unit === 'pc' || (unit === null && Number.isInteger(item.spec.quantity) && n.form && SIZED_FORMS.has(n.form))) {
        if (Number.isInteger(item.spec.quantity)) qtyPieces = item.spec.quantity;
        else { blockers.push(`Line ${lineNo}: fractional piece quantity ${item.spec.quantity} cannot be quoted.`); questions.push(`Line ${lineNo}: how many whole pieces are required?`); }
        if (unit === null) explanation.push(`Bare count ${item.spec.quantity} of cut-size ${n.form} read as pieces.`);
      } else if (product) {
        blockers.push(`Line ${lineNo}: quantity is in "${unit}"; converting ${unit} to pieces is not supported. Please restate the quantity in pieces.`);
        questions.push(`Line ${lineNo}: how many cut-size pieces are required? The stated quantity in ${unit} cannot be converted without buyer confirmation.`);
      }
    }

    const comp = compliance(n, product);
    return { item, lineNo, n, questions, blockers, explanation, product, alternatives, qtyPieces, comp };
  });

  // Aggregate demand per SKU across included lines.
  const demand = new Map<string, number>();
  for (const l of lines) if (l.item.included && l.product && l.qtyPieces) demand.set(l.product.sku, (demand.get(l.product.sku) ?? 0) + l.qtyPieces);

  const items: QuoteItem[] = lines.map((l) => {
    const { item, product, qtyPieces } = l;
    let pricing: Pricing | null = null;
    if (product) {
      const total = demand.get(product.sku) ?? qtyPieces ?? 0;
      if (item.included && total > product.stock) {
        const sharing = lines.filter((o) => o.item.included && o.product?.sku === product.sku).map((o) => o.lineNo);
        l.blockers.push(`Line ${l.lineNo}: insufficient stock — ${product.stock} on hand (synthetic) vs ${total} requested${sharing.length > 1 ? ` across lines ${sharing.join(', ')}` : ''}.`);
      }
      if (qtyPieces) pricing = priceLine(product, qtyPieces, input.targetMargin, input.date);
      l.explanation.push(`Stock ${product.stock} pc on hand (synthetic); total quote demand ${total} pc.`);
    }
    const anyMissing = l.comp.some((c) => c.status === 'missing');
    const anyPending = l.comp.some((c) => c.status === 'pending');
    let status: QuoteItem['status'];
    if (l.questions.length || item.conflicts.length) status = 'Needs Clarification';
    else if (!product) status = 'No Match';
    else if (anyMissing || anyPending) status = 'Compliance Pending';
    else if (l.blockers.length || !pricing) status = 'Matched';
    else status = 'Ready';
    if (pricing && pricing.competitive === false) warnings.push(`Line ${l.lineNo}: target margin puts the price above the benchmark.`);
    if (anyMissing) l.blockers.push(`Line ${l.lineNo}: requested compliance cannot be verified: ${l.comp.filter((c) => c.status === 'missing').map((c) => c.requirement).join(', ')}.`);

    return {
      id: item.id,
      original: item.original,
      source: item.source,
      spec: item.spec,
      conflicts: item.conflicts,
      provenance: item.provenance,
      included: item.included,
      classification: item.classification ?? null,
      normalized: l.n,
      status,
      matchedSku: product?.sku ?? null,
      alternatives: l.alternatives,
      matchExplanation: l.explanation,
      compliance: l.comp,
      questions: l.questions,
      blockers: l.blockers,
      pricing,
      leadTime: product ? `${product.leadTimeDays} business days (synthetic)` : null,
    };
  });

  const included = items.filter((i) => i.included);
  const totalCents = included.reduce((sum, i) => sum + (i.pricing ? Math.round(i.pricing.lineTotal * 100) : 0), 0);
  const ready = included.length > 0 && included.every((i) => i.status === 'Ready' && !i.blockers.length && !i.questions.length && !i.conflicts.length);
  return {
    id: input.id,
    customer: input.customer,
    rfqReference: input.rfqReference ?? null,
    date: input.date,
    expires: input.expires,
    originalText: input.originalText,
    targetMargin: input.targetMargin,
    items,
    total: totalCents / 100,
    ready,
    warnings: [...new Set(warnings)],
    provider: input.provider,
    disclosure: CATALOG_DISCLOSURE,
  };
}

/** Product lookup for UI explanations / tests. */
export function productBySku(sku: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.sku === sku);
}
