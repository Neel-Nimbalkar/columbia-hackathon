# Frontend/backend contract

Source of truth: `src/lib/shared/schema.ts`. Frontend client: `src/lib/client/api.ts`.

## Process
`POST /api/rfq/process`, multipart/form-data. Browser supplies the multipart boundary.

| Field | Type | Meaning |
|---|---|---|
| file | optional file | PDF, CSV, XLSX, TXT or EML; max 10 MB in UI; enforce server-side |
| text | string | Original email/text; max 100,000 characters in UI |
| customer | string | Customer/company; max 200 characters |
| targetMargin | string containing fraction | `0.2` = 20%; permitted 0 to 0.8 |

At least one of file/text is required. If both are supplied, parse both with distinct source references. Return `quoteSchema` JSON directly, not `{quote: ...}`. Timeout in UI is 240 seconds. The frontend preserves input after failure.

## Clarify / correct / exclude / reprice
`POST /api/rfq/clarify`, application/json.

```json
{"quote":"<complete Quote object>","itemId":"line-1","response":"6061-T6 please"}
```

`corrections`: optional complete nullable `Spec`; blank fields remain null. `included`: optional boolean; explicit exclusion changes readiness and totals. `targetMargin`: optional number (0–0.8); reprices all included lines. The frontend includes the current quote for stateless operation. Validate the payload with `clarifyRequestSchema`. Return a recomputed complete quote. Stable line IDs and original source text must survive. Corrections and buyer answers reclassify the updated specification through Jev and PRISM. A field unrelated to a cross-source conflict does not resolve that conflict. Any conflicts or unknowns are returned as questions/blockers. Recompute inventory across included lines, not only the affected line.

## Export
`POST /api/quote/pdf`, application/json: `{quote:<Quote>,demo?:boolean}`.

Success: PDF binary with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="...pdf"`, `Cache-Control: no-store`.

Production calls delegate to `validateQuoteForExport(submitted)` in `src/lib/server/quote-validation.ts`, which recomputes normalization, matching, pricing, compliance and readiness from requirements using the server-owned catalog. Client-derived prices and readiness cannot authorize export. `exportBlockers` checks included lines and `generateQuotePdf` renders in memory.

`demo:true` produces a clearly labeled fictional sample only. It never yields a production-approved document. The route overwrites the disclosure; the PDF title/header/footer and terms disclose the demo. Unresolved structural blockers still return 422. The backend partner can disable this sample path in production if desired, but must preserve frontend sample review or document the difference.

## Typed purchase acceptance

`POST /api/quote/accept`, application/json:

```json
{"quote":"<complete Quote object>","signature":{"name":"Buyer Full Name","email":"buyer@example.com","company":"Quotation Customer","consent":true}}
```

Success returns a signed PDF binary, `Cache-Control: no-store`, an attachment filename ending `-signed.pdf`, and `X-Quote-Acceptance-Id` / `X-Quote-Accepted-At` headers. The server creates the reference and UTC timestamp. It recomputes commercial content and compares it with the displayed quote before signing; changed totals/specs/prices/terms cause `409 QUOTE_CHANGED` so the buyer must recalculate and review.

The signature requires a trimmed full name, valid email, company matching the quotation customer (case-insensitive), and explicit `consent:true`. Samples and unresolved requirements are blocked. Customer and real ISO issue/expiration dates are required; future-dated and expired quotes cannot be accepted. Expiration is inclusive through the UTC date.

The PDF contains the acceptance statement, typed identity, total, exclusions, server timestamp, reference and commercial-content SHA-256 digest. An embedded UTF-8 `buyer-acceptance.json` retains exact signer text and the commercial snapshot. This is typed acceptance, not a cryptographic identity signature. No purchase order is transmitted or stock reserved; buyers save and send the artifact to request purchase. No signature is retained server-side. The browser retains the signed blob for repeat downloads until quote changes or refresh.

Additional codes: `400 INVALID_SIGNATURE`, `422 SAMPLE_NOT_SIGNABLE`, `422 QUOTE_BLOCKED`, `422 INVALID_QUOTE_DETAILS`, `422 BUYER_MISMATCH`, `422 QUOTE_EXPIRED`, `422 QUOTE_NOT_YET_VALID`, `409 QUOTE_CHANGED`.

## Errors

```json
{"error":{"code":"QUOTE_BLOCKED","message":"Resolve or exclude all blocked lines before export.","details":["line-1: no matched SKU"]}}
```

Use 400 invalid input, 413 limits, 422 processing/readiness problems, 429 upstream rate limiting if appropriate, 502 provider failures, 503 missing backend/provider configuration. No secrets or raw upstream credentials in error messages. The client raises `ApiRequestError` carrying `code`, `status` and `details` (a 404/405 without an envelope becomes `BACKEND_NOT_CONNECTED`). The UI shows actionable `error.message`; it never replaces failed real requests with fixtures. Responses that fail `quoteSchema` are rejected visibly.

## Quote semantics
- `spec`: customer values in stated units, nullable unknowns.
- `normalized`: equivalent measurements/material designations with explicit normalized units. `normalized.dimensionUnit` is required whenever any dimension is present (enforced by `quoteSchema`); a unit-less customer value stays in `spec` and becomes a question.
- `provenance`: customer/normalized/suggestion per field. Suggestions do not establish requested requirements.
- `status`: Ready, Matched, Needs Clarification, Compliance Pending, No Match.
- `included`: explicit line inclusion; excluded requests remain visible in preview and PDF.
- `compliance`: each requirement with verified/pending/missing/not_requested and supporting evidence.
- `pricing`: cost, recommended unitPrice, actual margin (fraction), lineTotal, unit, benchmark metadata/status and explanation; null if not priceable.
- `ready`: server-derived for included lines; false for unresolved critical requirements, invalid matching or missing required compliance. UI also guards these states, but server is authoritative.
- `total`: included line totals only, decimal safe.
- `provider`: actual extraction/classification provider identity. Never claim fixture processing used AI.
- `disclosure`: sourced/synthetic data boundaries.

Fixture objects generated by `makeDemoQuote` provide shape examples only. Their fictional catalog is not the required backend supplier catalog.
