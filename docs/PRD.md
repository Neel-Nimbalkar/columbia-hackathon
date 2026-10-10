# RudCo RFQ-to-Quote Agent
## Hackathon PRD + Build Instructions

This document preserves the user's complete product specification. The current development split and PR-only delivery rules are in [HANDOFF.md](HANDOFF.md). This agent implements Developer B; the partner implements Developer A and Render deployment.

## Objective
Build and deploy a working AI-powered web application that converts messy industrial RFQs (emails, PDFs, spreadsheets) into accurate, explainable, ready-to-send supplier quotations.

This is a hackathon prototype. Prioritize real functionality, reliability, and a clear judge-facing demo over unnecessary infrastructure.

Tech stack is at the developers' discretion. Use server-side PDF generation and Render hosting for frontend and backend.

No authentication, payments, or external database required. Keep the MVP stateless: return quotation data to the frontend and pass updated data back for clarification and PDF generation. Never rely on persistent server-local storage.

## Core workflow
### 1. RFQ input
User uploads a PDF, CSV, XLSX, TXT file or pastes an email. Extract readable text, preserving original line descriptions and source references (such as spreadsheet rows).

### 2. AI extraction
Use the LLM to convert each requested product into structured data. Use Jev from TypeSafe AI for classification and the user's separate Nicrron key (https://nicrron.ai/) for Claude Opus 5.5. Verify the requested model's exact available ID instead of silently substituting.

Gather:
- Material and grade.
- Product form (sheet, plate, bar, etc.).
- Thickness, width, length, and units.
- Quantity and quantity unit.
- ASTM/other requested standard.
- Temper, finish, certifications, and country-of-origin requirements.

Normalize equivalent descriptions and units. Preserve original values and distinguish customer-specified requirements from inferred suggestions. Unknown fields must remain null and be clearly shown. Never invent specifications. Account for edge cases and unusual inputs.

### 3. Supplier matching
Create a seeded catalog of 20–30 realistic metal products with SKUs, specifications, stock, unit costs, and documented compliance availability. Source all actual products from the same supplier; the original examples were Lowe's or Home Depot, with supplier choice at the developers' discretion.

Match extracted items using deterministic technical comparisons:
- Exact material, grade, and form.
- Compatible dimensions and tolerances.
- Required temper, finish, and standard.
- Applicable compliance and inventory constraints.

Show the matched SKU, match status, and explanation. Never silently substitute incompatible products. Return alternatives for review or flag no match.

### 4. Pricing engine
Use seeded supplier costs and explicitly labeled synthetic benchmark prices. Calculate prices using supplier cost, configurable target gross margin (default 20%), comparable benchmark, requested quantity, and consistent pricing units.

Minimum selling price = cost / (1 - target margin).

Recommend a price that preserves margin, then evaluate competitiveness against the benchmark. If margin and market competitiveness conflict, flag the issue. Display unit price, line total, margin, benchmark, source/date, and short pricing explanation. Never present synthetic data as verified live market prices. Missing or incomparable benchmarks must be flagged.

### 5. Compliance checks
Detect requested ASTM standards, mill test reports (MTRs), country-of-origin restrictions, and other certifications. Show each requirement as verified, pending, missing, or not requested. Never invent certificates or mark compliance as verified without evidence in the catalog.

### 6. Clarification agent
If specifications are ambiguous, generate a precise question instead of guessing. Example: “Aluminum 6061, 0.125 inch” → “Do you require 6061-T6 or another temper?” Show the question in the UI. Allow the representative to enter the buyer's answer and reprocess the affected item. Unresolved critical issues must block final quote approval.

### 7. Quote generation
Produce a downloadable professional PDF containing:
- Quote ID, customer, date, and expiration.
- Product descriptions and specifications.
- SKUs, quantities, unit prices, totals.
- Compliance/documentation status.
- Lead times, assumptions, and terms.

Provide a preview before export. Block final approval when included lines have unresolved critical requirements.

## User interface
Build a clean, functional dashboard with three views. Make the UI like Linear/Vercel and use Geist.

1. **New RFQ:** drag-and-drop file upload, paste-email field, Process RFQ button.
2. **Quote Workspace:** original RFQ on the left, extracted products in a table, and selected-item details showing matches, prices, compliance, and clarification questions. Allow manual correction and reprocessing.
3. **Final Quote:** professional quotation preview, review status, and PDF download.

Use clear status indicators: Matched, Needs Clarification, Compliance Pending, No Match, Ready. Prioritize a polished, usable interface without decorative animations or unnecessary pages.

