# RudCo RFQ-to-Quote

One Next.js service converts metals RFQs into sourced catalog matches, explainable pricing, compliance review, buyer questions, and downloadable quotations. Render deploys reviewed `main` using `render.yaml`.

## Workflow

1. Parse PDF (including fillable form fields), CSV, XLSX, TXT or EML, plus pasted email, preserving original wording and source references.
2. Extract specifications with Nicrron and classify each line with TypeSafe Jev. Normalize material, grade, temper, dimensions, quantity and standards on the server. Unknown values become buyer questions.
3. Match exact supplier specifications without silent substitutions. Check aggregate demand across included lines.
4. Price using integer cents and the target gross margin. Explain the difference from the supplier's same-size, same-unit list-price benchmark. Missing, stale or synthetic benchmarks cannot establish competitiveness.
5. Flag requested MTR, origin and certification evidence. Resolve questions through buyer answers or corrections; excluded requests stay visible.
6. Review and export a server-validated PDF. A buyer can type their full name, provide an email, confirm authorization and download a signed purchase request.

The three example buttons populate real RFQs for the live processing path. They do not load fictional ready quotations. Provider details, warnings and the catalog disclosure appear in the workspace.

## Run

Node 22.13+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure `NICRRON_API_KEY`, `TYPESAFE_API_KEY`, and PRISM tracing secrets locally or in Render. Secrets are server-only and must never be committed. Extraction uses the configured Nicrron model, default `anthropic/claude-fable-5-1`; Jev uses `jev-latest`. Every extraction, clarification and classification call is traced to PRISM.

## Explicit acceptance harness

```sh
npm run harness -- http://localhost:3000
# Or point at the deployed app:
npm run harness -- https://rudco-rfq-preview.onrender.com
```

The harness reports each requested stage in order: parsing, catalog matching, competitive pricing, compliance, and clarification. It then exercises corrections, material reclassification, exclusions, repricing, unsigned PDF export, typed signing and signing rejection cases. It uses the real app endpoints, makes billable provider calls, and requires Nicrron, Jev and PRISM configuration. It does not send a purchase request to anyone. It runs only when explicitly invoked, never during `npm test` or a build.

The existing deterministic suite remains available through `npm test`. No tests or browser checks were run after the user's instruction to stop testing; the new harness and final signing changes have not been executed.

## Typed purchase acceptance

The server recomputes the quote before signing and refuses blocked lines, samples, zero included lines, missing authorization, invalid buyer details, expired/future-dated quotes, mismatched signing companies, or changed commercial content. Expiration dates are inclusive through the stated UTC date. Changes to the quote or signer details clear the authorization/signature in the UI; quote controls are locked while signing.

The signed PDF includes the typed name, email, company, total, server UTC timestamp, acceptance reference, purchase statement, exclusions and a SHA-256 digest of the commercial content. Its embedded `buyer-acceptance.json` preserves the exact UTF-8 signature and quotation snapshot, including names outside the built-in PDF font's character set. Repeat downloads reuse the same signed PDF.

Signing generates a purchase-request artifact. It does not transmit an order, verify signer identity, reserve stock, or confirm supplier fulfillment. The app is stateless: buyers must save the signed PDF and send it to RudCo; refreshing the workspace clears its in-memory signature.

## Data boundaries

The catalog contains 28 Speedy Metals products with 126 size options, supplier part numbers, URLs, specifications, standards and list-price benchmarks retrieved 2026-10-10. Stock, costs and lead times are synthetic seeds. Certificates and country of origin are not invented. Required documentation without supplier evidence blocks export and signing. A supplier list price is a dated comparison, not a live market feed.

See [API contract](docs/API.md). Ship changes through pull requests; Render automatically deploys reviewed `main`.
