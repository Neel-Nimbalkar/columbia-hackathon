'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CircleHelp, FileText, Inbox, Loader2, Pencil, ShieldCheck } from 'lucide-react';
import type { Quote, QuoteItem, Spec } from '@/lib/shared/schema';
import { isBlocked, itemSize, itemTitle, money, openIssues, parseSourceText, pct, qtyLabel, sourceDocs, sourceLabel, sourceRange } from '@/lib/client/format';
import { percentToMargin } from '@/lib/shared/pricing';
import { Badge, Empty, IssueText, Message, Modal, PageHeader } from './ui';

type LineChange = { response?: string; corrections?: Spec; included?: boolean; targetMargin?: number };

const SPEC_FIELDS: { key: keyof Spec; label: string; numeric?: boolean }[] = [
  { key: 'material', label: 'Material' }, { key: 'grade', label: 'Grade' }, { key: 'temper', label: 'Temper' },
  { key: 'form', label: 'Form' }, { key: 'finish', label: 'Finish' }, { key: 'gauge', label: 'Gauge', numeric: true },
  { key: 'thickness', label: 'Thickness / wall', numeric: true }, { key: 'width', label: 'Width', numeric: true },
  { key: 'length', label: 'Length', numeric: true }, { key: 'diameter', label: 'Diameter / OD', numeric: true },
  { key: 'dimensionUnit', label: 'Dimension unit' }, { key: 'tolerance', label: 'Tolerance (±)', numeric: true },
  { key: 'quantity', label: 'Quantity', numeric: true }, { key: 'quantityUnit', label: 'Quantity unit' },
  { key: 'countryOfOrigin', label: 'Origin restriction' },
];

const PROVENANCE: Record<string, string> = { customer: 'stated', normalized: 'normalized', suggestion: 'inferred' };

