import type { Quote } from '../shared/schema';
/** PARTNER INTEGRATION POINT: recompute from validated requirements + server catalog.
 * Never trust submitted prices, compliance, inventory or ready flags.
 * Replace this fail-closed function as part of backend implementation. */
export async function validateQuoteForExport(_submitted:Quote):Promise<Quote>{
 throw Object.assign(new Error('Production PDF export requires the partner backend’s authoritative catalog, pricing and compliance validation. Connect validateQuoteForExport before production use.'),{code:'BACKEND_NOT_CONNECTED',status:503});
}
