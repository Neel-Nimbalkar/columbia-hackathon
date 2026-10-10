import { z } from 'zod';
import { config } from '../config';
import { HttpError } from '../errors';
import { upstreamFetch } from './http';
import { emitTrace } from './prism';

export interface ChatJsonResult<T> {
  data: T;
  /** Model identifier reported by the provider for the call that produced `data`. */
  model: string;
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Structured completion via Nicrron's OpenAI-compatible API. The reply is
 * validated with `schema`; one repair attempt is made on malformed output.
 */
export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { maxTokens?: number; timeoutMs?: number; sessionId?: string } = {},
): Promise<ChatJsonResult<T>> {
  const started = Date.now();
  try {
    const result = await chatJsonInner(schema, messages, opts);
    await emitTrace({ model: result.model, input: messages, output: JSON.stringify(result.data), latencyMs: Date.now() - started, sessionId: opts.sessionId });
    return result;
  } catch (err) {
    await emitTrace({ model: config().nicrron.model, input: messages, output: `ERROR ${(err as { code?: string }).code ?? ''}: ${(err as Error).message}`, latencyMs: Date.now() - started, sessionId: opts.sessionId });
    throw err;
  }
}

export interface VisionImage {
  /** e.g. "image/png", "image/jpeg". */
  mime: string;
  base64: string;
  /** Human-readable label for traces, e.g. "rfq.pdf page 2". */
  label: string;
}

/**
 * Plain-text completion over one image (OCR-style transcription). Traced to
 * PRISM like every other model call; the image bytes are summarised, not sent.
 */
export async function chatVisionText(
  prompt: string,
  image: VisionImage,
  opts: { maxTokens?: number; timeoutMs?: number; sessionId?: string } = {},
): Promise<ChatJsonResult<string>> {
  const { apiKey, baseUrl, model } = config().nicrron;
  const started = Date.now();
  const traceInput = [{ role: 'user', content: `${prompt}\n\n[image: ${image.label}, ${image.mime}, ${Math.round((image.base64.length * 3) / 4 / 1024)} KB]` }];
  try {
    if (!apiKey) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', 'NICRRON_API_KEY is not configured on the server.');
    const res = await upstreamFetch('Nicrron', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
          ],
        }],
      }),
    }, { timeoutMs: opts.timeoutMs ?? 90_000, retries: 1 });
    const payload = (await res.json().catch(() => null)) as { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[] } | null;
    if (payload?.choices?.[0]?.finish_reason === 'length') throw new HttpError(502, 'UPSTREAM_TRUNCATED', `Vision transcription hit its output limit for ${image.label}.`);
    const text = payload?.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new HttpError(502, 'UPSTREAM_INVALID_OUTPUT', `The vision model returned no text for ${image.label}.`);
    const result = { data: text, model: payload?.model ?? model };
    await emitTrace({ model: result.model, input: traceInput, output: text, latencyMs: Date.now() - started, sessionId: opts.sessionId });
    return result;
  } catch (err) {
    await emitTrace({ model, input: traceInput, output: `ERROR ${(err as { code?: string }).code ?? ''}: ${(err as Error).message}`, latencyMs: Date.now() - started, sessionId: opts.sessionId });
    throw err;
  }
}

async function chatJsonInner<T>(
  schema: z.ZodType<T>,
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { maxTokens?: number; timeoutMs?: number },
): Promise<ChatJsonResult<T>> {
  const { apiKey, baseUrl, model } = config().nicrron;
  if (!apiKey) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', 'NICRRON_API_KEY is not configured on the server.');

  let lastIssue = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const convo = attempt === 0
      ? messages
      : [...messages, { role: 'user' as const, content: `Your previous reply was invalid (${lastIssue}). Reply again with only the JSON object that matches the requested shape.` }];
    const res = await upstreamFetch('Nicrron', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: convo,
        max_tokens: opts.maxTokens ?? 4000,
        response_format: { type: 'json_object' },
      }),
    }, { timeoutMs: opts.timeoutMs ?? 90_000, retries: 1 });

    const payload = (await res.json().catch(() => null)) as
      | { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[] }
      | null;
    if (payload?.choices?.[0]?.finish_reason === 'length') throw new HttpError(502, 'UPSTREAM_TRUNCATED', 'The model reply hit its output limit.');
    const content = payload?.choices?.[0]?.message?.content ?? '';
    if (payload?.model && payload.model !== model && !payload.model.endsWith(model.split('/').pop()!)) {
      throw new HttpError(502, 'UPSTREAM_MODEL_MISMATCH', `Nicrron answered with ${payload.model} instead of the configured ${model}.`);
    }
    try {
      const parsed = schema.safeParse(parseJsonObject(content));
      if (parsed.success) return { data: parsed.data, model: payload?.model ?? model };
      lastIssue = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch (err) {
      // A truncated reply will be truncated again; let the caller split the input instead.
      if (payload?.choices?.[0]?.finish_reason === 'length') throw new HttpError(502, 'UPSTREAM_TRUNCATED', 'The model reply hit its output limit.');
      lastIssue = (err as Error).message;
    }
  }
  throw new HttpError(502, 'UPSTREAM_INVALID_OUTPUT', 'The extraction model returned malformed output twice. Please retry.', { issue: lastIssue });
}
