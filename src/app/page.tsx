'use client';
import { useEffect, useRef, useState } from 'react';
import type { Quote, Spec } from '@/lib/shared/schema';
import { ApiRequestError, downloadPdf, processRfq, updateQuote } from '@/lib/client/api';
import { Sidebar, type View } from '@/components/Sidebar';
import { NewRfq, type IntakeDraft } from '@/components/NewRfq';
import { Workspace } from '@/components/Workspace';
import { FinalQuote } from '@/components/FinalQuote';
import { Message } from '@/components/ui';

export interface Processing { startedAt: number; label: string; hasFiles: boolean; controller: AbortController }

const HINTS: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: 'The server is missing its AI provider keys (NICRRON_API_KEY / TYPESAFE_API_KEY).',
  RATE_LIMITED: 'The AI provider is rate limiting. Wait a few seconds and retry.',
  OCR_REQUIRED: 'Try a clearer scan, a text-based PDF, or paste the RFQ text.',
  CLIENT_TIMEOUT: 'Very long or scanned RFQs can take a few minutes. Try splitting the document.',
};

export default function Home() {
  const [view, setView] = useState<View>('new');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Processing | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>({ text: '', files: [], customer: '', margin: '20' });
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }, [view]);

  function fail(e: unknown) {
    if (e instanceof ApiRequestError && e.code === 'CANCELLED') return;
    const message = e instanceof Error ? e.message : 'Something went wrong. Please retry.';
    const details = e instanceof ApiRequestError && Array.isArray(e.details) ? ` ${(e.details as string[]).slice(0, 3).join(' ')}` : '';
    setError({ message: message + (e instanceof ApiRequestError && e.code === 'QUOTE_BLOCKED' ? details : ''), hint: e instanceof ApiRequestError ? HINTS[e.code] : undefined });
  }

  function open(q: Quote, nextView: View = 'workspace') {
    setQuote(q);
    const firstIssue = q.items.find((i) => i.included && i.status !== 'Ready');
    setSelected((firstIssue ?? q.items[0])?.id ?? null);
    setView(nextView);
  }

  async function process(input: { text: string; files: File[]; customer: string; margin: number; source: string }) {
    if (processing || busy) return;
    const controller = new AbortController();
    const startedAt = Date.now();
    setError(null);
    setNotice(null);
    setProcessing({ startedAt, label: input.source, hasFiles: input.files.length > 0, controller });
    try {
      const q = await processRfq({ text: input.text, files: input.files, customer: input.customer, targetMargin: input.margin / 100, signal: controller.signal });
      open(q);
      const ready = q.items.filter((i) => i.status === 'Ready').length;
      setNotice(`${q.items.length} line${q.items.length === 1 ? '' : 's'} extracted · ${ready} ready${q.ready ? ' — the quote can be exported.' : '.'}`);
    } catch (e) {
      fail(e);
    } finally {
      setProcessing(null);
    }
  }

  async function changeLine(itemId: string, input: { response?: string; corrections?: Spec; included?: boolean; targetMargin?: number }, label = 'Updating') {
    if (!quote || busy) return false;
    setBusy(label);
    setError(null);
    try {
      const next = await updateQuote({ quote, itemId, ...input });
      setQuote(next);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf(q: Quote) {
    if (busy) return;
    setBusy('Generating PDF');
    setError(null);
    try {
      await downloadPdf(q);
      setNotice('PDF downloaded.');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="shell">
      <Sidebar view={view} onView={(v) => { setView(v); setError(null); }} quote={quote} />
      <div className="main-col">
        <main ref={mainRef}>
          {error && (
            <Message tone="error" onClose={() => setError(null)}>
              <strong>{error.message}</strong>{error.hint && <span className="hint"> {error.hint}</span>}
            </Message>
          )}
          {notice && !error && <Message tone="info" onClose={() => setNotice(null)}>{notice}</Message>}

          {view === 'new' && <NewRfq draft={draft} onDraft={setDraft} processing={processing} onProcess={process} onError={(m) => setError({ message: m })} />}
          {view === 'workspace' && (
            <Workspace
              quote={quote}
              selected={selected}
              onSelect={setSelected}
              busy={busy}
              onChangeLine={changeLine}
              onNext={() => setView('final')}
              onNew={() => setView('new')}
            />
          )}
          {view === 'final' && <FinalQuote quote={quote} busy={busy} onEdit={setQuote} onExport={exportPdf} onBack={(id) => { if (id) setSelected(id); setView('workspace'); }} onNew={() => setView('new')} />}
        </main>
      </div>
    </div>
  );
}
