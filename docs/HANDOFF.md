# Handoff — current state

Both halves of the original split (frontend/PDF and backend/AI) are implemented in this repository and ship through pull requests to `main`. Nothing is pending from a partner.

## What runs where

| Area | Location |
|---|---|
| Document parsing (PDF/forms/XFA/scans, DOCX, XLSX, CSV, EML, images) | `src/lib/server/parse.ts`, `src/lib/server/png.ts` |
| AI extraction, chunking, anchoring | `src/lib/server/extract.ts`, `src/lib/server/pipeline.ts` |
| Model providers + PRISM tracing | `src/lib/server/providers/*` |
| Deterministic engine (normalize, match, price, comply, ready) | `src/lib/server/engine.ts`, `src/lib/server/normalize.ts` |
| Catalog (sourced specs, synthetic stock/cost) | `src/lib/server/catalog*.ts`, `GET /api/catalog` |
| Clarification | `src/lib/server/clarify.ts`, `POST /api/rfq/clarify` |
| Export validation + PDF | `src/lib/server/quote-validation.ts`, `src/lib/server/pdf.ts`, `POST /api/quote/pdf` |
| UI | `src/app/page.tsx`, `src/components/*` |
| Pipeline ledger (browser-only) | `src/lib/client/ledger.ts`, `src/components/Pipeline.tsx` |

## Invariants

- Every derived field (match, price, compliance, readiness) is recomputed on the server for clarify and export; client values are discarded.
- The model transcribes only; items that cannot be traced to the source text are dropped and reported.
- Every model call (extraction, clarification, OCR, Jev) is traced to PRISM with the quote id as `session_id`.
- The Pipeline lives in the user's browser (`localStorage`); no server storage, no accounts.

## Deploy checklist (Render)

1. Web service from `render.yaml`; build `npm ci && npm run build`, start `npm run start`, health `/api/health`.
2. Set `NICRRON_API_KEY`, `TYPESAFE_API_KEY`, `PRISMTRACE_API_KEY`, `PRISMTRACE_PROJECT_ID` as secrets.
3. Open the URL, check the sidebar shows "AI online", run the "Messy shop email" sample and download its PDF.
