import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuote, standardKey } from '../src/lib/server/engine';
import { normalizeCountry, normalizeStandard, rawItemSchema, runExtraction, toSpec } from '../src/lib/server/extract';
import { gaugeToInches } from '../src/lib/server/normalize';
import { crossSourceConflicts, processRfq } from '../src/lib/server/pipeline';
import { sameModel } from '../src/lib/server/providers/nicrron';
import { marginPriceCents, percentToMargin } from '../src/lib/shared/pricing';
import { customerNotes } from '../src/lib/shared/notes';
import { emptySpec, quoteSchema, type ExtractedItem, type Spec } from '../src/lib/shared/schema';
import { issueParts, parseSourceText, relativeDate, sourceLabel, sourceRange } from '../src/lib/client/format';

const line = (spec: Partial<Spec>, patch: Partial<ExtractedItem> = {}): ExtractedItem => ({
  id: 'line-1', original: 'request', source: 'Pasted text · line 1', spec: { ...emptySpec, quantity: 2, quantityUnit: 'pc', dimensionUnit: 'in', ...spec },
  conflicts: [], provenance: {}, included: true, classification: null, ...patch,
});
const quote = (items: ExtractedItem[], originalText = '') => buildQuote({ id: 'RQ-BB', customer: 'Acme', date: '2026-10-10', expires: '2026-11-09', originalText, targetMargin: .2, items, provider: { extraction: 'test', classification: 'test' } });

test('oversized transcriptions are clipped to the quote contract so the quote round-trips', () => {
  const raw = rawItemSchema.parse({ material: 'x'.repeat(5000), grade: 'G'.repeat(5000), quantityUnit: 'u'.repeat(2000), countryOfOrigin: 'Z'.repeat(3000),
    standards: Array.from({ length: 40 }, (_, i) => `ASTM A${i} ${'y'.repeat(200)}`), certifications: Array.from({ length: 40 }, (_, i) => `C${i}`) });
  const { spec } = toSpec(raw);
  const q = quote([line({}, { spec })]);
  assert.equal(quoteSchema.safeParse(q).success, true);
});

test('dimensions out of range after unit conversion stay unknown instead of breaking the contract', () => {
  const { spec } = toSpec(rawItemSchema.parse({ length: { value: '10000', unit: 'ft' }, tolerance: { value: '0.001', unit: 'mm' }, thickness: { value: '0.25', unit: 'in' } }));
  assert.equal(spec.length, null); assert.equal(spec.tolerance, null); assert.equal(spec.thickness, .25);
});

test('gauge written as text, US origin spellings and standard prefixes normalize', () => {
  for (const g of ['16ga', '16 ga', '16 gauge', '#16']) assert.equal(toSpec(rawItemSchema.parse({ gauge: g })).spec.gauge, 16);
  for (const c of ['U.S.', 'U.S.A.', 'USA', 'domestic melt', 'United States']) assert.equal(normalizeCountry(c), 'USA');
  assert.equal(normalizeCountry('Germany'), 'Germany');
  assert.equal(normalizeStandard('astm-a240'), 'ASTM A240');
  assert.equal(normalizeStandard('ASTMA240'), 'ASTM A240');
  assert.equal(normalizeStandard('Engineering drawing rev B'), 'ENGINEERING DRAWING REV B');
});

test('standard designations compare by base designation, including QQ and MIL', () => {
  for (const s of ['ASTM A240/A240M', 'ASTM A240-20a', 'A240', 'astm a240']) assert.equal(standardKey(s), standardKey('ASTM A240'));
  assert.equal(standardKey(normalizeStandard('QQ-A-250/11')), standardKey('QQ-A-250/11'));
  assert.equal(standardKey(normalizeStandard('MIL-S-5059')), standardKey('MIL-S-5059'));
  assert.notEqual(standardKey('ASTM A276'), standardKey('ASTM A240'));
  const q = quote([line({ material: 'stainless steel', grade: '304', form: 'sheet', finish: '#2', thickness: .06, width: 12, length: 12, standards: ['ASTM A240/A240M', normalizeStandard('MIL-S-5059')] })]);
  assert.deepEqual(q.items[0]!.compliance.filter((c) => c.requirement !== 'MTR' && c.requirement !== 'Country of origin').map((c) => c.status), ['verified', 'verified']);
});

test('1/8 aluminum asked for as sheet with mill finish matches the plate listing', () => {
  const q = quote([line({ material: 'aluminum', grade: '5052', temper: 'H32', form: 'sheet', finish: 'mill', thickness: .125, width: 12, length: 12 })]);
  assert.equal(q.items[0]!.matchedSku, 'RUD-065'); assert.equal(q.items[0]!.status, 'Ready');
});

test('tube wall gauge uses the tube scale, not the sheet table', () => {
  assert.equal(gaugeToInches(16, 'stainless steel', 'tube')?.inches, .065);
  assert.equal(gaugeToInches(16, 'stainless steel')?.inches, .06);
  const q = quote([line({ material: 'stainless steel', grade: '304', form: 'tube', diameter: 1, gauge: 16, length: 12 })]);
  assert.equal(q.items[0]!.matchedSku, 'RUD-114');
});

