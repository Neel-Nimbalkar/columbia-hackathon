import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequestError, fetchCatalog } from '../src/lib/client/api';

test('service failures show actionable copy without provider names, keys or diagnostics', async () => {
  const before = globalThis.fetch;
  try {
    for (const code of ['PROVIDER_NOT_CONFIGURED', 'RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_ERROR', 'UPSTREAM_INVALID_OUTPUT', 'UPSTREAM_TRUNCATED', 'UPSTREAM_MODEL_MISMATCH', 'INTERNAL_ERROR', 'UNKNOWN_FAILURE']) {
      globalThis.fetch = (async () => Response.json({ error: { code, message: 'Nicrron claude-fable-5-1 TYPESAFE_API_KEY model failure', details: ['internal diagnostics'] } }, { status: code === 'RATE_LIMITED' ? 429 : 503 })) as typeof fetch;
      await assert.rejects(fetchCatalog(), e => {
        assert.ok(e instanceof ApiRequestError); assert.equal(e.code, code);
        assert.ok(!/Nicrron|claude|API_KEY|model|diagnostics/.test(e.message)); assert.equal(e.details, undefined); return true;
      });
    }
  } finally { globalThis.fetch = before; }
});

test('buyer-facing validation and compliance blockers keep their actionable details', async () => {
  const before = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ error: { code: 'QUOTE_BLOCKED', message: 'Resolve the blocked lines before exporting.', details: ['Line 1: confirm the temper.', 'Line 2: MTR evidence is pending.'] } }, { status: 422 })) as typeof fetch;
    await assert.rejects(fetchCatalog(), e => { assert.ok(e instanceof ApiRequestError); assert.equal(e.message, 'Resolve the blocked lines before exporting.'); assert.equal((e.details as string[]).length, 2); return true; });
  } finally { globalThis.fetch = before; }
});
