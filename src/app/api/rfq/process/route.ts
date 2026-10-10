import { errorJson, toErrorResponse } from '@/lib/server/errors';
import { MAX_FILES, MAX_TEXT_CHARS, MAX_UPLOAD_BYTES } from '@/lib/server/parse';
import { processRfq } from '@/lib/server/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST multipart: file (0–5, repeatable), text?, customer, targetMargin (fraction). Returns the Quote directly. */
export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES * MAX_FILES + MAX_TEXT_CHARS * 4 + 64_000) return errorJson(413, 'PAYLOAD_TOO_LARGE', `Uploads exceed the limit (${MAX_FILES} files, 10 MB each).`);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorJson(400, 'BAD_REQUEST', 'Send multipart/form-data with file and/or text, customer and targetMargin.');
    }
    const fileFields = form.getAll('file');
    if (fileFields.some(f => !(f instanceof File))) return errorJson(400, 'BAD_REQUEST', 'Every file field must be an uploaded file.');
    const files = fileFields as File[];
    if (files.some(f => f.size === 0)) return errorJson(422, 'EMPTY_DOCUMENT', 'An uploaded file is empty. Remove it or upload the completed RFQ.');
    if (files.length > MAX_FILES) return errorJson(400, 'TOO_MANY_FILES', `Upload at most ${MAX_FILES} files per RFQ.`);
    const text = String(form.get('text') ?? '');
    const customer = String(form.get('customer') ?? '').slice(0, 200);
    const marginRaw = form.get('targetMargin');
    const targetMargin = marginRaw === null || marginRaw === '' ? 0.2 : Number(marginRaw);
    if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin > 0.8)
      return errorJson(400, 'BAD_REQUEST', 'targetMargin must be a fraction between 0 and 0.8 (e.g. 0.2 for 20%).');
    if (text.length > MAX_TEXT_CHARS) return errorJson(413, 'PAYLOAD_TOO_LARGE', `Pasted text exceeds ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
    const uploads = await Promise.all(files.map(async (file) => ({
      name: file.name,
      size: file.size,
      // Oversized files are rejected by the parser without reading them into memory.
      bytes: file.size > MAX_UPLOAD_BYTES ? new Uint8Array() : new Uint8Array(await file.arrayBuffer()),
    })));
    if (!uploads.length && !text.trim()) return errorJson(400, 'BAD_REQUEST', 'Send an RFQ file, pasted text, or both.');
    const quote = await processRfq({ files: uploads, text, customer, targetMargin });
    return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return toErrorResponse(error, 'api/rfq/process');
  }
}
