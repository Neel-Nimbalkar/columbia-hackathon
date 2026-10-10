import { z } from 'zod';
import { quoteSchema } from '@/lib/shared/schema';
import { signatureSchema } from '@/lib/shared/acceptance';
import { acceptQuote } from '@/lib/server/acceptance';
import { generateQuotePdf } from '@/lib/server/pdf';
import { errorJson, toErrorResponse } from '@/lib/server/errors';

export const runtime = 'nodejs';
const requestSchema = z.object({ quote: quoteSchema, signature: signatureSchema });
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return errorJson(413, 'TOO_LARGE', 'Quotation exceeds the signing limit.');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return errorJson(400, 'INVALID_JSON', 'Send valid JSON.'); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return errorJson(400, 'INVALID_SIGNATURE', 'Enter your full name, valid email, company, and confirm purchase authorization.');
    const { quote, acceptance } = await acceptQuote(parsed.data.quote, parsed.data.signature);
    const bytes = await generateQuotePdf(quote, acceptance);
    return new Response(Buffer.from(bytes), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-signed.pdf"`,
      'Cache-Control': 'no-store',
      'X-Quote-Acceptance-Id': acceptance.id,
      'X-Quote-Accepted-At': acceptance.signedAt,
    } });
  } catch (error) { return toErrorResponse(error, 'api/quote/accept'); }
}
