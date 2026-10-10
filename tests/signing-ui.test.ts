import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { FinalQuote } from '../src/components/FinalQuote';
import { Sidebar } from '../src/components/Sidebar';
import { buildQuote } from '../src/lib/server/engine';
import { emptySpec } from '../src/lib/shared/schema';
import { bareQuestion } from '../src/lib/client/format';
import type { Signature } from '../src/lib/shared/acceptance';

const q = buildQuote({ id: 'RQ-UI', customer: 'Acme', date: new Date().toISOString().slice(0,10), expires: '2099-12-31', targetMargin: .2, originalText: '', items: [{ id: 'line-1', original: '6061-T651 plate 1/4 x 12 x 24 in qty 2', source: 'Pasted text', included: true, provenance: {}, conflicts: [], spec: { ...emptySpec, material: 'aluminum', grade: '6061', temper: 'T651', form: 'plate', thickness: .25, width: 12, length: 24, dimensionUnit: 'in', quantity: 2, quantityUnit: 'pc' } }], provider: { extraction: 'Nicrron', classification: 'Jev' } });

async function setup() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const input = (label: string) => [...document.querySelectorAll('label')].find(l => l.textContent?.startsWith(label))!.querySelector('input')!;
  const fill = async (element: HTMLInputElement, value: string) => { await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }); };
  return { dom, root, input, fill };
}

test('signing requires explicit authorization and clears it when signer or quote changes', async () => {
  const { dom, root, input, fill } = await setup();
  const signatures: Signature[] = [];
  const props = { quote: q, busy: null as string | null, onEdit: () => {}, onExport: () => {}, onSign: (s: Signature) => signatures.push(s), signed: null, onDownloadSigned: () => {}, onBack: () => {}, onNew: () => {} };
  const render = async (changes = {}) => act(async () => root.render(createElement(FinalQuote, { ...props, ...changes })));
  const button = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Sign & download PDF')!;
  await render(); assert.equal((document.querySelector('.signing') as HTMLDetailsElement).open, false);
  (document.querySelector('.signing') as HTMLDetailsElement).open = true; assert.equal(button().disabled, true);
  await fill(input('Full name'), 'Buyer Name'); await fill(input('Email'), 'buyer@example.com');
  assert.equal(button().disabled, true);
  await act(async () => input('I confirm').click());
  assert.equal(button().disabled, false);
  await act(async () => document.querySelector('.signing form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(signatures.length, 1); assert.equal(signatures[0]!.consent, true);
  await fill(input('Full name'), 'Changed Buyer'); assert.equal(input('I confirm').checked, false); assert.equal(button().disabled, true);
  await act(async () => input('I confirm').click());
  await render({ quote: { ...q, rfqReference: 'CHANGED' } });
  assert.equal(input('I confirm').checked, false);
  await render({ busy: 'Signing quote' });
  assert.ok([...document.querySelectorAll('input')].every(i => i.disabled));
  assert.equal([...document.querySelectorAll('button')].find(b => b.textContent === 'Back to review')!.disabled, true);
  await act(async () => root.unmount()); dom.window.close();
});

test('signed quote downloads the saved artifact and navigation locks during operations', async () => {
  const { dom, root } = await setup();
  let downloads = 0;
  const props = { quote: q, busy: null, onEdit: () => {}, onExport: () => {}, onSign: () => {}, signed: { id: 'accepted', signedAt: '2026-10-10T12:00:00Z', name: 'Buyer' }, onDownloadSigned: () => downloads++, onBack: () => {}, onNew: () => {} };
  await act(async () => root.render(createElement(FinalQuote, props)));
  assert.equal(document.querySelector('.signing form'), null);
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Download signed PDF')!.click());
  assert.equal(downloads, 1);
  globalThis.fetch = (async () => Response.json({ status: 'ok', providers: { nicrron: { configured: true, model: 'test' }, typesafe: { configured: true } } })) as typeof fetch;
  await act(async () => root.render(createElement(Sidebar, { view: 'final', quote: q, disabled: true, onView: () => {} })));
  assert.ok([...document.querySelectorAll('nav button')].every(b => (b as HTMLButtonElement).disabled));
  await act(async () => root.unmount()); dom.window.close();
});

test('sample requests preserve zero margin and reject invalid margins before processing', async () => {
  const { NewRfq } = await import('../src/components/NewRfq');
  const { dom, root } = await setup();
  const requests: { margin: number }[] = []; const errors: string[] = [];
  const props = { draft: { text: '', files: [], customer: '', margin: '0' }, onDraft: () => {}, processing: null, onProcess: (r: { margin: number }) => requests.push(r), onError: (e: string) => errors.push(e) };
  const render = async (margin: string) => act(async () => root.render(createElement(NewRfq, { ...props, draft: { ...props.draft, margin } })));
  await render('0');
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Run sample')!.click());
  assert.equal(requests[0]!.margin, 0);
  await render('90');
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Run sample')!.click());
  assert.equal(requests.length, 1); assert.equal(errors.length, 1);
  await act(async () => root.unmount()); dom.window.close();
});

test('review exposes all uncertainty and compliance blockers without unsupported email actions', async () => {
  const { Workspace } = await import('../src/components/Workspace');
  const { dom, root } = await setup();
  const uncertain = buildQuote({ ...q, items: [{ ...q.items[0]!, id: 'unknown', original: '6061 plate, temper and qty TBD', spec: { ...q.items[0]!.spec, quantity: null, temper: null }, conflicts: ['Buyer listed two different widths.'] }, { ...q.items[0]!, id: 'evidence', spec: { ...q.items[0]!.spec, certifications: ['EN 10204 3.2'] } }] });
  for (const item of uncertain.items) {
    await act(async () => root.render(createElement(Workspace, { quote: uncertain, selected: item.id, onSelect: () => {}, busy: null, onChangeLine: async () => true, onNext: () => {}, onNew: () => {} })));
    for (const blocker of [...item.questions, ...item.conflicts, ...item.blockers]) assert.ok(document.querySelector('.detail')!.textContent!.includes(bareQuestion(blocker)));
    assert.ok([...document.querySelectorAll('.line-disclosures details')].every(d => !(d as HTMLDetailsElement).open));
    assert.equal(document.querySelector('a[href^="mailto:"]'), null);
    assert.ok(![...document.querySelectorAll('button')].some(b => /email|Ask buyer/i.test(b.textContent!)));
  }
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'View RFQ')!.click());
  assert.ok(document.querySelector('[role="dialog"]')?.textContent?.includes('Original RFQ'));
  await act(async () => root.unmount()); dom.window.close();
});

