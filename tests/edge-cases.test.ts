import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { extractText } from 'unpdf';
import { CATALOG } from '../src/lib/server/catalog';
import { buildQuote, priceLine } from '../src/lib/server/engine';
import { applyAnswer } from '../src/lib/server/clarify';
import { toSpec, rawItemSchema, anchorToSource } from '../src/lib/server/extract';
import { parseMeasure, normalizeQtyUnit } from '../src/lib/server/normalize';
import { emptySpec, quoteSchema, type ExtractedItem, type Spec } from '../src/lib/shared/schema';
import { signingSnapshot, type Signature } from '../src/lib/shared/acceptance';
import { acceptQuote } from '../src/lib/server/acceptance';
import { generateQuotePdf } from '../src/lib/server/pdf';
import { POST as pdfPOST } from '../src/app/api/quote/pdf/route';
import { POST as acceptPOST } from '../src/app/api/quote/accept/route';
import { isIsoDate } from '../src/lib/shared/dates';

const now = new Date('2026-10-10T12:00:00Z');
const spec: Spec = { ...emptySpec, material: 'aluminum', grade: '6061', temper: 'T651', form: 'plate', thickness: .25, width: 12, length: 24, dimensionUnit: 'in', quantity: 2, quantityUnit: 'pc' };
const item = (patch: Partial<ExtractedItem> = {}): ExtractedItem => ({ id: 'line-1', original: '6061-T651 plate 1/4 x 12 x 24 in, qty 2', source: 'Pasted text · line 1', spec: { ...spec }, conflicts: [], provenance: {}, included: true, classification: null, ...patch });
const quote = (items: ExtractedItem[] = [item()], targetMargin = .2) => buildQuote({ id: 'RQ-EDGE', customer: 'Acme', rfqReference: 'RFQ-118', date: '2026-10-10', expires: '2026-11-09', originalText: 'Original request', targetMargin, items, provider: { extraction: 'Nicrron', classification: 'Jev' } });
const signer: Signature = { name: 'Buyer Name', email: 'buyer@example.com', company: 'Acme', consent: true };
const answer = (fields: Record<string, unknown>, dimensionUnit: string | null = null, resolvesConflict = false) => ({ fields, dimensionUnit, resolvesConflict }) as Parameters<typeof applyAnswer>[1];
const send = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

