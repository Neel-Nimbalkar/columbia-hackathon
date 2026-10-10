import { quoteSchema, type Quote, type Spec } from '../shared/schema';

/** Keeps the server's error code/status so the UI can explain e.g. OCR_REQUIRED or RATE_LIMITED. */
export class ApiRequestError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function failure(response: Response): Promise<never> {
  let data: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
  try { data = await response.json(); } catch { /* not JSON */ }
  if (data?.error?.code) throw new ApiRequestError(data.error.message ?? `Request failed (${response.status}).`, data.error.code, response.status, data.error.details);
  if (response.status === 504 || response.status === 502) throw new ApiRequestError('The server took too long to answer. Please retry.', 'GATEWAY_TIMEOUT', response.status);
  throw new ApiRequestError(`Request failed (${response.status}).`, 'UNEXPECTED_RESPONSE', response.status);
}

async function send(input: RequestInfo, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw new ApiRequestError('The request timed out. Large or scanned RFQs can take a few minutes; please retry.', 'CLIENT_TIMEOUT', 0);
    if ((err as Error).name === 'AbortError') throw new ApiRequestError('Cancelled.', 'CANCELLED', 0);
    throw new ApiRequestError('Could not reach the server. Check your connection and retry.', 'NETWORK_ERROR', 0);
  }
}

async function quoteResponse(response: Response): Promise<Quote> {
  if (!response.ok) return failure(response);
  const parsed = quoteSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiRequestError('The server returned an invalid quotation. Please retry.', 'INVALID_RESPONSE', response.status);
  return parsed.data;
}

export async function processRfq(input: { text: string; files: File[]; customer: string; targetMargin: number; signal?: AbortSignal }): Promise<Quote> {
  const body = new FormData();
  body.set('text', input.text);
  body.set('customer', input.customer);
  body.set('targetMargin', String(input.targetMargin));
  for (const f of input.files) body.append('file', f);
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000);
  return quoteResponse(await send('/api/rfq/process', { method: 'POST', body, signal }));
}

export async function updateQuote(input: { quote: Quote; itemId: string; response?: string; corrections?: Spec; included?: boolean; targetMargin?: number }): Promise<Quote> {
  return quoteResponse(await send('/api/rfq/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(150_000),
  }));
}

export async function downloadPdf(quote: Quote): Promise<void> {
  const response = await send('/api/quote/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return failure(response);
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new ApiRequestError('The export endpoint did not return a PDF.', 'INVALID_RESPONSE', response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${quote.id}.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface CatalogItem {
  sku: string;
  supplierPartNumber: string;
  description: string;
  url: string;
  material: string;
  grade: string;
  temper: string | null;
  form: string;
  finish: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  diameter: number | null;
  gauge: number | null;
  standards: string[];
  certsAvailable: boolean | null;
  countryOfOrigin: string | null;
  listPrice: { usd: number; unit: string; synthetic: boolean } | null;
  retrievedDate: string;
  cost: number;
  stock: number;
  leadTimeDays: number;
}

export async function fetchCatalog(): Promise<{ supplier: { name: string; site: string; retrieved: string }; disclosure: string; products: CatalogItem[] }> {
  const response = await send('/api/catalog', { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return failure(response);
  return response.json();
}
