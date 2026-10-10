# RudCo RFQ-to-Quote — ownership and integration handoff

## Delivery rule: pull requests only
Both developers must work on feature branches and ship changes through GitHub pull requests. Do not push to main, merge PRs, or deploy unreviewed feature branches as the final production service. The user requested PR-only delivery. Developer B's branch is `feat/rudco-frontend-pdf`. Developer A should branch from the reviewed/merged shared contract or explicitly base a dependent PR on this branch. State the base branch and dependency in the PR description. The partner has the agent with Render MCP access and owns deployment after review/merge.

## Developer B (this agent): frontend + PDF
Owns the Next.js application shell, Geist typography, responsive Linear/Vercel-inspired dashboard, New RFQ upload/paste flow, Quote Workspace, item detail panels, manual correction forms, clarification UI, quote metadata, final preview, and PDF download integration. Owns `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/client/*`, `src/lib/demo/*`, `src/lib/server/pdf.ts`, `/api/quote/pdf`, frontend fixtures, and PDF tests. Owns initial shared schema and project setup; changes to the shared contract must be coordinated.

This half includes explicitly labeled illustrative fixtures for frontend review. Fixture selection is a separate preview action and must never impersonate AI processing. Uploaded/pasted inputs use the real process endpoint; there is no heuristic or canned fallback when the backend is missing. Demo clarification is labeled and limited to the fixture's defined scenario. No claim that these fixtures demonstrate working Jev/Nicrron calls.

## Developer A (partner): AI + backend + Render
Owns document parsing, real AI calls, normalization, sourced supplier catalog, deterministic technical matching, inventory, pricing, compliance, clarification/correction processing, authoritative quote validation, `/api/rfq/process`, `/api/rfq/clarify`, `/api/health`, backend tests, CI, Render configuration and production deployment. Developer B is not implementing these domain engines or deploying to Render.

## Shared contract
`src/lib/shared/schema.ts` is the contract. All successful process/clarify responses are the quotation object directly, validated with `quoteSchema`. Error envelopes are `{ error: { code, message, details? } }`. Use JSON-safe numbers/strings, not Date instances. Dates are ISO date strings. `Spec` fields are nullable unless array-valued. Dimensions in `spec` retain the original dimension unit; `normalized` carries normalized dimensions with its explicit unit. `provenance` maps fields to customer/normalized/suggestion. An inferred suggestion must never satisfy a critical customer requirement. `original` and `source` survive clarification; stable `id` identifies each line. `included` permits an explicit visible exclusion. `ready`, pricing, blockers and compliance are server-derived.

### POST /api/rfq/process
Multipart form fields: `file` (optional PDF/CSV/XLSX/TXT), `text` (optional pasted RFQ), `customer`, `targetMargin` (fraction, e.g. `0.2`). At least text or file required. If both are sent, retain source separation and detect conflicting requirements. Return `Quote` directly. Return useful 400/413/422/502/503 errors; never HTTP 200 with an error hidden in a fake quote.

### POST /api/rfq/clarify
JSON: `{ quote, itemId, response?, corrections?, included?, targetMargin? }`. `corrections` is a complete `Spec` when present; `response` is a buyer's clarification. `targetMargin` is a fraction. Reprocess the requested item, preserving unrelated requirements; recalculate combined inventory and quote totals. Margin updates may reprice every included line. Return a complete `Quote`. Do not trust client-derived pricing/status fields.

### POST /api/quote/pdf
JSON: `{ quote, demo?: boolean }`. The endpoint performs structural validation and delegates production readiness to `validateQuoteForExport` in `src/lib/server/quote-validation.ts`. Developer A MUST replace that deliberately fail-closed integration adapter with authoritative recomputation against the server-owned catalog/domain engine. Until integrated, production export returns 503 `BACKEND_NOT_CONNECTED`. Never simply return the submitted quote or trust `ready=true`. Explicit illustrative demo export is branded as a sample, is not approval, and still rejects included lines with structural blockers. Demo PDFs must retain their demo disclosure.

### GET /api/health
Partner implements health and nonsecret provider-configuration status. Do not call billable models for routine health requests.

