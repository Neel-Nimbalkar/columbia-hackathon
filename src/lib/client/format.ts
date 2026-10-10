import type { Quote, QuoteItem, Spec } from '../shared/schema';

export const money = (n: number, digits = 2) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** $1.2K / $34K / $1.4M for tiles and axes. */
export function compactMoney(n: number): string {
  if (Math.abs(n) < 1000) return money(n, 0);
  return `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;
}

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 10_000) / 10_000}`);

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export function relativeDate(iso: string, now = Date.now()): string {
  // Calendar days in local time: 11 pm yesterday is "Yesterday" at 9 am, not "Today".
  const midnight = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((midnight(now) - midnight(Date.parse(iso))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "304 Stainless steel · Sheet", from the normalized spec. */
export function itemTitle(s: Spec): string {
  const head = [s.grade, s.temper && !String(s.grade ?? '').includes(s.temper) ? s.temper : null].filter(Boolean).join('-');
  const mat = s.material ? titleCase(s.material) : null;
  const parts = [head, mat].filter(Boolean).join(' ');
  return [parts || 'Unspecified material', s.form ? titleCase(s.form) : null].filter(Boolean).join(' · ');
}

/** Human-readable size, e.g. "0.06 × 12 × 24 in", "Ø1 × 36 in", "16 ga × 12 × 24 in". */
export function itemSize(s: Spec): string {
  const u = s.dimensionUnit ? ` ${s.dimensionUnit}` : '';
  const thick = s.gauge !== null && s.thickness === null ? `${s.gauge} ga` : s.thickness !== null ? num(s.thickness) : null;
  let dims: (string | null)[];
  if (s.form === 'round bar') dims = [s.diameter !== null ? `Ø${num(s.diameter)}` : null, s.length !== null ? num(s.length) : null];
  else if (s.form === 'tube') dims = [s.diameter !== null ? `Ø${num(s.diameter)}` : null, thick ? `${thick} wall` : null, s.length !== null ? num(s.length) : null];
  else dims = [thick, s.width !== null ? num(s.width) : null, s.length !== null ? num(s.length) : null, s.diameter !== null && s.form !== 'sheet' ? `Ø${num(s.diameter)}` : null];
  const d = dims.filter(Boolean);
  if (!d.length) return 'Size not stated';
  return `${d.join(' × ')}${u}${!s.dimensionUnit && d.some((x) => /\d/.test(x!) && !/ga/.test(x!)) ? ' (unit?)' : ''}`;
}

export function qtyLabel(i: QuoteItem): string {
  if (i.spec.quantity === null) return 'Qty ?';
  return `${i.spec.quantity} ${i.spec.quantityUnit ?? (i.pricing ? 'pc' : '')}`.trim();
}

/** Strip the engine's "Line 3 (…): " prefix so a question reads naturally in an email or list. */
export function bareQuestion(q: string): string {
  return q.replace(/^(?:Line|Item) \d+(?: \([^)]*\))?:\s*/, '');
}

export function openIssues(i: QuoteItem): string[] {
  return [...i.conflicts, ...i.questions, ...i.blockers];
}

export function isBlocked(i: QuoteItem): boolean {
  return i.included && (i.status !== 'Ready' || i.blockers.length > 0 || i.questions.length > 0 || i.conflicts.length > 0 || !i.pricing);
}

/** Weighted gross margin across priced, included lines. */
export function quoteMargin(q: Quote): number | null {
  const priced = q.items.filter((i) => i.included && i.pricing);
  const revenue = priced.reduce((s, i) => s + i.pricing!.lineTotal, 0);
  if (!revenue) return null;
  const cost = priced.reduce((s, i) => s + i.pricing!.cost * (i.pricing!.lineTotal / i.pricing!.unitPrice), 0);
  return (revenue - cost) / revenue;
}

/* ------------------------------------------------------------------ */
/* Source references                                                    */
/* ------------------------------------------------------------------ */

/** One line of the uploaded RFQ as shown in the source viewer. `ref` is null for quotes processed before refs were recorded. */
export type SourceEntry = { kind: 'doc'; name: string } | { kind: 'line'; ref: string | null; label: string; text: string; doc: string };

/** Parse `quote.originalText`: "--- name ---" document headers, then "ref<TAB>text" lines. */
export function parseSourceText(originalText: string): SourceEntry[] {
  let doc = '';
  return originalText.split('\n').map((line): SourceEntry => {
    const header = /^--- (.*) ---$/.exec(line);
    if (header) { doc = header[1]!; return { kind: 'doc', name: doc }; }
    const tab = line.indexOf('\t');
    if (tab < 0) return { kind: 'line', ref: null, label: '', text: line, doc };
    const ref = line.slice(0, tab);
    return { kind: 'line', ref, label: stripDoc(ref, doc), text: line.slice(tab + 1), doc };
  });
}

/** Document names in the quote's source text. */
export function sourceDocs(originalText: string): string[] {
  return [...originalText.matchAll(/^--- (.*) ---$/gm)].map((m) => m[1]!);
}

function stripDoc(ref: string, doc: string): string {
  if (doc && ref.startsWith(`${doc} · `)) return ref.slice(doc.length + 3);
  if (doc && ref.startsWith(`${doc} › `)) return ref.slice(doc.length + 3);
  return ref;
}

/**
 * The first and last source line of an item. Items spanning lines are stored as
 * "doc · lines 20–23" or "doc · page 1 · line 40 → page 2 · line 2".
 */
export function sourceRange(source: string): { start: string; end: string } {
  const arrow = source.indexOf(' → ');
  if (arrow >= 0) {
    const start = source.slice(0, arrow);
    return { start, end: `${start.split(' · ')[0]} · ${source.slice(arrow + 3)}` };
  }
  const span = /^(.*) · lines (\d+)–(\d+)(.*)$/.exec(source);
  if (span) return { start: `${span[1]} · line ${span[2]}${span[4]}`, end: `${span[1]} · line ${span[3]}${span[4]}` };
  return { start: source, end: source };
}

/** Where an item sits in the RFQ, without the file name when the RFQ is a single document: "page 2 · line 14". */
export function sourceLabel(source: string, docs: string[]): string {
  if (docs.length !== 1) return source;
  const short = stripDoc(source, docs[0]!);
  return short === source ? source : short;
}

/** Split issue text around generated item references ("item 2 [rfq.pdf · row 4]") so they can link to that item. */
export function issueParts(text: string): ({ text: string } | { item: number; source: string })[] {
  const parts: ({ text: string } | { item: number; source: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\bitem (\d+) \[([^\]]+)\]/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ item: Number(m[1]), source: m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
