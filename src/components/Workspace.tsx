'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CircleHelp, FileText, Inbox, Loader2, Mail, Pencil, ShieldCheck } from 'lucide-react';
import type { Quote, QuoteItem, Spec } from '@/lib/shared/schema';
import { bareQuestion, isBlocked, itemSize, itemTitle, money, pct, qtyLabel } from '@/lib/client/format';
import { Badge, CopyButton, Empty, Message, Modal, PageHeader } from './ui';

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
  const [emailOpen, setEmailOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [margin, setMargin] = useState('');
  useEffect(() => { if (quote) setMargin(String(quote.targetMargin * 100)); }, [quote?.id, quote?.targetMargin]);
  if (!quote) return <Empty icon={<Inbox size={22} />} title="No RFQ to review" action={<button className="button primary" onClick={onNew}>New RFQ<ArrowRight size={14} /></button>}>Upload or paste a request to get started.</Empty>;

  const included = quote.items.filter(i => i.included);
  const issues = included.filter(isBlocked);
  const visible = issuesOnly && issues.length ? issues : quote.items;
  const item = visible.find(i => i.id === selected) ?? visible[0]!;
  const ready = included.length - issues.length;
  const marginNum = Number(margin);
  const marginValid = margin.trim() !== '' && Number.isFinite(marginNum) && marginNum >= 0 && marginNum <= 80;
  return <>
    <PageHeader title="Review RFQ" subtitle={quote.customer || 'Check the items below.'} actions={
      issues.length ? <button className="button primary" disabled={!!busy} onClick={() => setEmailOpen(true)}><Mail size={14} />Ask buyer</button>
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
        <div className="line-filter" aria-label="Item filter"><button className={!issuesOnly ? 'active' : ''} onClick={() => setIssuesOnly(false)}>All items ({quote.items.length})</button>{issues.length > 0 && <button className={issuesOnly ? 'active' : ''} onClick={() => setIssuesOnly(true)}>Needs attention ({issues.length})</button>}</div>
        <button className="button secondary small" onClick={() => setSourceOpen(true)}><FileText size={13} />View RFQ</button>
      </div>
      <div className="table-wrap"><table className="lines"><thead><tr><th>Item</th><th>Quantity</th><th>Status</th><th className="num">Amount</th></tr></thead><tbody>
        {visible.map(i => <tr key={i.id} className={`${i.id === item.id ? 'selected' : ''} ${i.included ? '' : 'excluded'}`} onClick={() => onSelect(i.id)}>
          <td><button className="row-button" onClick={e => { e.stopPropagation(); onSelect(i.id); }} aria-pressed={i.id === item.id}><strong>{quote.items.indexOf(i) + 1}. {itemTitle(i.normalized)}</strong><small>{itemSize(i.spec)}</small></button></td>
          <td>{qtyLabel(i)}</td><td><Badge status={i.included ? i.status : 'Excluded'} /></td><td className="num">{i.included && i.pricing ? money(i.pricing.lineTotal) : '—'}</td>
        </tr>)}
      </tbody></table></div>
    </section>
    <LineDetail key={item.id} quote={quote} item={item} busy={busy} onChangeLine={onChangeLine} onAsk={() => setEmailOpen(true)} />
    <div className="review-footer">
      <details className="pricing-settings"><summary>Pricing settings</summary><div className="margin-setting"><label>Target gross margin<span className="input-suffix small"><input aria-label="Target gross margin" disabled={!!busy} type="number" min={0} max={80} step={0.5} value={margin} onChange={e => setMargin(e.target.value)} /><span>%</span></span></label><button className="button secondary small" disabled={!!busy || !marginValid || Math.abs(marginNum / 100 - quote.targetMargin) < 1e-9} onClick={() => onChangeLine(item.id, { targetMargin: marginNum / 100 }, 'Repricing')}>Reprice</button></div></details>
      {issues.length > 0 && <button className="button secondary" disabled={!!busy} onClick={onNext}>Preview quote<ArrowRight size={14} /></button>}
    </div>
    <p className="data-note">Catalog facts and benchmarks are sourced. Cost, stock and lead time are synthetic.</p>
    {sourceOpen && <Modal title="Original RFQ" onClose={() => setSourceOpen(false)} wide><SourcePanel quote={quote} item={item} /></Modal>}
    {emailOpen && <BuyerEmail quote={quote} items={issues} onClose={() => setEmailOpen(false)} />}
  </>;
}

function SourcePanel({ quote, item }: { quote: Quote; item: QuoteItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => quote.originalText.split('\n'), [quote.originalText]);
  const pieces = useMemo(() => item.original.split(' / ').map(p => p.trim().toLowerCase()).filter(p => p.length > 2), [item.original]);
  const hit = (l: string) => { const t = l.trim().toLowerCase(); return !!t && pieces.some(p => t === p || t.includes(p) || (p.includes(t) && t.length > 12)); };
  useEffect(() => { ref.current?.querySelector('.hl')?.scrollIntoView?.({ block: 'center' }); }, [item.id]);
  return <section className="source"><p className="muted">{item.source}</p><div className="source-text" ref={ref}>{lines.map((l, i) => /^--- .* ---$/.test(l) ? <div key={i} className="source-doc">{l.slice(4, -4)}</div> : <div key={i} className={hit(l) ? 'hl' : ''}>{l || ' '}</div>)}</div></section>;
}

function LineDetail({ quote, item, busy, onChangeLine, onAsk }: { quote: Quote; item: QuoteItem; busy: string | null; onChangeLine: (id: string, input: LineChange, label?: string) => Promise<boolean>; onAsk: () => void }) {
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const asks = [...new Set([...item.conflicts, ...item.questions])];
  const blockers = item.blockers.filter(b => !asks.includes(b));
  const requirements = item.compliance.filter(c => c.status !== 'not_requested');
  const price = item.pricing;
  return <section className="card detail">
    <div className="detail-head"><div><span className="eyebrow">Item {quote.items.indexOf(item) + 1}</span><h2>{itemTitle(item.normalized)}</h2><p className="muted">{itemSize(item.spec)} · {qtyLabel(item)}</p></div><div className="detail-actions"><button className="button secondary small" disabled={!!busy} onClick={() => setEditing(true)}><Pencil size={13} />Edit specs</button><label className="toggle"><input type="checkbox" checked={item.included} disabled={!!busy} onChange={e => onChangeLine(item.id, { included: e.target.checked }, e.target.checked ? 'Including line' : 'Excluding line')} />Include</label></div></div>
    {!item.included && <p className="excluded-note">Excluded from the quote. Include this item to resolve its requirements.</p>}
    {asks.length > 0 && <div className="ask"><div className="ask-head"><CircleHelp size={15} /><strong>Buyer confirmation needed</strong></div><ul>{asks.map((question, i) => <li key={i}>{bareQuestion(question)}</li>)}</ul><form onSubmit={async e => { e.preventDefault(); if (answer.trim() && !busy && await onChangeLine(item.id, { response: answer.trim() }, 'Applying answer')) setAnswer(''); }}><input aria-label="Buyer's answer" disabled={!!busy} value={answer} maxLength={8000} onChange={e => setAnswer(e.target.value)} placeholder="Enter the buyer’s answer" /><button className="button primary small" disabled={!answer.trim() || !!busy}>{busy === 'Applying answer' ? <Loader2 size={13} className="spin" /> : <Check size={13} />}Apply answer</button></form></div>}
    {blockers.length > 0 && <div className="blockers"><AlertTriangle size={15} /><ul>{blockers.map((b, i) => <li key={i}>{bareQuestion(b)}</li>)}</ul></div>}
    <div className="line-overview"><div><span>Catalog match</span><strong>{item.matchedSku ?? (asks.length ? 'Awaiting confirmation' : 'No exact match')}</strong>{item.leadTime && <small>Lead time: {item.leadTime}</small>}</div><div><span>Price per piece</span><strong>{price ? money(price.unitPrice) : 'Pending'}</strong><small>{price && price.competitive !== null && price.benchmark !== null ? `${money(Math.abs(price.benchmark - price.unitPrice))} ${price.competitive ? 'at or below' : 'above'} benchmark` : 'Benchmark comparison unconfirmed'}</small></div><div><span>Requirements</span><strong>{requirements.some(c => c.status === 'missing' || c.status === 'pending') ? 'Evidence needed' : requirements.length ? 'Verified' : 'None requested'}</strong><small>{requirements.map(c => c.requirement).join(' · ') || 'MTR and origin not requested'}</small></div></div>
    <div className="line-disclosures">
      <details><summary>Specifications & catalog match</summary><blockquote className="original"><span>Original request</span>{item.original}<small>{item.source}</small></blockquote><dl className="spec-grid">{SPEC_FIELDS.filter(({ key }) => item.spec[key] !== null || ['material', 'grade', 'form', 'quantity'].includes(key)).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd className={item.spec[key] === null ? 'unknown' : ''}>{item.spec[key] === null ? 'Not stated' : String(item.spec[key])}{item.provenance[key] && <small className={`prov ${item.provenance[key]}`}>{PROVENANCE[item.provenance[key]!]}</small>}</dd></div>)}{item.spec.standards.length > 0 && <div><dt>Standards</dt><dd>{item.spec.standards.join(', ')}</dd></div>}</dl><ul className="explain">{item.matchExplanation.map((explanation, i) => <li key={i}>{explanation}</li>)}</ul>{item.alternatives.length > 0 && <><h3 className="sub">Alternatives — buyer approval required</h3><ul className="alts">{item.alternatives.map(a => <li key={a.sku}><code>{a.sku}</code>{a.reason}</li>)}</ul></>}</details>
      <details><summary>Price & benchmark</summary>{price ? <><div className="price-grid"><div><span>Our price / {price.unit}</span><strong>{money(price.unitPrice)}</strong></div><div><span>Benchmark / {price.unit}</span><strong>{price.benchmark === null ? 'Unavailable' : money(price.benchmark)}</strong></div><div><span>Gross margin</span><strong>{pct(price.margin)}</strong></div><div><span>Item total</span><strong>{money(price.lineTotal)}</strong></div></div><p className="explain-text">{price.explanation}</p><p className="muted small-note">{price.benchmarkStatus}{price.benchmarkSource && ` · ${price.benchmarkSource}`}{price.benchmarkDate && ` · ${price.benchmarkDate}`}.</p></> : <p className="muted">An exact match and a quantity in pieces are needed before pricing.</p>}</details>
      <details><summary>Compliance evidence{requirements.some(c => c.status === 'missing' || c.status === 'pending') ? ' — missing or pending' : ''}</summary><ul className="compliance">{item.compliance.map((c, i) => <li key={i}><ShieldCheck size={15} /><div><strong>{c.requirement}</strong><p>{c.evidence}</p></div><Badge status={c.status} /></li>)}</ul></details>
    </div>
    {item.included && isBlocked(item) && <p className="line-help"><button className="link" onClick={onAsk}>Ask the buyer</button> or exclude this item to quote the rest.</p>}
    {editing && <CorrectionForm item={item} busy={busy} onClose={() => setEditing(false)} onSave={async spec => { if (await onChangeLine(item.id, { corrections: spec }, 'Reprocessing line')) setEditing(false); }} />}
  </section>;
}

