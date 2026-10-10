/**
 * PRISM tracing over HTTP ingest (no SDK). One trace per model/classifier
 * call; `sessionId` (the quote id) groups a whole RFQ run into one trajectory.
 * Tracing never breaks a user request: failures are logged and swallowed.
 */
const MAX_FIELD_CHARS = 8000;

export interface TraceInput {
  model: string;
  input: { role: string; content: string }[];
  output: string;
  latencyMs: number;
  sessionId?: string;
}

function clip(s: string): string {
  return s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}… [truncated ${s.length - MAX_FIELD_CHARS} chars]` : s;
}

export function prismConfigured(): boolean {
  return Boolean(process.env.PRISMTRACE_API_KEY && process.env.PRISMTRACE_PROJECT_ID);
}

export async function emitTrace(t: TraceInput): Promise<void> {
  const apiKey = process.env.PRISMTRACE_API_KEY;
  const projectId = process.env.PRISMTRACE_PROJECT_ID;
  if (!apiKey || !projectId || process.env.PRISMTRACE_DISABLED === '1') return;
  const host = (process.env.PRISMTRACE_HOST ?? 'https://prism-api-prod.up.railway.app').replace(/\/+$/, '');
  try {
    const res = await fetch(`${host}/api/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PRISMtrace-Key': apiKey },
      body: JSON.stringify({
        project_id: projectId,
        model: t.model,
        input_messages: t.input.map((m) => ({ role: m.role, content: clip(m.content) })),
        output_message: clip(t.output),
        latency_ms: Math.round(t.latencyMs),
        session_id: t.sessionId,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[prism] ingest ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } catch (err) {
    console.warn('[prism] ingest failed', (err as Error).message);
  }
}
