import type { Quote } from '../shared/schema';
import { buildQuote } from './engine';

/**
 * Authoritative export validation: re-derive every price, match, compliance
 * status, blocker and the ready flag from the customer requirements alone
 * (items' spec / inclusion / conflicts, target margin) using the server-owned
 * catalog. Client-supplied derived fields are discarded, never trusted.
 */
export async function validateQuoteForExport(submitted: Quote): Promise<Quote> {
  return buildQuote({
    id: submitted.id,
    customer: submitted.customer,
    date: submitted.date,
    expires: submitted.expires,
    originalText: submitted.originalText,
    targetMargin: submitted.targetMargin,
    items: submitted.items.map((i) => ({
      id: i.id,
      original: i.original,
      source: i.source,
      spec: i.spec,
      conflicts: i.conflicts,
      provenance: i.provenance,
      included: i.included,
      classification: i.classification ?? null,
    })),
    provider: submitted.provider,
  });
}
