import { z } from 'zod';
import type { Quote } from './schema';

const signerText = z.string().trim().min(2).max(200).refine(s => !/[\x00-\x1f\x7f]/.test(s), 'Use a single line of text.');
export const signatureSchema = z.object({
  name: signerText,
  email: z.email().max(254),
  company: signerText,
  consent: z.literal(true),
});
export type Signature = z.infer<typeof signatureSchema>;
export const QUOTE_TERMS = 'Freight and applicable taxes are excluded. Payment terms and delivery schedule are subject to agreement. No substitution of material, grade, temper or certification is authorized by this quotation.';
export const ACCEPTANCE_STATEMENT = 'I am authorized to purchase for the company named above. By typing my name, I accept the included items, quantities, prices, exclusions, and terms of this quotation and request purchase. Freight, taxes, payment terms, and delivery remain subject to supplier confirmation.';
export type QuoteAcceptance = Signature & { id: string; signedAt: string; quoteHash: string; statement: string };

/** Exactly the commercial content the buyer reviews and accepts. */
export function signingSnapshot(q: Quote) {
  return { id: q.id, customer: q.customer, rfqReference: q.rfqReference ?? null, date: q.date, expires: q.expires, targetMargin: q.targetMargin, total: q.total, disclosure: q.disclosure, warnings: q.warnings, terms: QUOTE_TERMS,
    items: q.items.map(i => ({ id: i.id, original: i.original, included: i.included, spec: i.spec, normalized: i.normalized,
      matchedSku: i.matchedSku, status: i.status, pricing: i.pricing, compliance: i.compliance, leadTime: i.leadTime,
      blockers: i.blockers, questions: i.questions, conflicts: i.conflicts })) };
}