export function Workspace({ quote, selected, onSelect, busy, onChangeLine, onNext, onNew }: {
  quote: Quote | null; selected: string | null; onSelect: (id: string) => void; busy: string | null;
  onChangeLine: (itemId: string, input: LineChange, label?: string) => Promise<boolean>;
  onNext: () => void; onNew: () => void;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [margin, setMargin] = useState('');
  useEffect(() => { if (quote) setMargin(String(Math.round(quote.targetMargin * 1e6) / 1e4)); }, [quote?.id, quote?.targetMargin]);
  const docs = useMemo(() => sourceDocs(quote?.originalText ?? ''), [quote?.originalText]);
  if (!quote) return <Empty icon={<Inbox size={22} />} title="No RFQ to review" action={<button className="button primary" onClick={onNew}>New RFQ<ArrowRight size={14} /></button>}>Upload or paste a request to get started.</Empty>;

  const included = quote.items.filter(i => i.included);
  const issues = included.filter(isBlocked);
  const filtering = issuesOnly && issues.length > 0;
  const visible = filtering ? issues : quote.items;
  const item = visible.find(i => i.id === selected) ?? visible[0]!;
  // Jumping to another item (from a question or the RFQ viewer) must not be hidden by the filter.
  const select = (id: string) => { if (filtering && !issues.some(i => i.id === id)) setIssuesOnly(false); onSelect(id); };
  const ready = included.length - issues.length;
  const marginNum = Number(margin);
  const marginValid = margin.trim() !== '' && Number.isFinite(marginNum) && marginNum >= 0 && marginNum <= 80;
  return <>
    <PageHeader title="Review RFQ" subtitle={quote.customer || 'Check the items below.'} actions={
      issues.length ? <button className="button primary" disabled={!!busy} onClick={() => { setIssuesOnly(true); onSelect(issues[0]!.id); }}><CircleHelp size={14} />Resolve questions</button>
        : <button className="button primary" disabled={!!busy} onClick={onNext}>Review quote<ArrowRight size={14} /></button>
    } />
    <div className={`review-summary ${issues.length ? 'needs-review' : 'complete'}`}>
      {issues.length ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}
      <div><strong>{issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'} need attention` : included.length ? 'Your quote is ready' : 'No items included'}</strong><p>{ready} of {included.length} included items ready{quote.items.length !== included.length ? ` · ${quote.items.length - included.length} excluded` : ''}</p></div>
      <div className="review-total"><small>{issues.length ? 'Priced items' : 'Quote total'}</small><strong>{money(quote.total)}</strong></div>
    </div>
    {quote.warnings.length > 0 && <Message tone="warning"><p>{quote.warnings[0]}</p>{quote.warnings.length > 1 && <details className="review-notes"><summary>{quote.warnings.length - 1} more review note{quote.warnings.length === 2 ? '' : 's'}</summary><ul className="plain-list">{quote.warnings.slice(1).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}</Message>}
    <section className="card review-items">
      <div className="review-toolbar">
        <div className="line-filter" aria-label="Item filter"><button className={!filtering ? 'active' : ''} onClick={() => setIssuesOnly(false)}>All items ({quote.items.length})</button>{issues.length > 0 && <button className={filtering ? 'active' : ''} onClick={() => setIssuesOnly(true)}>Needs attention ({issues.length})</button>}</div>
        <button className="button secondary small" onClick={() => setSourceOpen(true)}><FileText size={13} />View RFQ</button>
      </div>
      <div className="table-wrap"><table className="lines"><thead><tr><th>Item · where in the RFQ</th><th>Quantity</th><th>Status</th><th className="num">Amount</th></tr></thead><tbody>
        {visible.map(i => <tr key={i.id} className={`${i.id === item.id ? 'selected' : ''} ${i.included ? '' : 'excluded'}`} onClick={() => onSelect(i.id)}>
          <td><button className="row-button" onClick={e => { e.stopPropagation(); onSelect(i.id); }} aria-pressed={i.id === item.id}><strong>{quote.items.indexOf(i) + 1}. {itemTitle(i.normalized)}</strong><small>{itemSize(i.spec)}</small><small className="row-source" title={i.source}><FileText size={11} aria-hidden />{sourceLabel(i.source, docs)}</small></button></td>
          <td>{qtyLabel(i)}</td><td><Badge status={i.included ? i.status : 'Excluded'} /></td><td className="num">{i.included && i.pricing ? money(i.pricing.lineTotal) : '—'}</td>
        </tr>)}
      </tbody></table></div>
    </section>
    <LineDetail key={item.id} quote={quote} item={item} docs={docs} busy={busy} onChangeLine={onChangeLine} onSelect={select} onShowSource={() => setSourceOpen(true)} />
    <div className="review-footer">
      <details className="pricing-settings"><summary>Pricing settings</summary><div className="margin-setting"><label>Target gross margin<span className="input-suffix small"><input aria-label="Target gross margin" disabled={!!busy} type="number" min={0} max={80} step={0.5} value={margin} onChange={e => setMargin(e.target.value)} /><span>%</span></span></label><button className="button secondary small" disabled={!!busy || !marginValid || Math.abs(percentToMargin(marginNum) - quote.targetMargin) < 1e-9} onClick={() => onChangeLine(item.id, { targetMargin: percentToMargin(marginNum) }, 'Repricing')}>Reprice</button></div></details>
      {issues.length > 0 && <button className="button secondary" disabled={!!busy} onClick={onNext}>Preview quote<ArrowRight size={14} /></button>}
    </div>
    <p className="data-note">Catalog facts and benchmarks are sourced. Cost, stock and lead time are synthetic.</p>
    {sourceOpen && <Modal title="Original RFQ" onClose={() => setSourceOpen(false)} wide><SourcePanel quote={quote} item={item} docs={docs} onSelect={select} /></Modal>}
  </>;
}

function SourcePanel({ quote, item, docs, onSelect }: { quote: Quote; item: QuoteItem; docs: string[]; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => parseSourceText(quote.originalText), [quote.originalText]);
  const hasRefs = entries.some(e => e.kind === 'line' && e.ref);
  // Each item's first and last line in the RFQ, located by its exact source reference.
  const spans = useMemo(() => {
    const at = new Map<string, number>();
    entries.forEach((e, i) => { if (e.kind === 'line' && e.ref && !at.has(e.ref)) at.set(e.ref, i); });
    return quote.items.map((it, n) => {
      const range = sourceRange(it.source);
      const start = at.get(range.start);
      if (start === undefined) return null;
      const end = at.get(range.end);
      return { item: it, number: n + 1, start, end: end !== undefined && end >= start ? end : start };
    });
  }, [entries, quote.items]);
  const current = spans[quote.items.indexOf(item)] ?? null;
  // Quotes saved before line references existed: match the customer's text instead.
  const pieces = useMemo(() => item.original.split(' / ').map(p => p.trim().toLowerCase()).filter(p => p.length > 2), [item.original]);
  const textHit = (l: string) => { const t = l.trim().toLowerCase(); return !!t && pieces.some(p => t === p || t.includes(p) || (p.includes(t) && t.length > 12)); };
  const highlighted = (i: number, text: string) => current ? i >= current.start && i <= current.end : textHit(text);
  const starts = useMemo(() => {
    const m = new Map<number, NonNullable<(typeof spans)[number]>[]>();
    for (const s of spans) if (s) m.set(s.start, [...(m.get(s.start) ?? []), s]);
    return m;
  }, [spans]);
  useEffect(() => { ref.current?.querySelector('.hl')?.scrollIntoView?.({ block: 'center' }); }, [item.id]);
  const number = quote.items.indexOf(item) + 1;
  return <section className="source">
    <p className="source-intro">Item {number} comes from <strong>{item.source}</strong>{current ? ' (highlighted).' : '.'}{hasRefs && ' Tags show where each item starts; select one to review it.'}</p>
    <div className={`source-text ${hasRefs ? '' : 'no-refs'}`} ref={ref}>{entries.map((e, i) => e.kind === 'doc'
      ? <div key={i} className="source-doc">{e.name}</div>
      : <div key={i} className={`source-line ${highlighted(i, e.text) ? 'hl' : ''}`}>
        {hasRefs && <span className="source-loc" title={e.ref ?? undefined}>{e.label}</span>}
        <span className="source-body">{e.text || ' '}</span>
        <span className="source-tags">{starts.get(i)?.map(s => {
          const open = s.item.included ? openIssues(s.item).length : 0;
          const tone = !s.item.included ? 'excluded' : isBlocked(s.item) ? 'issue' : 'ready';
          return <button key={s.item.id} type="button" className={`source-item ${tone}`} aria-pressed={s.item.id === item.id} onClick={() => onSelect(s.item.id)}>Item {s.number}{open ? ` · ${open} open` : !s.item.included ? ' · excluded' : ''}</button>;
        })}</span>
      </div>)}</div>
  </section>;
}

function LineDetail({ quote, item, docs, busy, onChangeLine, onSelect, onShowSource }: { quote: Quote; item: QuoteItem; docs: string[]; busy: string | null; onChangeLine: (id: string, input: LineChange, label?: string) => Promise<boolean>; onSelect: (id: string) => void; onShowSource: () => void }) {
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const asks = [...new Set([...item.conflicts, ...item.questions])];
  const blockers = item.blockers.filter(b => !asks.includes(b));
  const requirements = item.compliance.filter(c => c.status !== 'not_requested');
  const price = item.pricing;
  const where = sourceLabel(item.source, docs);
  const issue = (text: string) => <IssueText text={text} items={quote.items} docs={docs} currentId={item.id} onSelect={onSelect} />;
  return <section className="card detail">
    <div className="detail-head"><div><span className="eyebrow">Item {quote.items.indexOf(item) + 1}</span><h2>{itemTitle(item.normalized)}</h2><p className="muted">{itemSize(item.spec)} · {qtyLabel(item)}</p></div><div className="detail-actions"><button className="button secondary small" disabled={!!busy} onClick={() => setEditing(true)}><Pencil size={13} />Edit specs</button><label className="toggle"><input type="checkbox" checked={item.included} disabled={!!busy} onChange={e => onChangeLine(item.id, { included: e.target.checked }, e.target.checked ? 'Including line' : 'Excluding line')} />Include</label></div></div>
    <div className="line-source">
      <div className="line-source-head"><span><FileText size={13} aria-hidden />From the RFQ · <strong title={item.source}>{where}</strong></span><button type="button" className="button secondary small" onClick={onShowSource}>Show in RFQ</button></div>
      <blockquote>{item.original}</blockquote>
    </div>
    {!item.included && <p className="excluded-note">Excluded from the quote. Include this item to resolve its requirements.</p>}
    {asks.length > 0 && <div className="ask"><div className="ask-head"><CircleHelp size={15} /><strong>Buyer confirmation needed</strong><span className="ask-ref">about {where}</span></div><ul>{asks.map((question, i) => <li key={i}>{issue(question)}</li>)}</ul><form onSubmit={async e => { e.preventDefault(); if (answer.trim() && !busy && await onChangeLine(item.id, { response: answer.trim() }, 'Applying answer')) setAnswer(''); }}><input aria-label="Buyer's answer" disabled={!!busy} value={answer} maxLength={8000} onChange={e => setAnswer(e.target.value)} placeholder="Enter the buyer’s answer" /><button className="button primary small" disabled={!answer.trim() || !!busy}>{busy === 'Applying answer' ? <Loader2 size={13} className="spin" /> : <Check size={13} />}Apply answer</button></form></div>}
    {blockers.length > 0 && <div className="blockers"><AlertTriangle size={15} /><ul>{blockers.map((b, i) => <li key={i}>{issue(b)}</li>)}</ul></div>}
    <div className="line-overview"><div><span>Catalog match</span><strong>{item.matchedSku ?? (asks.length ? 'Awaiting confirmation' : 'No exact match')}</strong>{item.leadTime && <small>Lead time: {item.leadTime}</small>}</div><div><span>Price per piece</span><strong>{price ? money(price.unitPrice) : 'Pending'}</strong><small>{price && price.competitive !== null && price.benchmark !== null ? `${money(Math.abs(price.benchmark - price.unitPrice))} ${price.competitive ? 'at or below' : 'above'} benchmark` : 'Benchmark comparison unconfirmed'}</small></div><div><span>Requirements</span><strong>{requirements.some(c => c.status === 'missing' || c.status === 'pending') ? 'Evidence needed' : requirements.length ? 'Verified' : 'None requested'}</strong><small>{requirements.map(c => c.requirement).join(' · ') || 'MTR and origin not requested'}</small></div></div>
    <div className="line-disclosures">
      <details><summary>Specifications & catalog match</summary><dl className="spec-grid">{SPEC_FIELDS.filter(({ key }) => item.spec[key] !== null || ['material', 'grade', 'form', 'quantity'].includes(key)).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd className={item.spec[key] === null ? 'unknown' : ''}>{item.spec[key] === null ? 'Not stated' : String(item.spec[key])}{item.provenance[key] && <small className={`prov ${item.provenance[key]}`}>{PROVENANCE[item.provenance[key]!]}</small>}</dd></div>)}{item.spec.standards.length > 0 && <div><dt>Standards</dt><dd>{item.spec.standards.join(', ')}</dd></div>}</dl><ul className="explain">{item.matchExplanation.map((explanation, i) => <li key={i}>{explanation}</li>)}</ul>{item.alternatives.length > 0 && <><h3 className="sub">Alternatives — buyer approval required</h3><ul className="alts">{item.alternatives.map(a => <li key={a.sku}><code>{a.sku}</code>{a.reason}</li>)}</ul></>}</details>
      <details><summary>Price & benchmark</summary>{price ? <><div className="price-grid"><div><span>Our price / {price.unit}</span><strong>{money(price.unitPrice)}</strong></div><div><span>Benchmark / {price.unit}</span><strong>{price.benchmark === null ? 'Unavailable' : money(price.benchmark)}</strong></div><div><span>Gross margin</span><strong>{pct(price.margin)}</strong></div><div><span>Item total</span><strong>{money(price.lineTotal)}</strong></div></div><p className="explain-text">{price.explanation}</p><p className="muted small-note">{price.benchmarkStatus}{price.benchmarkSource && ` · ${price.benchmarkSource}`}{price.benchmarkDate && ` · ${price.benchmarkDate}`}.</p></> : <p className="muted">An exact match and a quantity in pieces are needed before pricing.</p>}</details>
      <details><summary>Compliance evidence{requirements.some(c => c.status === 'missing' || c.status === 'pending') ? ' — missing or pending' : ''}</summary><ul className="compliance">{item.compliance.map((c, i) => <li key={i}><ShieldCheck size={15} /><div><strong>{c.requirement}</strong><p>{c.evidence}</p></div><Badge status={c.status} /></li>)}</ul></details>
    </div>
    {item.included && isBlocked(item) && <p className="line-help">Confirm these details with the buyer, then apply their answer above or edit the specs. You can exclude this item to quote the rest.</p>}
    {editing && <CorrectionForm item={item} busy={busy} onClose={() => setEditing(false)} onSave={async spec => { if (await onChangeLine(item.id, { corrections: spec }, 'Reprocessing line')) setEditing(false); }} />}
  </section>;
}

function CorrectionForm({ item, busy, onClose, onSave }: { item: QuoteItem; busy: string | null; onClose: () => void; onSave: (spec: Spec) => void }) {
  const [draft, setDraft] = useState<Spec>(() => structuredClone(item.spec));
  // Lists are edited as raw text and split on save, so spaces and commas can be typed.
  const [standards, setStandards] = useState(item.spec.standards.join(', '));
  const [certifications, setCertifications] = useState(item.spec.certifications.join(', '));
  const list = (text: string) => [...new Set(text.split(',').map((v) => v.trim().slice(0, 100)).filter(Boolean))].slice(0, 20);
  const set = (key: keyof Spec, raw: string, numeric?: boolean) => {
    const value = raw.trim() === '' ? null : numeric ? Number(raw) : raw;
    setDraft((d) => ({ ...d, [key]: value as never }));
  };
  // Mirror the server contract: positive sizes up to 100,000 and a whole gauge from 1 to 40.
  const invalid = SPEC_FIELDS.some(({ key, numeric }) => {
    const v = draft[key];
    if (!numeric || v === null) return false;
    const n = v as number;
    return !Number.isFinite(n) || n <= 0 || n > 100_000 || (key === 'gauge' && (!Number.isInteger(n) || n > 40));
  });
  return (
    <Modal
      title={`Correct line specifications`}
      onClose={onClose}
      wide
      footer={<>
        <span className="muted">Blank fields stay unknown. Saving re-runs matching, pricing and compliance.</span>
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={!!busy || invalid} onClick={() => onSave({ ...draft, standards: list(standards), certifications: list(certifications) })}>{busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Save & reprocess</button>
      </>}
    >
      <blockquote className="original compact"><span>Customer wrote</span>{item.original}</blockquote>
      <div className="form-grid">
        {SPEC_FIELDS.map(({ key, label, numeric }) => (
          <label key={key}>{label}
            {key === 'dimensionUnit'
              ? <select value={draft.dimensionUnit ?? ''} onChange={(e) => setDraft((d) => ({ ...d, dimensionUnit: (e.target.value || null) as Spec['dimensionUnit'] }))}><option value="">Unknown</option><option value="in">inches</option><option value="mm">mm</option><option value="ft">feet</option></select>
              : <input type={numeric ? 'number' : 'text'} step="any" min={numeric ? 0 : undefined} maxLength={numeric ? undefined : 1000} value={draft[key] === null ? '' : String(draft[key])} onChange={(e) => set(key, e.target.value, numeric)} placeholder="Unknown" />}
          </label>
        ))}
        <label>Standards<input value={standards} maxLength={2000} onChange={(e) => setStandards(e.target.value)} placeholder="e.g. ASTM A240, ASTM A480" /></label>
        <label>Certifications<input value={certifications} maxLength={2000} onChange={(e) => setCertifications(e.target.value)} placeholder="e.g. DFARS" /></label>
        <label>MTR required
          <select value={draft.mtr === null ? '' : draft.mtr ? 'yes' : 'no'} onChange={(e) => setDraft((d) => ({ ...d, mtr: e.target.value === '' ? null : e.target.value === 'yes' }))}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select>
        </label>
      </div>
    </Modal>
  );
}
