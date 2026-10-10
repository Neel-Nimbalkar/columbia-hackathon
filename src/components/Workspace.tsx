'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleHelp, FileText, Inbox, Loader2, Mail, Pencil, ShieldCheck } from 'lucide-react';
import type { Quote, QuoteItem, Spec } from '@/lib/shared/schema';
import { bareQuestion, isBlocked, itemSize, itemTitle, money, pct, qtyLabel } from '@/lib/client/format';
import { Badge, CopyButton, Empty, Message, Modal, PageHeader, Segmented } from './ui';

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
  quote: Quote | null;
  selected: string | null;
  onSelect: (id: string) => void;
  busy: string | null;
  onChangeLine: (itemId: string, input: LineChange, label?: string) => Promise<boolean>;
  onNext: () => void;
  onNew: () => void;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [margin, setMargin] = useState('');
  useEffect(() => { if (quote) setMargin(String(Math.round(quote.targetMargin * 1000) / 10)); }, [quote?.id, quote?.targetMargin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote) return <Empty icon={<Inbox size={22} />} title="No quote open" action={<button className="button primary" onClick={onNew}>New RFQ<ArrowRight size={14} /></button>}>Process an RFQ or reopen one from Pipeline.</Empty>;

  const item = quote.items.find((i) => i.id === selected) ?? quote.items[0]!;
  const included = quote.items.filter((i) => i.included);
  const ready = included.filter((i) => !isBlocked(i)).length;
  const toReview = included.length - ready;
  const askable = quote.items.filter((i) => i.included && (i.questions.length || i.conflicts.length || i.status === 'No Match' || i.compliance.some((c) => c.status === 'missing')));
  const marginNum = Number(margin);
  const marginValid = margin.trim() !== '' && Number.isFinite(marginNum) && marginNum >= 0 && marginNum <= 80;

  return (
    <>
      <PageHeader
        title={quote.customer || 'Untitled RFQ'}
        subtitle={<><code>{quote.id}</code>{quote.rfqReference && <> · Customer ref <strong>{quote.rfqReference}</strong></>} · {quote.provider.extraction.split(';')[0]}</>}
        actions={<>
          {askable.length > 0 && <button className="button secondary" onClick={() => setEmailOpen(true)}><Mail size={14} />Draft buyer email</button>}
          <button className="button primary" onClick={onNext}>Review quote<ArrowRight size={14} /></button>
        </>}
      />

      <div className="stat-strip">
        <div><span>Lines</span><strong>{quote.items.length}</strong>{included.length !== quote.items.length && <small>{quote.items.length - included.length} excluded</small>}</div>
        <div><span>Ready</span><strong className="text-green">{ready}</strong></div>
        <div><span>Needs review</span><strong className={toReview ? 'text-amber' : ''}>{toReview}</strong></div>
        <div><span>Quote value</span><strong>{money(quote.total)}</strong></div>
        <div className="margin-control">
          <span>Target margin</span>
          <div>
            <span className="input-suffix small"><input aria-label="Target gross margin" type="number" min={0} max={80} step={0.5} value={margin} onChange={(e) => setMargin(e.target.value)} /><span>%</span></span>
            <button className="button secondary small" disabled={!!busy || !marginValid || Math.abs(marginNum / 100 - quote.targetMargin) < 1e-9} onClick={() => onChangeLine(item.id, { targetMargin: marginNum / 100 }, 'Repricing')}>Reprice</button>
          </div>
        </div>
      </div>

      {quote.warnings.length > 0 && (
        <Message tone="warning">
          <ul className="plain-list">{quote.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Message>
      )}

      <div className="workspace">
        <SourcePanel quote={quote} item={item} />
        <div className="workspace-main">
          <section className="card">
            <div className="table-wrap">
              <table className="lines">
                <thead><tr><th>#</th><th>Requested item</th><th>Qty</th><th>Status</th><th className="num">Line total</th></tr></thead>
                <tbody>
                  {quote.items.map((i, n) => (
                    <tr key={i.id} className={`${i.id === item.id ? 'selected' : ''} ${i.included ? '' : 'excluded'}`} onClick={() => onSelect(i.id)}>
                      <td className="muted">{n + 1}</td>
                      <td>
                        <button className="row-button" onClick={(e) => { e.stopPropagation(); onSelect(i.id); }}>
                          <strong>{itemTitle(i.normalized)}</strong>
                          <small>{itemSize(i.spec)}{i.matchedSku ? ` · ${i.matchedSku}` : ''}</small>
                        </button>
                      </td>
                      <td>{qtyLabel(i)}</td>
                      <td>{i.included ? <Badge status={i.status} /> : <Badge status="Excluded" />}</td>
                      <td className="num">{i.pricing && i.included ? money(i.pricing.lineTotal) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <LineDetail key={item.id} quote={quote} item={item} busy={busy} onChangeLine={onChangeLine} />
        </div>
      </div>
      {emailOpen && <BuyerEmail quote={quote} items={askable} onClose={() => setEmailOpen(false)} />}
    </>
  );
}

/** Original documents with the selected line's source text highlighted. */
function SourcePanel({ quote, item }: { quote: Quote; item: QuoteItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => quote.originalText.split('\n'), [quote.originalText]);
  const pieces = useMemo(() => item.original.split(' / ').map((p) => p.trim().toLowerCase()).filter((p) => p.length > 2), [item.original]);
  const hit = (l: string) => {
    const t = l.trim().toLowerCase();
    return !!t && pieces.some((p) => t === p || t.includes(p) || (p.includes(t) && t.length > 12));
  };
  useEffect(() => {
    ref.current?.querySelector('.hl')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [item.id]);
  return (
    <section className="card source">
      <div className="card-head"><h2><FileText size={14} />Original RFQ</h2><span className="muted">{item.source}</span></div>
      <div className="source-text" ref={ref}>
        {lines.map((l, i) => /^--- .* ---$/.test(l)
          ? <div key={i} className="source-doc">{l.slice(4, -4)}</div>
          : <div key={i} className={hit(l) ? 'hl' : ''}>{l || ' '}</div>)}
      </div>
    </section>
  );
}

function LineDetail({ quote, item, busy, onChangeLine }: { quote: Quote; item: QuoteItem; busy: string | null; onChangeLine: (itemId: string, input: LineChange, label?: string) => Promise<boolean> }) {
  const [tab, setTab] = useState<'match' | 'pricing' | 'compliance'>(item.questions.length || item.conflicts.length ? 'match' : item.pricing ? 'pricing' : 'match');
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const lineNo = quote.items.findIndex((i) => i.id === item.id) + 1;
  const asks = [...item.conflicts, ...item.questions];

  return (
    <section className="card detail">
      <div className="detail-head">
        <div>
          <span className="eyebrow">Line {lineNo}</span>
          <h2>{itemTitle(item.normalized)}</h2>
          <p className="muted">{itemSize(item.spec)} · {qtyLabel(item)}</p>
        </div>
        <div className="detail-actions">
          <label className="toggle">
            <input type="checkbox" checked={item.included} disabled={!!busy} onChange={(e) => onChangeLine(item.id, { included: e.target.checked }, e.target.checked ? 'Including line' : 'Excluding line')} />
            Include in quote
          </label>
          <button className="button secondary small" disabled={!!busy} onClick={() => setEditing(true)}><Pencil size={13} />Correct specs</button>
        </div>
      </div>

      <blockquote className="original"><span>Customer wrote</span>{item.original}<small>{item.source}</small></blockquote>

      {asks.length > 0 && (
        <div className="ask">
          <div className="ask-head"><CircleHelp size={15} /><strong>Ask the buyer</strong></div>
          <ul>{asks.map((q, i) => <li key={i}>{bareQuestion(q)}</li>)}</ul>
          <form onSubmit={async (e) => { e.preventDefault(); if (await onChangeLine(item.id, { response: answer.trim() }, 'Applying answer')) setAnswer(''); }}>
            <input aria-label="Buyer's answer" value={answer} maxLength={8000} onChange={(e) => setAnswer(e.target.value)} placeholder='Type the buyer’s answer, e.g. "T6" or "inches"' />
            <button className="button primary small" disabled={!answer.trim() || !!busy}>{busy === 'Applying answer' ? <Loader2 size={13} className="spin" /> : <Check size={13} />}Apply answer</button>
          </form>
        </div>
      )}
      {item.blockers.length > 0 && (
        <div className="blockers"><AlertTriangle size={15} /><ul>{item.blockers.map((b, i) => <li key={i}>{bareQuestion(b)}</li>)}</ul></div>
      )}

      <Segmented label="Line details" value={tab} onChange={setTab} options={[{ value: 'match', label: 'Spec & match' }, { value: 'pricing', label: 'Pricing' }, { value: 'compliance', label: `Compliance${item.compliance.some((c) => c.status === 'missing' || c.status === 'pending') ? ' •' : ''}` }]} />

      {tab === 'match' && (
        <div className="tab-body">
          <dl className="spec-grid">
            {SPEC_FIELDS.filter(({ key }) => item.spec[key] !== null || ['material', 'grade', 'form', 'quantity'].includes(key) || (key === 'temper' && item.normalized.material === 'aluminum')).map(({ key, label }) => {
              const v = item.spec[key];
              const shown = Array.isArray(v) ? v.join(', ') : v === null ? null : String(v);
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd className={shown === null ? 'unknown' : ''}>{shown ?? 'Not stated'}{item.provenance[key] && shown !== null && <small className={`prov ${item.provenance[key]}`}>{PROVENANCE[item.provenance[key]!]}</small>}</dd>
                </div>
              );
            })}
            {item.spec.standards.length > 0 && <div><dt>Standards</dt><dd>{item.spec.standards.join(', ')}</dd></div>}
            {(item.spec.certifications.length > 0 || item.spec.mtr) && <div><dt>Documentation</dt><dd>{[item.spec.mtr ? 'MTR' : null, ...item.spec.certifications].filter(Boolean).join(', ')}</dd></div>}
          </dl>
          <h3 className="sub">Catalog match {item.matchedSku && <code>{item.matchedSku}</code>}</h3>
          {item.matchExplanation.length ? <ul className="explain">{item.matchExplanation.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="muted">Matching runs once the open questions are answered.</p>}
          {item.alternatives.length > 0 && (
            <>
              <h3 className="sub">Alternatives for review <span className="muted">— never substituted automatically</span></h3>
              <ul className="alts">{item.alternatives.map((a) => <li key={a.sku}><code>{a.sku}</code>{a.reason}</li>)}</ul>
            </>
          )}
          {item.classification && <p className="muted small-note">Jev classification: {item.classification.material ?? 'unknown'} · {item.classification.form ?? 'unknown'} · {item.classification.risk} ({pct(item.classification.confidence, 0)} confidence)</p>}
          {item.leadTime && <p className="muted small-note">Lead time {item.leadTime}</p>}
        </div>
      )}

      {tab === 'pricing' && (
        <div className="tab-body">
          {item.pricing ? <Pricing item={item} targetMargin={quote.targetMargin} /> : <Empty icon={<CircleHelp size={20} />} title="No price yet">A price is calculated once the line has an exact catalog match and a quantity in pieces.</Empty>}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="tab-body">
          <ul className="compliance">
            {item.compliance.map((c, i) => (
              <li key={i}><ShieldCheck size={15} /><div><strong>{c.requirement}</strong><p>{c.evidence}</p></div><Badge status={c.status} /></li>
            ))}
          </ul>
          <p className="muted small-note">A supplier offering certificates does not mean a lot-specific MTR is in hand; it stays pending until the material ships.</p>
        </div>
      )}

      {editing && <CorrectionForm item={item} busy={busy} onClose={() => setEditing(false)} onSave={async (spec) => { if (await onChangeLine(item.id, { corrections: spec }, 'Reprocessing line')) setEditing(false); }} />}
    </section>
  );
}

/** Price breakdown plus the room between our margin floor and the market benchmark. */
function Pricing({ item, targetMargin }: { item: QuoteItem; targetMargin: number }) {
  const p = item.pricing!;
  const comparable = p.benchmark !== null && !p.benchmarkStatus.startsWith('Incomparable');
  const ceiling = comparable ? 1 - p.cost / p.benchmark! : null;
  const span = Math.max(p.unitPrice, p.benchmark ?? 0) * 1.08 - p.cost * 0.92;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - p.cost * 0.92) / span) * 100))}%`;
  return (
    <>
      <div className="price-grid">
        <div><span>Cost / {p.unit}</span><strong>{money(p.cost)}</strong></div>
        <div><span>Unit price</span><strong>{money(p.unitPrice)}</strong></div>
        <div><span>Gross margin</span><strong>{pct(p.margin)}</strong></div>
        <div><span>Line total</span><strong>{money(p.lineTotal)}</strong></div>
      </div>
      <p className="explain-text">{p.explanation}</p>
      <div className="room">
        <div className="room-head">
          <h3 className="sub">Negotiation room</h3>
          {comparable ? (
            p.competitive
              ? <span className="text-green">{money(p.benchmark! - p.unitPrice)}/{p.unit} below benchmark — up to {pct(ceiling!)} margin still matches it</span>
              : <span className="text-amber">{money(p.unitPrice - p.benchmark!)}/{p.unit} above benchmark — {ceiling! > 0 ? `${pct(ceiling!)} margin would match it` : 'cost is above the benchmark'}</span>
          ) : <span className="muted">No comparable benchmark</span>}
        </div>
        {comparable && (
          <div className="room-bar" aria-hidden="true">
            <span className="room-fill" style={{ left: at(p.unitPrice), width: `calc(${at(p.benchmark!)} - ${at(p.unitPrice)})` }} />
            <span className="mark cost" style={{ left: at(p.cost) }}><i />Cost {money(p.cost)}</span>
            <span className="mark price" style={{ left: at(p.unitPrice) }}><i />Ours {money(p.unitPrice)}</span>
            <span className="mark bench" style={{ left: at(p.benchmark!) }}><i />Benchmark {money(p.benchmark!)}</span>
          </div>
        )}
        <p className="muted small-note">{p.benchmarkStatus}{p.benchmarkSource ? ` · ${p.benchmarkSource}` : ''}{p.benchmarkDate ? ` · ${p.benchmarkDate}` : ''}. Target margin {pct(targetMargin)}.</p>
      </div>
    </>
  );
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

/** Ready-to-send email asking every open question, grouped by line. */
function BuyerEmail({ quote, items, onClose }: { quote: Quote; items: QuoteItem[]; onClose: () => void }) {
  const lineNo = (i: QuoteItem) => quote.items.indexOf(i) + 1;
  const describe = (i: QuoteItem) => `Line ${lineNo(i)} — "${i.original.replace(/\s*\|\s*/g, ' ').slice(0, 140)}"`;
  const questions = items.filter((i) => i.questions.length || i.conflicts.length);
  const cannot = items.filter((i) => !i.questions.length && !i.conflicts.length && (i.status === 'No Match' || i.compliance.some((c) => c.status === 'missing')));
  const ref = quote.rfqReference ? `RFQ ${quote.rfqReference}` : `your RFQ (${quote.id})`;
  const body = [
    `Hi${quote.customer ? ` ${quote.customer} team` : ''},`,
    '',
    `Thanks for ${ref}. Before we can finalize pricing we need a few details:`,
    '',
    ...questions.flatMap((i) => [describe(i), ...[...i.conflicts, ...i.questions].map((q) => `  • ${bareQuestion(q)}`), '']),
    ...(cannot.length ? ['We can’t confirm these as requested:', '', ...cannot.flatMap((i) => [
      describe(i),
      ...(i.status === 'No Match' ? [`  • No exact match in stock.${i.alternatives.length ? ` Closest options: ${i.alternatives.map((a) => a.reason.split(' — ')[0]).slice(0, 2).join('; ')}. Would one of these work?` : ' Is there flexibility on grade or size?'}`] : []),
      ...i.compliance.filter((c) => c.status === 'missing').map((c) => `  • ${c.requirement}: we can’t document this for the material in stock. Is it mandatory?`),
      '',
    ])] : []),
    'Everything else is ready to quote. Reply with the answers and we’ll send the full quotation the same day.',
    '',
    'Best regards,',
  ].join('\n');
  const subject = `Re: ${quote.rfqReference ? `RFQ ${quote.rfqReference}` : 'your RFQ'} — questions before we quote`;
  return (
    <Modal title="Draft buyer email" onClose={onClose} wide footer={<>
      <span className="muted">{questions.length} line{questions.length === 1 ? '' : 's'} with questions · {cannot.length} we can’t supply as asked</span>
      <CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy email" />
      <a className="button primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} />Open in mail app</a>
    </>}>
      <div className="email-preview">
        <div className="email-subject"><span>Subject</span>{subject}</div>
        <pre>{body}</pre>
      </div>
      <p className="muted small-note">Nothing is sent from RudCo — copy it or open it in your mail app.</p>
    </Modal>
  );
}

