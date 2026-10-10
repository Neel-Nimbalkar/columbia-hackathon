/**
 * RFQ processing pipeline: parse → extract (Nicrron) → anchor to source →
 * classify (Jev) → cross-source conflicts → deterministic engine.
 */
import { randomBytes } from 'node:crypto';
import type { ExtractedItem, Quote } from '../shared/schema';
import { buildQuote } from './engine';
import { HttpError } from './errors';
import { anchorToSource, classifyLine, detectInjection, runExtraction, toSpec, type Anchor, type Classification } from './extract';
import { normalizeSpec } from './engine';
import { parsePastedText, parseUpload, MAX_TEXT_CHARS, type ParsedSource } from './parse';

const MAX_LINES = 100;

export interface ProcessInput {
  files: { name: string; size: number; bytes: Uint8Array }[];
  text: string;
  customer: string;
  targetMargin: number;
}

export function newQuoteId(now = new Date()): string {
  return `RQ-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function quoteDates(now = new Date()): { date: string; expires: string } {
  const date = now.toISOString().slice(0, 10);
  const expires = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  return { date, expires };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); }
  }));
  return out;
}

/** Same physical item described differently by two sources → conflict on both lines. */
export function crossSourceConflicts(items: ExtractedItem[]): void {
  const docOf = (src: string) => src.split(' · ')[0];
  const key = (it: ExtractedItem) => {
    const n = normalizeSpec(it.spec).spec;
    return [n.material, n.form, n.thickness, n.width, n.length, n.diameter, it.spec.gauge].map((v) => v ?? '').join('|');
  };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i]!; const b = items[j]!;
    if (docOf(a.source) === docOf(b.source) || key(a) !== key(b) || key(a).replace(/\|/g, '') === '') continue;
    const diffs = (['grade', 'temper', 'quantity', 'finish', 'quantityUnit'] as const)
      .filter((f) => a.spec[f] !== null && b.spec[f] !== null && String(a.spec[f]).toUpperCase() !== String(b.spec[f]).toUpperCase())
      .map((f) => `${f}: ${docOf(a.source)} says ${a.spec[f]}, ${docOf(b.source)} says ${b.spec[f]}`);
    const msg = diffs.length
      ? `Conflicting requirements between sources for the same item (lines ${i + 1} and ${j + 1}) — ${diffs.join('; ')}. Which is correct?`
      : `Lines ${i + 1} and ${j + 1} describe the same item in two sources (${docOf(a.source)} and ${docOf(b.source)}). Confirm whether both are wanted or exclude one.`;
    a.conflicts.push(msg);
    b.conflicts.push(msg);
  }
}

export async function processRfq(input: ProcessInput): Promise<Quote> {
  const id = newQuoteId();
  const sources: ParsedSource[] = [];
  const names = new Set<string>();
  for (const f of input.files) {
    // Two uploads with the same name would make their source references ambiguous.
    let name = f.name;
    for (let n = 2; names.has(name); n++) name = f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    names.add(name);
    sources.push(await parseUpload({ ...f, name }, { sessionId: id }));
  }
  if (input.text.trim()) sources.push(parsePastedText(input.text));
  if (!sources.length) throw new HttpError(400, 'BAD_REQUEST', 'Send an RFQ file, pasted text, or both.');
  const warnings: string[] = sources.flatMap((s) => s.notes);

  const { extraction, model: extractionModel, notes } = await runExtraction(sources, id);
  warnings.push(...notes);
  const segments = sources.flatMap((s) => s.segments);
  const tight = (t: string) => t.toLowerCase().replace(/[\s|;:/]+/g, '');
  const kept: { anchor: Anchor; raw: (typeof extraction.items)[number] }[] = [];
  let untraceable = 0;
  for (const raw of extraction.items) {
    const anchor = anchorToSource(raw, segments);
    if (!anchor) { untraceable++; continue; } // not traceable to the customer's documents → dropped, never invented
    // Overlapping excerpts can return the same item twice, once cut short at the excerpt edge: keep the fuller one.
    const dup = kept.findIndex((k) => k.anchor.start <= anchor.end && anchor.start <= k.anchor.end
      && (tight(k.anchor.text).includes(tight(anchor.text)) || tight(anchor.text).includes(tight(k.anchor.text))));
    if (dup >= 0) {
      if (anchor.end - anchor.start > kept[dup]!.anchor.end - kept[dup]!.anchor.start) kept[dup] = { anchor, raw };
      continue;
    }
    kept.push({ anchor, raw });
  }
  if (untraceable) warnings.push(`${untraceable} extracted line${untraceable === 1 ? ' was' : 's were'} dropped because the text could not be found in the RFQ.`);
  if (kept.length > MAX_LINES) {
    warnings.push(`The RFQ lists ${kept.length} lines; only the first ${MAX_LINES} are quoted. Split the RFQ to quote the rest.`);
    kept.length = MAX_LINES;
  }
  const items: ExtractedItem[] = kept.map(({ anchor, raw }, i) => {
    const { spec, provenance } = toSpec(raw);
    return { id: `line-${i + 1}`, original: anchor.text.slice(0, 8000), source: anchor.ref, spec, provenance, conflicts: [], included: true, classification: null };
  });
  if (!items.length) {
    throw new HttpError(422, 'NO_LINE_ITEMS', 'No requested line items were found in the RFQ. Check that the document lists the materials to quote (a blank template has none).');
  }
  crossSourceConflicts(items);

  let classificationProvider = 'TypeSafe Jev';
  const fullText = sources.flatMap((s) => s.segments.map((g) => g.text)).join('\n');
  const [classified, injection] = await Promise.all([
    mapLimit(items, 4, (it) => classifyLine(it.original, id).then((c) => c, (e: Error) => e)),
    detectInjection(fullText, id).catch((e: Error) => e),
  ]);
  const jevErrors = classified.filter((c): c is Error => c instanceof Error);
  classified.forEach((c, i) => { if (!(c instanceof Error)) items[i]!.classification = c as Classification; });
  const jevModel = (classified.find((c) => !(c instanceof Error)) as Classification | undefined)?.model;
  if (jevModel) classificationProvider = `TypeSafe Jev · ${jevModel}`;
  if (jevErrors.length) {
    warnings.push(`Jev classification unavailable for ${jevErrors.length} line(s): ${jevErrors[0]!.message}`);
    if (!jevModel) classificationProvider = 'TypeSafe Jev (unavailable for this request)';
  }
  if (injection instanceof Error) warnings.push(`Jev prompt-injection check unavailable: ${injection.message}`);
  if (extraction.items.length > items.length) warnings.push(`${extraction.items.length - items.length} extracted line(s) were duplicated or could not be traced to the source and were omitted. Review the original request for completeness.`);
  if (!(injection instanceof Error) && injection.flagged) {
    warnings.push(`Possible prompt-injection text detected in the RFQ (Jev ${Math.round(injection.probability * 100)}%). It was treated as customer data only and cannot change pricing or approvals.`);
  }
  if (extraction.customer && input.customer.trim() && extraction.customer.toLowerCase() !== input.customer.trim().toLowerCase()) {
    warnings.push(`The document names the customer "${extraction.customer}"; the quote uses "${input.customer.trim()}".`);
  }

  const fullOriginal = sources.map((s) => `--- ${s.name} ---\n${s.segments.map((g) => g.text).join('\n')}`).join('\n\n');
  const originalText = fullOriginal.length > MAX_TEXT_CHARS ? `${fullOriginal.slice(0, MAX_TEXT_CHARS - 40)}\n… [source text truncated for display]` : fullOriginal;
  return buildQuote({
    id,
    customer: input.customer.trim() || extraction.customer || '',
    rfqReference: extraction.rfqReference?.slice(0, 200) ?? null,
    ...quoteDates(),
    originalText,
    targetMargin: input.targetMargin,
    items,
    provider: { extraction: `Nicrron · ${extractionModel}`, classification: classificationProvider },
    warnings,
  });
}
