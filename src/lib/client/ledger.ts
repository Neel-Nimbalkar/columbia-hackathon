'use client';
/**
 * Quote ledger for the Pipeline view. Every processed RFQ is recorded in this
 * browser (no account, no server storage) with the latest quote snapshot, so a
 * rep can reopen it, mark it sent / won / lost and see conversion over time.
 */
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { quoteSchema } from '../shared/schema';
import type { Quote } from '../shared/schema';

export type DealStatus = 'draft' | 'sent' | 'won' | 'lost';
export const LOSS_REASONS = ['Price', 'Lead time', 'Spec / no match', 'Compliance / certs', 'No response', 'Other'] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export interface LedgerEntry {
  id: string;
  customer: string;
  rfqReference: string | null;
  /** Where the RFQ came from: file names or "Pasted email". */
  source: string;
  createdAt: string;
  /** Server processing time for the first pass (upload → extracted, matched, priced). */
  processingMs: number;
  /** Lines that were ready without any clarification. */
  firstPassReady: number;
  firstPassLines: number;
  /** First time every included line was ready to export. */
  readyAt: string | null;
  status: DealStatus;
  sentAt: string | null;
  decidedAt: string | null;
  lossReason: LossReason | null;
  note: string;
  quote: Quote;
}

const ledgerSchema = z.object({
  id: z.string(), customer: z.string(), rfqReference: z.string().nullable(), source: z.string(),
  createdAt: z.iso.datetime(), processingMs: z.number().nonnegative(), firstPassReady: z.number().int().nonnegative(), firstPassLines: z.number().int().nonnegative(),
  readyAt: z.iso.datetime().nullable(), status: z.enum(['draft', 'sent', 'won', 'lost']),
  sentAt: z.iso.datetime().nullable(), decidedAt: z.iso.datetime().nullable(), lossReason: z.enum(LOSS_REASONS).nullable(), note: z.string(), quote: quoteSchema,
}).refine(e => e.id === e.quote.id);

const KEY = 'rudco.ledger.v1';
const MAX_ENTRIES = 250;
let cache: LedgerEntry[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: LedgerEntry[] = [];

function read(): LedgerEntry[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as LedgerEntry[]) : [];
    cache = Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES).flatMap(e => { const result = ledgerSchema.safeParse(e); return result.success ? [result.data] : []; }) : [];
  } catch {
    cache = [];
  }
  return cache;
}

const MAX_SOURCE_CHARS = 12_000;

/** The source text is display-only; keep snapshots small so hundreds fit in the ~5 MB storage quota. */
function slim(e: LedgerEntry): LedgerEntry {
  const t = e.quote.originalText;
  return t.length <= MAX_SOURCE_CHARS ? e : { ...e, quote: { ...e.quote, originalText: `${t.slice(0, MAX_SOURCE_CHARS)}\n… [source text shortened in Pipeline history]` } };
}

function write(next: LedgerEntry[]): void {
  cache = next.slice(0, MAX_ENTRIES).map(slim);
  // Storage full: keep the newest entries that fit; everything stays usable in memory this session.
  for (let n = cache.length; n >= 0; n = n > 20 ? Math.floor(n * 0.7) : n - 1) {
    try { localStorage.setItem(KEY, JSON.stringify(cache.slice(0, n))); break; } catch { if (n === 0) break; }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) { cache = null; listener(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function useLedger(): LedgerEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const firstPass = (q: Quote) => q.items.filter((i) => i.included && i.status === 'Ready').length;

/** Record a freshly processed quote. */
export function recordProcessed(quote: Quote, source: string, processingMs: number): void {
  const now = new Date().toISOString();
  const entry: LedgerEntry = {
    id: quote.id,
    customer: quote.customer,
    rfqReference: quote.rfqReference ?? null,
    source,
    createdAt: now,
    processingMs,
    firstPassReady: firstPass(quote),
    firstPassLines: quote.items.length,
    readyAt: quote.ready ? now : null,
    status: 'draft',
    sentAt: null,
    decidedAt: null,
    lossReason: null,
    note: '',
    quote,
  };
  write([entry, ...read().filter((e) => e.id !== quote.id)]);
}

/** Keep the snapshot current as lines are clarified, corrected or repriced. */
export function recordUpdate(quote: Quote): void {
  const list = read();
  const i = list.findIndex((e) => e.id === quote.id);
  if (i < 0) return;
  const prev = list[i]!;
  const next = [...list];
  next[i] = { ...prev, customer: quote.customer, rfqReference: quote.rfqReference ?? null, quote, readyAt: prev.readyAt ?? (quote.ready ? new Date().toISOString() : null) };
  write(next);
}

export function setStatus(id: string, status: DealStatus, lossReason: LossReason | null = null): void {
  const now = new Date().toISOString();
  write(read().map((e) => e.id !== id ? e : {
    ...e,
    status,
    sentAt: status === 'draft' ? null : e.sentAt ?? now,
    decidedAt: status === 'won' || status === 'lost' ? now : null,
    lossReason: status === 'lost' ? lossReason ?? e.lossReason ?? 'Other' : null,
  }));
}

export function setNote(id: string, note: string): void {
  write(read().map((e) => (e.id === id ? { ...e, note: note.slice(0, 500) } : e)));
}

export function removeEntry(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** Effective state for display: a sent quote past its expiry date is expired. */
export function dealState(e: LedgerEntry, today = new Date().toISOString().slice(0, 10)): DealStatus | 'expired' {
  return e.status === 'sent' && e.quote.expires < today ? 'expired' : e.status;
}

export function ledgerCsv(entries: LedgerEntry[]): string {
  const esc = (v: unknown) => {
    const raw = v === null || v === undefined ? '' : String(v);
    const s = /^[\s]*[=+@-]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Quote', 'Customer', 'Customer RFQ', 'Created', 'Status', 'Loss reason', 'Lines', 'Ready lines', 'Total USD', 'Target margin', 'Expires', 'Sent', 'Decided', 'Note'];
  const rows = entries.map((e) => [
    e.id, e.customer, e.rfqReference, e.createdAt.slice(0, 10), dealState(e), e.lossReason, e.quote.items.length,
    e.quote.items.filter((i) => i.included && i.status === 'Ready').length, e.quote.total.toFixed(2), e.quote.targetMargin, e.quote.expires,
    e.sentAt?.slice(0, 10), e.decidedAt?.slice(0, 10), e.note,
  ].map(esc).join(','));
  return [head.join(','), ...rows].join('\n');
}
