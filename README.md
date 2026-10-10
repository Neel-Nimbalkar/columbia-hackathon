# RudCo RFQ-to-Quote

Turns messy metals RFQs (email text, PDF incl. fillable forms, CSV, XLSX, EML) into explainable, priced quotations with a server-generated PDF. One Next.js service: frontend + API routes, deployed on Render (`render.yaml`).

## Backend at a glance

- **Extraction:** Nicrron (OpenAI-compatible) with `NICRRON_MODEL=anthropic/claude-fable-5-1`. Claude Opus 5.5 is not offered by Nicrron (verified via `/v1/models`); Fable 5.1 was chosen after a live JSON-extraction comparison with `claude-opus-5` and `claude-sonnet-5`. The model only transcribes; every `original` is checked against the real document text and lines that cannot be traced are dropped.
- **Classification:** TypeSafe Jev (`jev-latest`, currently `jev-1.13.0`) for material/form/risk per line and a prompt-injection check.
- **Deterministic engine** (`src/lib/server/engine.ts`): normalization (synonyms, fractions, mm/ft, material-specific gauge tables), precise clarification questions, exact matching with no silent substitutions, aggregate stock, integer-cent pricing (`ceil(cost / (1 − margin))`), compliance (verified/pending/missing/not_requested) and readiness. Process, clarify and PDF export all recompute through it, so client-side tampering is discarded.
- **Catalog:** 28 real Speedy Metals products (126 size options) with part numbers, URLs, standards and list prices from the supplier pages (retrieved 2026-10-10). OnlineMetals, Metals Depot and Midwest Steel blocked automated access. Stock, cost and lead time are synthetic seeds. Pages document no MTR availability or origin, so those requirements correctly block export.
- **Tracing:** every model/classifier call is sent to PRISM (`src/lib/server/providers/prism.ts`); see `CLAUDE.md`.

## Run

Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Select one of the three clearly labeled sample workspaces to review the frontend. `Process RFQ` always calls the real backend; this branch has no mock process endpoint. Samples do not make AI calls and do not represent verified supplier offers.

## Implemented in this PR

- New RFQ: drag/drop or browse PDF/CSV/XLSX/TXT (10 MB limit), paste email, customer and target margin.
- Workspace: original source, extracted line table, specifications and provenance, matches/alternatives, pricing rationale, benchmark labeling, compliance evidence, clarification form, corrections and exclusions.
- Final quote: editable customer/dates, included products, documentation and terms, visible excluded lines, readiness guard and PDF download.
- Shared TypeScript/Zod schemas and typed API client.
- Explicit illustrative fixtures: successful, missing aluminum temper (answer `T6`), unavailable 316L/certification.
- In-memory PDF generation with wrapping, page breaks, sample watermark/disclosure and structural blocker validation.
- Fail-closed production export adapter. The partner must connect authoritative validation before real export can work.

## Integration

See [API contract](docs/API.md). Partner implements `/api/rfq/process`, `/api/rfq/clarify`, `/api/health` and replaces `src/lib/server/quote-validation.ts`. Production PDF requests deliberately return `503 BACKEND_NOT_CONNECTED` until this integration is complete. Demo PDF exports are unmistakably samples; the browser's `demo` flag cannot authorize a production quotation.

The process endpoint accepts multipart `file`, `text`, `customer`, `targetMargin`. The clarify endpoint accepts JSON `{quote,itemId,response?,corrections?,included?,targetMargin?}`. Both return the complete `Quote` directly, validated by the client. Errors use `{error:{code,message,details?}}`.

Copy `.env.example` to `.env.local` and fill in the keys. Set secrets locally or in Render, never commit them. The requested Nicrron model must be verified by the partner rather than assumed available.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run start
```

Production start binds `0.0.0.0` using `PORT`, defaulting to 3000. PDF tests exercise blocking, sample disclosure, page overflow and the fail-closed production adapter. Tests do not prove the future real AI/backend acceptance flows.

## Delivery and Render

**Both halves ship through pull requests only. No direct pushes to main and no automatic merge by agents.** This branch does not provision Render or claim a live deployment. Partner's Render-enabled agent owns one Node Web Service with `npm ci && npm run build`, `npm run start`, health `/api/health`, server-only AI secrets and automatic deployment from reviewed main. Detailed steps and acceptance requirements are in [HANDOFF.md](docs/HANDOFF.md).

## Demo data

The frontend uses fictional internal SKUs and synthetic costs, inventory, benchmarks and lead times. These fixtures are UI samples, not the required sourced 20–30-product backend catalog. No certificates or origin evidence are invented. Sample PDF export is for interface review only. Manual spec reprocessing is disabled in fixture mode because it requires the real matching engine.
