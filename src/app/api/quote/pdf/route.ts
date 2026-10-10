import { isIsoDate } from '@/lib/shared/dates';
import { z } from 'zod';
import { quoteSchema } from '@/lib/shared/schema';
import { errorJson, toErrorResponse } from '@/lib/server/errors';
import { exportBlockers, generateQuotePdf } from '@/lib/server/pdf';
import { validateQuoteForExport } from '@/lib/server/quote-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({ quote: quoteSchema });

/**
 * POST { quote } → application/pdf. Every price, match, compliance status and
 * the ready flag are recomputed server-side first; client-claimed values are
 * discarded, so a tampered quote cannot export.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 2_000_000) return errorJson(413, 'PAYLOAD_TOO_LARGE', 'Quotation exceeds the export limit.');
    let data: unknown;
    const raw = await request.text();
    if (raw.length > 2_000_000) return errorJson(413, 'PAYLOAD_TOO_LARGE', 'Quote payload is too large.');
    try { data = JSON.parse(raw); } catch { return errorJson(400, 'BAD_REQUEST', 'Send valid JSON.'); }
    const parsed = requestSchema.safeParse(data);
    if (!parsed.success) return errorJson(400, 'VALIDATION_FAILED', 'Quotation data is invalid.', parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`));
    const submitted = parsed.data.quote;
    if (!submitted.customer.trim()) return errorJson(422, 'QUOTE_BLOCKED', 'Add the customer name before exporting.');
    if (!isIsoDate(submitted.date) || !isIsoDate(submitted.expires) || submitted.expires < submitted.date)
      return errorJson(422, 'QUOTE_BLOCKED', 'Set a valid issue date and an expiry on or after it.');
    const quote = await validateQuoteForExport(submitted);
    const blockers = exportBlockers(quote);
    if (blockers.length) return errorJson(422, 'QUOTE_BLOCKED', 'Resolve or exclude every blocked line before export.', blockers);
    const bytes = await generateQuotePdf(quote);
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${quote.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'api/quote/pdf');
  }
}
