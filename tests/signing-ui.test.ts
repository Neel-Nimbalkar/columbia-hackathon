import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { FinalQuote } from '../src/components/FinalQuote';
import { Sidebar } from '../src/components/Sidebar';
import { buildQuote } from '../src/lib/server/engine';
import { emptySpec } from '../src/lib/shared/schema';
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