for (const value of ['0/1', '1-1/0', '1 1/0', '1/0', '2 or 3', 'approximately 10', 'TBD', '-1', 'Infinity', '']) {
  test(`uncertain/invalid measure stays unknown: ${JSON.stringify(value)}`, () => {
    assert.equal(parseMeasure(value), null);
    assert.equal(toSpec(rawItemSchema.parse({ quantity: value })).spec.quantity, null);
  });
}
test('mixed fractions and grouped counts are preserved exactly', () => {
  assert.equal(toSpec(rawItemSchema.parse({ quantity: '1 1/2' })).spec.quantity, 1.5);
  assert.equal(toSpec(rawItemSchema.parse({ quantity: '1,000' })).spec.quantity, 1000);
  assert.equal(normalizeQtyUnit('pkg'), null);
  assert.equal(normalizeQtyUnit('pk'), null);
});
for (const field of ['temper', 'thickness', 'width', 'length', 'dimensionUnit', 'quantity', 'grade', 'form'] as const) {
  test(`missing ${field} never yields ready pricing`, () => {
    const q = quote([item({ spec: { ...spec, [field]: null } })]);
    assert.equal(q.ready, false); assert.equal(q.items[0]!.pricing, null); assert.ok(q.items[0]!.questions.length);
    assert.ok(quoteSchema.safeParse(q).success);
  });
}
for (const field of ['finish', 'gauge', 'quantityUnit', 'mtr', 'standards', 'certifications', 'countryOfOrigin', 'tolerance', 'form'] as const) {
  test(`inferred ${field} requires buyer confirmation`, () => {
    const q = quote([item({ provenance: { [field]: 'suggestion' } })]);
    assert.equal(q.ready, false); assert.ok(q.items[0]!.questions.some(q => q.includes(`${field} was inferred`)));
  });
}
test('inferred grade carries uncertainty to derived material and temper', () => {
  const r = toSpec(rawItemSchema.parse({ grade: '6061-T651', inferredFields: ['grade'] }));
  assert.equal(r.provenance.material, 'suggestion'); assert.equal(r.provenance.temper, 'suggestion');
});
test('conflicting gauge and decimal thickness require a choice', () => {
  const q = quote([item({ spec: { ...emptySpec, material: 'stainless steel', grade: '304', form: 'sheet', gauge: 16, thickness: .1, width: 12, length: 24, dimensionUnit: 'in', finish: '#2', quantity: 2, quantityUnit: 'pc' } })]);
  assert.equal(q.ready, false); assert.equal(q.items[0]!.pricing, null); assert.match(q.items[0]!.questions.join(' '), /Which thickness/);
});
test('known and unknown mixed units retain only confirmed dimensions', () => {
  const { spec } = toSpec(rawItemSchema.parse({ thickness: { value: '6.35', unit: 'mm' }, width: { value: '12', unit: null }, length: { value: '609.6', unit: 'mm' } }));
  assert.equal(spec.dimensionUnit, 'in'); assert.equal(spec.thickness, .25); assert.equal(spec.length, 24); assert.equal(spec.width, null);
});
test('partial dimension answer does not assign units to untouched values', () => {
  const i = item({ spec: { ...spec, dimensionUnit: null } });
  const a = applyAnswer(i, answer({ width: { value: '304.8', unit: 'mm' } }));
  assert.equal(a.spec.dimensionUnit, 'in'); assert.equal(a.spec.width, 12); assert.equal(a.spec.length, null); assert.equal(a.spec.thickness, null); assert.equal(quote([a]).ready, false);
});
test('mixed partial answer leaves unstated dimension units unknown', () => {
  const a = applyAnswer(item({ spec: { ...spec, dimensionUnit: null } }), answer({ width: { value: '304.8', unit: 'mm' }, length: { value: '24', unit: null } }));
  assert.equal(a.spec.width, 12); assert.equal(a.spec.length, null);
});
test('global feet clarification normalizes existing unitless dimensions', () => {
  const a = applyAnswer(item({ spec: { ...spec, thickness: 1/48, width: 1, length: 2, dimensionUnit: null } }), answer({}, 'ft'));
  assert.equal(quote([a]).ready, true); assert.equal(quote([a]).items[0]!.normalized.length, 24);
});
test('unrelated answers cannot clear source conflicts even when model asserts resolution', () => {
  const conflicts = ['Conflicting requirements — grade: a says 6061, b says 5052; quantity: a says 2, b says 3. Which is correct?'];
  const a = applyAnswer(item({ conflicts }), answer({ finish: 'mill' }, null, true));
  assert.deepEqual(a.conflicts, conflicts);
  const b = applyAnswer(item({ conflicts }), answer({ grade: '6061' }, null, true));
  assert.deepEqual(b.conflicts, conflicts);
  const c = applyAnswer(item({ conflicts }), answer({ grade: '6061', quantity: '2' }, null, true));
  assert.deepEqual(c.conflicts, []);
  assert.throws(() => applyAnswer(item({ conflicts }), answer({}, null, true)), { code: 'CLARIFICATION_NOT_UNDERSTOOD' });
});
test('EN 10204 3.1 stays an explicit certification requirement', () => {
  const { spec: s } = toSpec(rawItemSchema.parse({ certifications: ['EN 10204 3.1 MTR'] }));
  assert.equal(s.mtr, true); assert.deepEqual(s.certifications, ['EN 10204 3.1 MTR']);
  assert.equal(quote([item({ spec: { ...spec, ...s, material: spec.material, grade: spec.grade, temper: spec.temper } })]).ready, false);
});
test('empty source text cannot justify model-generated requirements', () => {
  assert.equal(anchorToSource(rawItemSchema.parse({ original: '', ref: 'Pasted text · line 1', grade: '6061' }), [{ ref: 'Pasted text · line 1', text: 'hello' }]), null);
});
test('duplicate IDs cannot address the wrong quote line', () => {
  assert.equal(quoteSchema.safeParse(quote([item(), item()])).success, false);
});
test('fractional piece and package quantities cannot be priced', () => {
  for (const patch of [{ quantity: 1.5 }, { quantityUnit: 'pkg' }]) {
    const q = quote([item({ spec: { ...spec, ...patch } })]);
    assert.equal(q.ready, false); assert.equal(q.items[0]!.pricing, null); assert.ok(q.items[0]!.questions.length);
  }
});
test('exclusion releases aggregate stock, including re-inclusion', () => {
  const product = CATALOG.find(p => p.supplierPartNumber === '61p.25' && p.width === 12 && p.length === 24)!;
  const items = [item({ spec: { ...spec, quantity: product.stock } }), item({ id: 'line-2', spec: { ...spec, quantity: 1 } })];
  assert.equal(quote(items).ready, false);
  items[1]!.included = false; assert.equal(quote(items).ready, true);
  items[1]!.included = true; assert.equal(quote(items).ready, false);
});
test('all-excluded quote cannot export or sign', async () => {
  const q = quote([item({ included: false })]);
  assert.equal(q.total, 0); assert.equal(q.ready, false);
  assert.equal((await pdfPOST(send({ quote: q }))).status, 422);
  await assert.rejects(() => acceptQuote(q, signer, now), { code: 'QUOTE_BLOCKED' });
});
test('every catalog price preserves arbitrary margin precision and integer-cent totals', () => {
  for (const p of CATALOG) for (const margin of [0, .000051, .1234567, .2, .3333333, .7999999, .8]) {
    const price = priceLine(p, 7, margin, '2026-10-10');
    assert.ok(price.margin + 1e-14 >= margin, `${p.sku}, ${margin}`);
    assert.equal(Math.round(price.lineTotal * 100), Math.round(price.unitPrice * 100) * 7);
  }
});
test('stale, incomparable and synthetic benchmarks never claim competitiveness', () => {
  const p = CATALOG.find(p => p.listPrice)!;
  for (const product of [{ ...p, retrievedDate: '2020-01-01' }, { ...p, listPrice: { ...p.listPrice!, synthetic: true } }, { ...p, listPrice: { ...p.listPrice!, unit: 'lb' as const } }]) {
    assert.equal(priceLine(product, 1, .2, '2026-10-10').competitive, null);
  }
});
for (const date of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-1-1', 'bad']) {
  test(`invalid calendar date cannot export: ${date}`, async () => {
    assert.equal(isIsoDate(date), false);
    assert.equal((await pdfPOST(send({ quote: { ...quote(), date } }))).status, 422);
  });
}
test('acceptance expiration is inclusive in UTC and future dates block', async () => {
  const q = { ...quote(), expires: '2026-10-10' };
  assert.ok((await acceptQuote(q, signer, new Date('2026-10-10T23:59:59Z'))).acceptance.id);
  await assert.rejects(() => acceptQuote(q, signer, new Date('2026-10-11T00:00:00Z')), { code: 'QUOTE_EXPIRED' });
  await assert.rejects(() => acceptQuote({ ...quote(), date: '2026-10-11' }, signer, now), { code: 'QUOTE_NOT_YET_VALID' });
});
test('acceptance rejects buyer mismatch, missing consent, and commercial tampering', async () => {
  await assert.rejects(() => acceptQuote(quote(), { ...signer, company: 'Other' }, now), { code: 'BUYER_MISMATCH' });
  assert.equal((await acceptPOST(send({ quote: quote(), signature: { ...signer, consent: false } }))).status, 400);
  for (const patch of [{ total: .01 }, { disclosure: 'verified stock' }, { items: quote().items.map(i => ({ ...i, matchedSku: 'fake' })) }]) {
    await assert.rejects(() => acceptQuote({ ...quote(), ...patch }, signer, now), { code: 'QUOTE_CHANGED' });
  }
});
test('signed PDF retains customer reference, review warnings, exact Unicode signer and matching digest', async () => {
  const q = { ...quote(), warnings: ['Source scan needs review.'] };
  const { quote: validated, acceptance } = await acceptQuote(q, { ...signer, name: '李明 García' }, now);
  assert.equal(acceptance.quoteHash, createHash('sha256').update(JSON.stringify(signingSnapshot(validated))).digest('hex'));
  const bytes = await generateQuotePdf(validated, acceptance);
  const doc = await PDFDocument.load(bytes);
  assert.match(doc.getTitle()!, /^Signed/);
  const text = (await extractText(bytes, { mergePages: true })).text;
  assert.match(text, /RFQ-118/); assert.match(text, /Source scan needs review/); assert.match(text, /BUYER ACCEPTANCE/);
  const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict);
  const files = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  const record = files.lookup(1, PDFDict).lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F')) as PDFRawStream;
  const payload = JSON.parse(Buffer.from(decodePDFRawStream(record).decode()).toString('utf8'));
  assert.equal(payload.acceptance.name, '李明 García'); assert.equal(payload.quotation.rfqReference, 'RFQ-118'); assert.deepEqual(payload.quotation.warnings, q.warnings);
});

test('80% margin does not add a floating-point phantom cent', () => {
  for (const p of CATALOG) assert.equal(Math.round(priceLine(p, 1, .8, '2026-10-10').unitPrice * 100), p.costCents * 5);
});
test('invalid numeric quantities stay unknown and never violate the output schema', () => {
  for (const quantity of [-1, 0, 100001]) assert.equal(toSpec(rawItemSchema.parse({ quantity })).spec.quantity, null);
});