function CorrectionForm({ item, busy, onClose, onSave }: { item: QuoteItem; busy: string | null; onClose: () => void; onSave: (spec: Spec) => void }) {
  const [draft, setDraft] = useState<Spec>(() => structuredClone(item.spec));
  const set = (key: keyof Spec, raw: string, numeric?: boolean) => {
    const value = raw.trim() === '' ? null : numeric ? Number(raw) : raw;
    setDraft({ ...draft, [key]: value as never });
  };
  const invalid = SPEC_FIELDS.some(({ key, numeric }) => numeric && draft[key] !== null && (!Number.isFinite(draft[key] as number) || (draft[key] as number) <= 0));
  return (
    <Modal
      title={`Correct line specifications`}
      onClose={onClose}
      wide
      footer={<>
        <span className="muted">Blank fields stay unknown. Saving re-runs matching, pricing and compliance.</span>
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={!!busy || invalid} onClick={() => onSave(draft)}>{busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Save & reprocess</button>
      </>}
    >
      <blockquote className="original compact"><span>Customer wrote</span>{item.original}</blockquote>
      <div className="form-grid">
        {SPEC_FIELDS.map(({ key, label, numeric }) => (
          <label key={key}>{label}
            {key === 'dimensionUnit'
              ? <select value={draft.dimensionUnit ?? ''} onChange={(e) => setDraft({ ...draft, dimensionUnit: (e.target.value || null) as Spec['dimensionUnit'] })}><option value="">Unknown</option><option value="in">inches</option><option value="mm">mm</option><option value="ft">feet</option></select>
              : <input type={numeric ? 'number' : 'text'} step="any" min={numeric ? 0 : undefined} value={draft[key] === null ? '' : String(draft[key])} onChange={(e) => set(key, e.target.value, numeric)} placeholder="Unknown" />}
          </label>
        ))}
        <label>Standards<input value={draft.standards.join(', ')} onChange={(e) => setDraft({ ...draft, standards: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="e.g. ASTM A240" /></label>
        <label>Certifications<input value={draft.certifications.join(', ')} onChange={(e) => setDraft({ ...draft, certifications: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="e.g. DFARS" /></label>
        <label>MTR required
          <select value={draft.mtr === null ? '' : draft.mtr ? 'yes' : 'no'} onChange={(e) => setDraft({ ...draft, mtr: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select>
        </label>
      </div>
    </Modal>
  );
}

/** Every unresolved included item is covered in the buyer email. */
function BuyerEmail({ quote, items, onClose }: { quote: Quote; items: QuoteItem[]; onClose: () => void }) {
  const subject = `RFQ ${quote.rfqReference || quote.id} — details to confirm`;
  const body = [`Hi${quote.customer ? ` ${quote.customer} team` : ''},`, '', 'Please confirm the following before we finalize your quote:', '',
    ...items.flatMap(item => [`Item ${quote.items.indexOf(item) + 1}: ${item.original}`, ...[...new Set([...item.conflicts, ...item.questions, ...item.blockers])].map(q => `  • ${bareQuestion(q)}`), ...item.compliance.filter(c => c.status === 'pending' && !item.blockers.some(b => b.includes(c.requirement))).map(c => `  • ${c.requirement}: evidence is still pending.`), '']),
    'Please reply with the confirmed specifications or let us know which items to exclude.', '', 'Thank you,', 'RudCo'].join('\n');
  return <Modal title="Ask buyer" onClose={onClose} wide footer={<><CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy email" /><a className="button primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} />Open email</a></>}><p className="muted small-note">Review and send this in your email app.</p><div className="email-preview"><div className="email-subject"><span>Subject</span>{subject}</div><pre>{body}</pre></div></Modal>;
}