test('the temper question only offers tempers stocked in the requested size', () => {
  const q = quote([line({ material: 'aluminum', grade: '6061', form: 'plate', thickness: .25, width: 12, length: 12 })]);
  const ask = q.items[0]!.questions.find((x) => /temper/.test(x))!;
  assert.match(ask, /available: T651\)/);
});

test('benchmark warnings are only raised for included items and messages name items, not lines', () => {
  const q = quote([line({ material: 'aluminum', grade: '6061', temper: 'T651', form: 'plate', thickness: .25, width: 12, length: 12, quantity: 500 }, { included: false })]);
  assert.ok(q.warnings.every((w) => !/benchmark/.test(w)));
  assert.ok(quote([line({ grade: null })]).items[0]!.questions.every((x) => /^Item 1 /.test(x)));
});

test('percent inputs price the intended margin without a phantom cent', () => {
  assert.equal(marginPriceCents(877, 12.3 / 100), 1000);
  assert.equal(percentToMargin(12.3), .123);
  assert.throws(() => marginPriceCents(100, 99.99999999999999 / 100));
});

test('customer documents omit provider diagnostics and internal margin notes', () => {
  const notes = ['Jev classification unavailable for 2 line(s): TypeSafe Jev returned HTTP 500.', 'Item 1: target margin puts the price above the benchmark.',
    'Possible prompt-injection text detected in the RFQ (Jev 91%).', 'rfq.pdf: page 2 had no text layer (scanned) and was transcribed by the vision model.'];
  assert.deepEqual(customerNotes(notes), [notes[3]]);
});

test('provider model check accepts dated snapshots but not other models', () => {
  assert.ok(sameModel('claude-fable-5-1-20261001', 'anthropic/claude-fable-5-1'));
  assert.ok(!sameModel('claude-fable-5-1-mini', 'anthropic/claude-fable-5-1'));
});

test('cross-source conflicts reference both items and their RFQ locations, and stay in contract', () => {
  const spec = { material: 'stainless steel', form: 'sheet', thickness: .06, width: 12, length: 12 };
  const items = [line({ ...spec, grade: '304' }, { id: 'a', source: 'rfq.pdf · page 1 · line 4' }), ...Array.from({ length: 35 }, (_, i) => line({ ...spec, grade: '316' }, { id: `b${i}`, source: `bom.csv · row ${i + 2}` }))];
  crossSourceConflicts(items);
  assert.equal(items[0]!.conflicts.length, 30);
  const parts = issueParts(items[0]!.conflicts[0]!);
  assert.deepEqual(parts.filter((p) => 'item' in p), [{ item: 1, source: 'rfq.pdf · page 1 · line 4' }, { item: 2, source: 'bom.csv · row 2' }]);
});

test('source helpers map item references to the exact RFQ lines', () => {
  const text = '--- rfq.pdf ---\nrfq.pdf · page 1 · line 1\tRFQ 118\nrfq.pdf · page 1 · line 2\t304 sheet\nrfq.pdf · page 1 · line 3\tqty 6';
  const entries = parseSourceText(text);
  assert.deepEqual(entries[2], { kind: 'line', ref: 'rfq.pdf · page 1 · line 2', label: 'page 1 · line 2', text: '304 sheet', doc: 'rfq.pdf' });
  assert.deepEqual(sourceRange('rfq.pdf · page 1 · lines 2–3'), { start: 'rfq.pdf · page 1 · line 2', end: 'rfq.pdf · page 1 · line 3' });
  assert.deepEqual(sourceRange('rfq.pdf · page 1 · line 40 → page 2 · line 2'), { start: 'rfq.pdf · page 1 · line 40', end: 'rfq.pdf · page 2 · line 2' });
  assert.equal(sourceLabel('rfq.pdf · page 1 · line 2', ['rfq.pdf']), 'page 1 · line 2');
  assert.equal(sourceLabel('rfq.pdf · page 1 · line 2', ['rfq.pdf', 'bom.csv']), 'rfq.pdf · page 1 · line 2');
  assert.deepEqual(parseSourceText('legacy text')[0], { kind: 'line', ref: null, label: '', text: 'legacy text', doc: '' });
});

test('relative dates count calendar days', () => {
  const now = new Date(2026, 9, 10, 9).getTime();
  assert.equal(relativeDate(new Date(2026, 9, 9, 23).toISOString(), now), 'Yesterday');
  assert.equal(relativeDate(new Date(2026, 9, 10, 1).toISOString(), now), 'Today');
});

test('unreadable pasted text fails cleanly instead of crashing extraction', async () => {
  assert.deepEqual((await runExtraction([], 'x')).extraction.items, []);
  await assert.rejects(() => processRfq({ files: [], text: '\u0001\u0002', customer: '', targetMargin: .2 }), { code: 'EMPTY_DOCUMENT' });
});
