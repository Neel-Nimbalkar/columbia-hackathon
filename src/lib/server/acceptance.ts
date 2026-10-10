import { createHash, randomUUID } from 'node:crypto';
import type { Quote } from '../shared/schema';
import { ACCEPTANCE_STATEMENT, signatureSchema, signingSnapshot, type QuoteAcceptance, type Signature } from '../shared/acceptance';
import { validateQuoteForExport } from './quote-validation';
import { exportBlockers } from './pdf';
import { HttpError } from './errors';

export async function acceptQuote(submitted: Quote, signature: Signature, now = new Date()): Promise<{ quote: Quote; acceptance: QuoteAcceptance }> {
  const signer = signatureSchema.parse(signature);
  if (submitted.id.startsWith('DEMO-') || submitted.provider.extraction.startsWith('Illustrative'))
    throw new HttpError(422, 'SAMPLE_NOT_SIGNABLE', 'Process a real RFQ before signing. Sample quotations cannot be accepted for purchase.');
  const quote = await validateQuoteForExport(submitted);
  const blockers = exportBlockers(quote);
  if (!quote.ready || blockers.length) throw new HttpError(422, 'QUOTE_BLOCKED', 'Resolve or exclude blocked lines before signing.', blockers);
  const today = now.toISOString().slice(0, 10);
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!quote.customer.trim() || !validDate(quote.date) || !validDate(quote.expires) || quote.expires < quote.date)
    throw new HttpError(422, 'INVALID_QUOTE_DETAILS', 'Add a customer and valid issue and expiration dates before signing.');
  if (quote.date > today) throw new HttpError(422, 'QUOTE_NOT_YET_VALID', 'This quotation is not yet valid for acceptance.');
  if (quote.expires < today) throw new HttpError(422, 'QUOTE_EXPIRED', 'This quotation has expired. Request an updated quotation before signing.');
  if (signer.company.normalize('NFKC').toLowerCase() !== quote.customer.trim().normalize('NFKC').toLowerCase())
    throw new HttpError(422, 'BUYER_MISMATCH', 'The signing company must match the customer on the quotation.');
  const snapshot = JSON.stringify(signingSnapshot(quote));
  if (snapshot !== JSON.stringify(signingSnapshot(submitted)))
    throw new HttpError(409, 'QUOTE_CHANGED', 'The server recalculated different quotation details. Recalculate and review the quote before signing.');
  return { quote, acceptance: { ...signer, id: randomUUID(), signedAt: now.toISOString(), quoteHash: createHash('sha256').update(snapshot).digest('hex'), statement: ACCEPTANCE_STATEMENT } };
}
