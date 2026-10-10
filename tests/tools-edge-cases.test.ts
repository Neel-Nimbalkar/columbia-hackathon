import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CATALOG } from '../src/lib/server/catalog';
import { priceLine, buildQuote } from '../src/lib/server/engine';
import { marginPriceCents } from '../src/lib/shared/pricing';
import { crossSection, parseFraction, SHAPES } from '../src/lib/shared/metals';
import { emptySpec } from '../src/lib/shared/schema';
import { recordProcessed, recordUpdate, setStatus, ledgerCsv, dealState, setNote } from '../src/lib/client/ledger';

test('every tool margin preview agrees with server pricing, including 80% and precise decimals', () => {
  for (const p of CATALOG) for (const m of [0, .2, .8, .123456789, 1e-7]) assert.equal(marginPriceCents(Math.round(p.costCents / 100 * 100), m) / 100, priceLine(p, 1, m, '2026-10-10').unitPrice);
  assert.equal(marginPriceCents(10000, .8), 50000);
  for (const m of [-1, 1, NaN, Infinity]) assert.throws(() => marginPriceCents(100, m));
});

test('fractions and shape calculations reject invalid and ambiguous measurements', () => {
  for (const raw of ['0/1', '0-0/2', '1/0', '-2', '1 or 2', '1,2', '0x10', 'Infinity', '9'.repeat(400) + '/1']) assert.equal(parseFraction(raw), null, raw);
  assert.equal(parseFraction('1-1/2'), 1.5); assert.equal(parseFraction('1,000'), 1000);
  assert.equal(crossSection('round tube', { d: 1, t: .6 }), null);
  assert.equal(crossSection('square tube', { w: 2, h: 1, t: .5 }), null);
  for (const shape of SHAPES) assert.ok(crossSection(shape.id, { t: .1, w: 2, h: 2, d: 2, a: 2 })! > 0);
});

test('Pipeline drops corrupt records, preserves edited references and outcomes, and exports inert CSV', () => {
  const dom = new JSDOM('', { url: 'http://localhost' });
  Object.assign(globalThis, { localStorage: dom.window.localStorage });
  localStorage.setItem('rudco.ledger.v1', JSON.stringify([{ id: 'bad', quote: {} }]));
  const q = buildQuote({ id: 'ledger-test', customer: '=HYPERLINK("bad")', date: '2026-10-10', expires: '2026-10-11', targetMargin: .2, originalText: 'x'.repeat(20000), items: [{ id: '1', original: 'test', source: 'text', spec: emptySpec, included: true, provenance: {}, conflicts: [] }], provider: { extraction: 'test', classification: 'test' } });
  recordProcessed(q, 'text', 500);
  recordUpdate({ ...q, rfqReference: 'updated' }); setStatus(q.id, 'lost', 'Price'); setNote(q.id, '@SUM(1,2)\rnext');
  let entries = JSON.parse(localStorage.getItem('rudco.ledger.v1')!);
  assert.equal(entries.length, 1); assert.equal(entries[0].rfqReference, 'updated'); assert.equal(entries[0].lossReason, 'Price');
  assert.ok(entries[0].quote.originalText.length < 13000);
  assert.ok(ledgerCsv(entries).includes("'=HYPERLINK")); assert.ok(ledgerCsv(entries).includes("'@SUM"));
  setStatus(q.id, 'sent'); entries = JSON.parse(localStorage.getItem('rudco.ledger.v1')!);
  assert.equal(dealState(entries[0], '2026-10-11'), 'sent'); assert.equal(dealState(entries[0], '2026-10-12'), 'expired'); assert.equal(entries[0].lossReason, null);
  setStatus(q.id, 'draft'); entries = JSON.parse(localStorage.getItem('rudco.ledger.v1')!); assert.equal(entries[0].sentAt, null);
  const storage = globalThis.localStorage;
  Object.assign(globalThis, { localStorage: { getItem: storage.getItem.bind(storage), setItem() { throw new Error('quota'); } } });
  assert.doesNotThrow(() => recordUpdate(q));
  Object.assign(globalThis, { localStorage: storage }); dom.window.close();
});
