# RudCo RFQ-to-Quote — notes for coding agents

- Next.js app (frontend + API routes) deployed as one Render web service (`render.yaml`). Ship through pull requests.
- Shared contract: `src/lib/shared/schema.ts`. Backend: `src/lib/server/*` (parse → extract → engine). Every derived field (match, price, compliance, ready) comes from `src/lib/server/engine.ts`; never trust client-supplied derived fields.
- Secrets are server-only env vars (see `.env.example`); never commit them or prefix them with `NEXT_PUBLIC_`.
- Checks: `npm run typecheck && npm test && npm run build`.

## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: src/lib/server/providers/prism.ts (HTTP ingest helper), src/lib/server/providers/nicrron.ts (every extraction/clarification model call), src/lib/server/providers/jev.ts (every TypeSafe Jev classification call)

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.
