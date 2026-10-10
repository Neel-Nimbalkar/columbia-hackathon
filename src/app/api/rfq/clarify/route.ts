import { clarifyRequestSchema } from '@/lib/shared/schema';
import { applyAnswer, applyCorrections, interpretAnswer } from '@/lib/server/clarify';
import { errorJson, toErrorResponse } from '@/lib/server/errors';
import { validateQuoteForExport } from '@/lib/server/quote-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST { quote, itemId, response?, corrections?, included?, targetMargin? }.
 * Applies the change to the requested line, then recomputes the whole quote
 * server-side (combined inventory, totals, readiness). Returns the Quote.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 2_000_000) return errorJson(413, 'PAYLOAD_TOO_LARGE', 'Quote payload is too large.');
    let body: unknown;
    try { body = await request.json(); } catch { return errorJson(400, 'BAD_REQUEST', 'Send valid JSON.'); }
    const parsed = clarifyRequestSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, 'VALIDATION_FAILED', 'Request does not match the clarify contract.', parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`));
    const { quote, itemId, response, corrections, included, targetMargin } = parsed.data;
    const index = quote.items.findIndex((i) => i.id === itemId);
    if (index < 0) return errorJson(404, 'ITEM_NOT_FOUND', `No line with id ${itemId} in this quote.`);

    // Recompute first so questions shown to the model are server-derived, not client-supplied.
    const current = await validateQuoteForExport(quote);
    let item = { ...current.items[index]! };
    let extractionProvider = current.provider.extraction;
    if (corrections) item = { ...item, ...applyCorrections(item, corrections) };
    if (response?.trim()) {
      const { answer, model } = await interpretAnswer(item, item.questions, response.trim(), quote.id);
      item = { ...item, ...applyAnswer(item, answer) };
      if (!extractionProvider.includes(model)) extractionProvider = `${extractionProvider}; clarification: ${model}`;
    }
    if (included !== undefined) item.included = included;
    const items = current.items.map((it, i) => (i === index ? item : it));
    const next = await validateQuoteForExport({
      ...current,
      items,
      targetMargin: targetMargin ?? current.targetMargin,
      provider: { ...current.provider, extraction: extractionProvider },
    });
    return Response.json({ ...next, warnings: [...new Set([...current.warnings.filter((w) => !/^Line \d+: target margin/.test(w)), ...next.warnings])] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error, 'api/rfq/clarify');
  }
}
