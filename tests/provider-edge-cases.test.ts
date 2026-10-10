import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { chatJson, chatVisionText } from '../src/lib/server/providers/nicrron';
import { askJev } from '../src/lib/server/providers/jev';
import { runExtraction } from '../src/lib/server/extract';
import { parseUpload } from '../src/lib/server/parse';
import { encodeGrayPng } from '../src/lib/server/png';

process.env.NICRRON_API_KEY = 'mock'; process.env.TYPESAFE_API_KEY = 'mock'; process.env.PRISMTRACE_DISABLED = '1';
let payloads: unknown[] = [];
let calls = 0;
beforeEach(() => {
  payloads = []; calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json(payloads.shift()); }) as typeof fetch;
});
const completion = (content: string, finish_reason = 'stop') => ({ model: 'anthropic/claude-fable-5-1', choices: [{ message: { content }, finish_reason }] });

test('valid JSON with length stop is still incomplete and cannot authorize a quote', async () => {
  payloads.push(completion('{"ok":true}', 'length'));
  await assert.rejects(() => chatJson(z.object({ ok: z.boolean() }), []), { code: 'UPSTREAM_TRUNCATED' });
  assert.equal(calls, 1);
});
test('truncated vision output cannot silently drop requested lines', async () => {
  payloads.push(completion('6061 plate qty 2', 'length'));
  await assert.rejects(() => chatVisionText('read', { mime: 'image/png', base64: '', label: 'photo.png' }), { code: 'UPSTREAM_TRUNCATED' });
});
test('small truncated chunks split into strictly smaller requests', async () => {
  const textSizes: number[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const count = [...body.messages[1].content.matchAll(/\[Pasted text · line \d+\]/g)].length;
    textSizes.push(count);
    return Response.json(completion('{"items":[]}', count > 1 ? 'length' : 'stop'));
  }) as typeof fetch;
  const result = await runExtraction([{ kind: 'text', name: 'Pasted text', segments: [1,2].map(n => ({ ref: `Pasted text · line ${n}`, text: `6061 plate line ${n}` })), notes: [] }], 'edge');
  assert.deepEqual(result.extraction.items, []); assert.deepEqual(textSizes, [2,1,1]);
});
test('model mismatch is rejected rather than attributed to the configured model', async () => {
  payloads.push({ ...completion('{"ok":true}'), model: 'other-model' });
  await assert.rejects(() => chatJson(z.object({ ok: z.boolean() }), []), { code: 'UPSTREAM_MODEL_MISMATCH' });
});
for (const answers of [{}, { material: { type: 'choice', choice: 'unlisted' } }, { material: { type: 'score', score: 1 } }]) {
  test(`malformed Jev choice is rejected: ${JSON.stringify(answers)}`, async () => {
    payloads.push({ model: 'jev-1', answers });
    await assert.rejects(() => askJev('RFQ', { material: { type: 'choice', instructions: 'material', criteria: { aluminum: 'aluminum' } } }), { code: 'UPSTREAM_INVALID_OUTPUT' });
  });
}
test('out-of-range injection confidence is rejected', async () => {
  payloads.push({ model: 'jev-1', answers: { injection: { type: 'noul', noul: 1.1 } } });
  await assert.rejects(() => askJev('RFQ', { injection: { type: 'noul', instructions: 'check' } }), { code: 'UPSTREAM_INVALID_OUTPUT' });
});
test('explicit small image attachment is transcribed instead of skipped as a logo', async () => {
  const png = encodeGrayPng({ width: 2, height: 2, pixels: new Uint8Array([255,255,255,255]) });
  const eml = ['Subject: RFQ', 'Content-Type: multipart/mixed; boundary=X', '', '--X', 'Content-Type: text/plain; charset=utf-8', '', 'See attached request.', '--X', 'Content-Type: image/png', 'Content-Disposition: attachment; filename="rfq.png"', 'Content-Transfer-Encoding: base64', '', Buffer.from(png).toString('base64'), '--X--'].join('\r\n');
  payloads.push(completion('6061-T651 plate 1/4 x 12 x 24 in qty 2'));
  const bytes = new TextEncoder().encode(eml);
  const source = await parseUpload({ name: 'rfq.eml', size: bytes.length, bytes });
  assert.equal(calls, 1); assert.ok(source.segments.some(s => s.ref.includes('rfq.png') && s.text.includes('6061')));
});
