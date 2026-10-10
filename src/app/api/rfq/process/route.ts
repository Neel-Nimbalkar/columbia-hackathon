import { errorJson, toErrorResponse } from '@/lib/server/errors';
import { MAX_TEXT_CHARS, MAX_UPLOAD_BYTES } from '@/lib/server/parse';
import { processRfq } from '@/lib/server/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST multipart: file?, text?, customer, targetMargin (fraction). Returns the Quote directly. */
export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES + MAX_TEXT_CHARS * 4 + 64_000) return errorJson(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the 10 MB limit.');
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorJson(400, 'BAD_REQUEST', 'Send multipart/form-data with file and/or text, customer and targetMargin.');
    }
    const file = form.get('file');
    const text = String(form.get('text') ?? '');
    const customer = String(form.get('customer') ?? '').slice(0, 200);
    const marginRaw = form.get('targetMargin');
    const targetMargin = marginRaw === null || marginRaw === '' ? 0.2 : Number(marginRaw);
    if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin > 0.8)
      return errorJson(400, 'BAD_REQUEST', 'targetMargin must be a fraction between 0 and 0.8 (e.g. 0.2 for 20%).');
    if (text.length > MAX_TEXT_CHARS) return errorJson(413, 'PAYLOAD_TOO_LARGE', `Pasted text exceeds ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    const upload = file instanceof File && file.size > 0
      ? { name: file.name, size: file.size, bytes: file.size > MAX_UPLOAD_BYTES ? new Uint8Array() : new Uint8Array(await file.arrayBuffer()) }
      : null;
    if (!upload && !text.trim()) return errorJson(400, 'BAD_REQUEST', 'Send an RFQ file, pasted text, or both.');
    const quote = await processRfq({ file: upload, text, customer, targetMargin });
    return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error, 'api/rfq/process');
  }
}