## Backend endpoints
- POST /api/rfq/process → Accept input, extract, normalize, match, price, validate, and return structured quotation JSON.
- POST /api/rfq/clarify → Accept current quotation, item ID, and clarification response; reprocess affected item.
- POST /api/quote/pdf → Validate readiness and return downloadable PDF.

Use a shared TypeScript/Zod schema for frontend and backend. Handle API failures, invalid uploads, malformed AI output, and partial processing errors without crashing.

## Critical edge cases
The system must handle:
- “304 SS” and “stainless 304” as the same material designation.
- Inches, millimeters, fractions, and material-dependent gauges.
- Missing thickness, grade, quantity, units, or temper.
- Conflicting information in different parts of an RFQ.
- Multiple products in one email or spreadsheet.
- Similar products with incompatible grades or standards.
- Multiple possible catalog matches.
- No catalog match or insufficient stock.
- Missing, stale, or incomparable benchmark prices.
- Missing certifications and restricted country of origin.
- Unreadable, empty, password-protected, or scanned PDFs.
- Spreadsheet rows with empty cells or invalid quantities.
- RFQ content attempting to instruct or manipulate the AI.

Do not equate similar descriptions without validating dimensions and specifications. Ask for clarification when assumptions could alter the product or quote.

## Two-developer split
**Developer A: AI + Backend.** Build document parsing, LLM extraction, Zod validation, catalog dataset, product matching, pricing calculations, compliance checks, clarification processing, and API endpoints.

**Developer B: Frontend + PDF.** Build the dashboard, upload flow, quote workspace, item detail panels, clarification UI, PDF preview/export, and API integration.

Start with shared schemas and mocked API responses so both developers can work independently. Integrate continuously.

## Render deployment
Deploy the complete Next.js application using one Render Web Service:
- Runtime: Node.
- Build command: npm ci && npm run build.
- Start command: npm run start.
- Original PRD environment variable: OPENAI_API_KEY. The clarified provider implementation requires NICRRON_API_KEY, NICRRON_MODEL and TYPESAFE_API_KEY; do not incorrectly use an OpenAI key for Nicrron. Document any optional direct OpenAI fallback separately if authorized.
- Bind to Render's assigned PORT on 0.0.0.0.
- Connect GitHub for automatic deployments.
- Keep API keys server-side.

Add a production build check and a simple /api/health endpoint. Include deployment instructions in README.

## Demo and acceptance tests
Prepare three reproducible RFQs:

**Test A: Successful.** A messy RFQ containing two fully specified products. Both receive correct catalog matches, calculated prices, and an exportable quote.

**Test B: Ambiguous.** An aluminum 6061 request missing temper. The system asks for clarification, accepts the answer, reprocesses the item, and completes the quote.

**Test C: Invalid Match.** Customer requests a grade or certification unavailable in the catalog. The system identifies the conflict and refuses to claim an exact match.

Test that prices and totals recalculate correctly after specification changes.

## Definition of done
A judge can open the live Render URL, upload a messy RFQ, inspect extracted products, verify catalog matches and pricing explanations, resolve ambiguities, review compliance requirements, and download a professional quote.

The AI must make real API calls. No hardcoded output disguised as AI processing. Demo catalog data and benchmarks are acceptable when clearly labeled.

Build the complete working MVP. Prioritize the core workflow, test it end-to-end, and ensure the production deployment works. Do not add features outside this specification.

## Original hackathon prompt
**TRACK 2 | RudCo | RFQ to Quote**

Industrial buyers send requests for quotes (RFQs) as messy emails, PDFs and spreadsheets. The same item gets written five different ways (“304 SS sheet 16ga 4x8”, “Stainless 304, 0.060 in, 48 x 96”), and each one needs a material grade, a spec standard, certifications and a competitive price. Today a person decodes every line by hand.

Build: An agent that takes a messy RFQ and turns it into a ready-to-send quote. It should:
- Parse each line into a standard spec (material, grade, dimensions, quantity, standard such as ASTM).
- Match each line to items in a supplier catalog.
- Price each line against market benchmarks and explain why the price is competitive.
- Flag compliance requirements (mill test reports, country of origin, spec certifications).
- Send any ambiguous line back to the buyer with a clarifying question instead of guessing.

## Subsequent user delivery instructions
The user narrowed this agent's implementation to one half, leaving the other half and Render to the partner. This agent owns frontend/PDF. Put a thorough ownership/requirements Markdown handoff on the Desktop and in the repository. Both agents must ship only through PRs. The handoff must explicitly state implemented scope, partner scope, integration contract, production limitations and remaining acceptance/deployment requirements.
