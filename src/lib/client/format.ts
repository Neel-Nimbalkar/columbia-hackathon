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
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
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
  return q.replace(/^Line \d+(?: \([^)]*\))?:\s*/, '');
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
