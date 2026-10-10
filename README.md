# RudCo RFQ-to-Quote

Frontend + server-generated PDF half of the hackathon MVP. **Real AI/backend processing and Render deployment belong to the partner's PR.** See [ownership and integration handoff](docs/HANDOFF.md) and [full product requirements](docs/PRD.md).

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

Copy `.env.example` to `.env.local` when the backend arrives. Set secrets locally or in Render, never commit them. The requested Nicrron model must be verified by the partner rather than assumed available.

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
