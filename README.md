# RudCo RFQ-to-Quote

Turns messy metals RFQs (pasted email, PDF incl. fillable/XFA forms and scans, Word, Excel, CSV, saved .eml with attachments, photos) into explainable, priced quotations with a server-generated PDF. One Next.js service: frontend + API routes, deployed on Render (`render.yaml`).

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

## Using it

Open the app and either drop RFQ files / paste an email and press **Process RFQ**, or click one of the six **Try a sample RFQ** cards. Samples run through the real pipeline (AI extraction, catalog match, pricing) — nothing is precomputed:

| Sample | What it shows |
|---|---|
| Messy shop email | Shorthand (16ga, CRS, fractions) → three exact matches → exportable PDF (PRD test A) |
| Missing temper | 6061 plate without temper → precise question → answer `T6` → ready (PRD test B) |
| Unavailable grade & certs | 316L / 17-4 PH, DFARS, US melt, 3.1 MTRs → no substitution, alternatives shown, compliance missing (PRD test C) |
| Fillable RFQ form (PDF) | Values read from form fields and placed in their table rows; unchecked boxes are not requirements |
| Spreadsheet BOM | Merged title, blank row, cached formula, `TBD` quantity |
| Email with CSV attachment | Nested MIME, encoded subject, semicolon CSV attachment |

Sample files live in `public/samples/` (regenerate with `npx tsx scripts/make-samples.ts`).

**Workspace:** original RFQ with the selected line highlighted, extracted lines with status, per-line spec/provenance, catalog match and alternatives, pricing with the room between our margin floor and the benchmark, compliance evidence, buyer answers, spec corrections, include/exclude, margin repricing, and a one-click buyer email listing every open question. **Final quote:** editable customer/reference/dates, readiness checklist that links back to each blocked line, server-validated PDF and a cover email.

## Document handling

- **PDF:** text is rebuilt into visual lines from positions, so table rows stay together and columns are separated by `|`. Fillable-form values (text, choice, checkbox `[x]`/`[ ]`, radio) are merged into the row they sit on; template placeholders (`MM/DD/YY`, `$0.00`, `Name`) are dropped. XFA forms are read through pdf.js. Pages with no text layer are treated as scans: the page image is extracted, encoded as PNG and transcribed by the vision model (up to 10 pages), labeled `(transcribed)`.
- **Images** (PNG/JPG/WebP/GIF ≤ 5 MB) are transcribed the same way. HEIC, `.xls`, `.doc`, `.msg` get a specific "save as …" message.
- **Word (.docx):** paragraphs and tables in document order. **Excel:** merged cells once, cached formula results only, header row detected by column titles. **CSV/TSV:** delimiter detected (`,` `;` tab `|`), UTF-8/UTF-16/Windows-1252.
- **Email (.eml):** nested multipart, RFC 2047 headers, per-part charsets, HTML fallback, forwarded messages, and supported attachments parsed as their own sources.
- **Long RFQs** are extracted in overlapping chunks in parallel; a reply that hits the output limit splits its chunk. Items may span several lines (wrapped table rows) and are anchored to the exact line range; anything that cannot be traced to the documents is dropped and reported. Every truncation is surfaced as a warning.

## Verification

```sh
npm run typecheck
npm run build
npm run start
```

Production start binds `0.0.0.0` using `PORT`, defaulting to 3000. `GET /api/health` reports provider configuration without calling models.

## Delivery and Render

Ship through pull requests only. One Node web service on Render (`render.yaml`): `npm ci && npm run build`, `npm run start`, health `/api/health`, server-only secrets (`NICRRON_API_KEY`, `TYPESAFE_API_KEY`, `PRISMTRACE_*`), auto-deploy from `main`.

## Data disclosure

Catalog product facts are sourced from Speedy Metals product pages; stock, cost and lead time are synthetic seeds and labeled as such in the UI and PDF. No certificates or origin evidence are invented.