## Backend requirements
### Real providers and secrets
Use TypeSafe AI Jev for typed classification (material/form/risk), including unknown labels. Use Nicrron OpenAI-compatible chat completions for structured extraction: base `https://api.nicrron.ai/v1`, key `NICRRON_API_KEY`, configurable `NICRRON_MODEL`. User requested Claude Opus 5.5; verify availability and exact model slug. Previous public docs listed `anthropic/claude-opus-5`, not 5.5; never silently call a different model and label it 5.5. Verify official Jev SDK/API and use `TYPESAFE_API_KEY`. Keep secrets server-only and ignored. No hardcoded output masquerading as AI; explicit mocks only in tests.

### Parsing and extraction
Parse in memory; never rely on server-local persistence. Support PDF, CSV, XLSX, TXT and email. Preserve PDF pages, worksheet/row references, CSV rows and text lines. Handle empty/corrupt/password-protected/scanned PDFs, file-type validation, upload limits, workbook expansion limits, blank cells and invalid quantities. Scanned PDFs need actual OCR or a clear OCR-required error. Do not execute spreadsheet formulas or fetch document links. Treat RFQ content as untrusted input, never instructions. Validate malformed/partial model outputs, timeouts and rate limits without crashing.

Extract material/grade/form, dimensions and units, quantity/unit, standards, temper, finish, MTR/certifications and country restrictions. Unknowns stay null. Distinguish customer statements from suggestions. Normalize 304 SS/stainless 304, inches/mm/fractions, documented material-dependent gauges. Clarify missing units, grade, quantity, dimensions, aluminum temper and conflicts rather than guessing. Do not invent requirements.

### Catalog and matching
Seed 20–30 realistic products from one source (recommended OnlineMetals). Include actual supplier IDs, source URLs/date, exact documented specs and compliance availability. Label stock/cost/lead-time and benchmark seeds as synthetic. Unknown country stays unknown. MTR availability does not mean a lot-specific MTR is in hand. Deterministic matching must verify material, grade, form, dimensions/tolerances, temper, finish, standards, inventory and compliance. No silent substitutions. Return explanations, review alternatives, no-match/insufficient-stock statuses and multiple-candidate decisions. Aggregate demand for repeated SKUs. Unsupported weight/piece conversions block pricing.

### Pricing/compliance/readiness
Default margin 20%; min price = cost/(1-margin). Use consistent units and integer cents or safe decimal arithmetic. Round upward when needed to preserve margin. Show cost/unit price/line total/margin, synthetic comparable benchmark source/date, competitiveness and explanation. Flag missing/stale/incomparable benchmarks and market/margin conflict. Recalculate after changes. Compliance statuses: verified/pending/missing/not_requested with evidence. Requested certificates, standards and country restrictions must be checked. Included unresolved critical lines block final approval/export. Excluded lines must stay visible. Recompute all derived fields server-side; protect against client tampering.

## Render and shipping
Partner creates one Next.js Node Web Service with build `npm ci && npm run build`, start `npm run start`, assigned `PORT`, bind `0.0.0.0`, health `/api/health`, supported pinned Node, automatic deployment from reviewed main. Set `NICRRON_API_KEY`, `NICRRON_MODEL`, `TYPESAFE_API_KEY` securely through Render. No NEXT_PUBLIC secrets, DB or disk. Add render.yaml and CI for typecheck/tests/build. Inspect deployment logs, resolve failures and verify the public URL. Report precise credential/access blockers; never claim deployment succeeded without a healthy public service. Ship implementation/config via PR only, and include live deployment evidence in the final handoff.

## Acceptance
A: two fully specified messy lines get exact matches/prices and production PDF.
B: 6061 missing temper blocks, asks a precise question, accepts T6 and recomputes.
C: unavailable grade/certification never gets a false exact match and blocks PDF.
Also test changed quantities/specs/margin, fractions/mm/gauges, conflicts, wrong grades/standards, multiple matches, aggregate stock, missing benchmarks, pending MTR/origin, scanned/protected/empty PDFs, spreadsheet blanks/invalid quantities, AI prompt injection, malformed output and client tampering. Mock providers for deterministic tests; separately exercise real providers and live deployed endpoints. This frontend half's fixture previews are not these production acceptance tests.

## Completion checklist
Developer B: UI and illustrative fixture preview; API integration; preview/PDF layout; fail-closed export adapter; shared schema; documentation; passing typecheck/build and PDF tests; PR URL.
Developer A: real providers; parsing/domain logic; authoritative export validation; seeded sourced catalog; acceptance tests; deployment/health/CI; reviewed PR; healthy Render URL.