test('combined intake → review → download → Pipeline keeps drafts unsent and reopens them', async () => {
  const { dom, root } = await setup();
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  Object.assign(globalThis, { localStorage: dom.window.localStorage, ResizeObserver: class { observe() {} disconnect() {} } });
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  const requests: string[] = []; const fetchBefore = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => { requests.push(String(url)); return String(url) === '/api/rfq/process' ? Response.json(q) : new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } }); }) as typeof fetch;
  const Home = (await import('../src/app/page')).default;
  await act(async () => root.render(createElement(Home)));
  assert.ok([...document.querySelectorAll('.intake details')].every(d => !(d as HTMLDetailsElement).open));
  const click = async (text: string) => act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === text)!.click());
  await act(async () => {
    const text = document.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(text, q.items[0]!.original);
    text.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click('Process RFQ'); assert.equal(document.querySelector('h1')?.textContent, 'Review RFQ');
  await click('Review quote'); assert.equal(document.querySelector('a[href^="mailto:"]'), null);
  assert.ok(![...document.querySelectorAll('button')].some(b => /email/i.test(b.textContent!))); await click('Download PDF');
  assert.deepEqual(requests, ['/api/rfq/process', '/api/quote/pdf']);
  const saved = JSON.parse(localStorage.getItem('rudco.ledger.v1')!); assert.equal(saved[0].status, 'draft');
  await click('Tools'); await click('Pipeline'); assert.equal(document.querySelector('a[href^="mailto:"]'), null); assert.equal(document.querySelector('h1')?.textContent, 'Pipeline');
  assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Status of RQ-UI"]')!.value, 'draft');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Open RQ-UI"]')!.click());
  assert.equal(document.querySelector('h1')?.textContent, 'Review RFQ');
  await act(async () => root.unmount()); dom.window.close(); globalThis.fetch = fetchBefore;
});

test('Calculator rejects fractional quantities and blank margins without guessing', async () => {
  const { Calculator } = await import('../src/components/Calculator');
  const { dom, root, input, fill } = await setup();
  await act(async () => root.render(createElement(Calculator)));
  await fill(input('Quantity'), '1.5'); assert.equal(document.querySelector('.result-hero'), null);
  assert.ok(document.querySelector('.calc-out')?.textContent?.includes('positive whole quantity'));
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Margin')!.click());
  await fill(input('Gross margin'), '80'); assert.ok(document.querySelector('.result-hero')?.textContent?.includes('$500.00'));
  await fill(input('Gross margin'), ''); assert.equal(document.querySelector('.result-hero'), null);
  await fill(input('Gross margin'), '99.99999999999999'); await fill(input('Unit cost'), '1000000000'); assert.equal(document.querySelector('.result-hero'), null);
  await act(async () => root.unmount()); dom.window.close();
});

test('Catalog loads the server catalog and adds a complete, explicit RFQ line', async () => {
  const { Catalog } = await import('../src/components/Catalog');
  const { GET } = await import('../src/app/api/catalog/route');
  const { dom, root } = await setup();
  const fetchBefore = globalThis.fetch; const data = await (await GET()).json();
  globalThis.fetch = (async () => Response.json(data)) as typeof fetch;
  const lines: string[] = [];
  await act(async () => root.render(createElement(Catalog, { onAddToRfq: line => lines.push(line), draftLines: 0, onGoToDraft: () => {} })));
  assert.equal(document.querySelectorAll('.catalog tbody tr').length, data.products.length);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label^="Add "]')!.click());
  assert.match(lines[0]!, /^1 pcs .+"/); assert.ok(!/null|undefined|NaN/.test(lines[0]!));
  await act(async () => root.unmount()); dom.window.close(); globalThis.fetch = fetchBefore;
});


test('review never claims competitiveness for an unconfirmed benchmark', async () => {
  const { Workspace } = await import('../src/components/Workspace');
  const { dom, root } = await setup();
  const unknown = { ...q, items: [{ ...q.items[0]!, pricing: { ...q.items[0]!.pricing!, competitive: null, benchmarkStatus: 'Stale' } }] };
  await act(async () => root.render(createElement(Workspace, { quote: unknown, selected: unknown.items[0]!.id, onSelect: () => {}, busy: null, onChangeLine: async () => true, onNext: () => {}, onNew: () => {} })));
  assert.ok(document.querySelector('.line-overview')!.textContent!.includes('Benchmark comparison unconfirmed'));
  assert.ok(!document.querySelector('.line-overview')!.textContent!.includes('below'));
  await act(async () => root.unmount()); dom.window.close();
});
