'use client';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, Inbox, Loader2, Mail } from 'lucide-react';
import type { Quote } from '@/lib/shared/schema';
import { bareQuestion, isBlocked, itemSize, itemTitle, money, pct, quoteMargin } from '@/lib/client/format';
import { Badge, CopyButton, Empty, Modal, PageHeader } from './ui';

export function FinalQuote({ quote, busy, onEdit, onExport, onBack, onNew }: {
  quote: Quote | null;
  busy: string | null;
  onEdit: (q: Quote) => void;
  onExport: (q: Quote) => void;
  onBack: (itemId?: string) => void;
  onNew: () => void;
}) {
  const [coverOpen, setCoverOpen] = useState(false);
  if (!quote) return <Empty icon={<Inbox size={22} />} title="No quote open" action={<button className="button primary" onClick={onNew}>New RFQ<ArrowRight size={14} /></button>}>Process an RFQ first.</Empty>;

  const included = quote.items.filter((i) => i.included);
  const excluded = quote.items.filter((i) => !i.included);
  const blocked = included.filter(isBlocked);
  const headerIssues = [
    !quote.customer.trim() ? 'Add the customer name.' : null,
    !quote.date || !quote.expires || quote.expires < quote.date ? 'Set a valid issue date and an expiry on or after it.' : null,
  ].filter(Boolean) as string[];
  const canExport = included.length > 0 && blocked.length === 0 && quote.ready && headerIssues.length === 0;
  const margin = quoteMargin(quote);

  return (
    <>
      <PageHeader
        title="Final quote"
        subtitle={<><code>{quote.id}</code> · Review what the customer will receive. Export is re-validated on the server.</>}
        actions={<button className="button secondary" onClick={() => onBack()}><ArrowLeft size={14} />Workspace</button>}
      />
      <div className="final">
        <article className="paper" aria-label="Quotation preview">
          <header className="paper-head">
            <div className="paper-brand">rudco<span>.</span><small>Industrial metals supply</small></div>
            <div className="paper-id"><h2>Quotation</h2><code>{quote.id}</code></div>
          </header>
          <div className="paper-meta">
            <label>Prepared for<input value={quote.customer} maxLength={200} onChange={(e) => onEdit({ ...quote, customer: e.target.value })} placeholder="Customer name" /></label>
            <label>Your reference<input value={quote.rfqReference ?? ''} maxLength={200} onChange={(e) => onEdit({ ...quote, rfqReference: e.target.value || null })} placeholder="—" /></label>
            <label>Issued<input type="date" value={quote.date} onChange={(e) => onEdit({ ...quote, date: e.target.value })} /></label>
            <label>Valid through<input type="date" min={quote.date} value={quote.expires} onChange={(e) => onEdit({ ...quote, expires: e.target.value })} /></label>
          </div>
          <div className="table-wrap">
            <table className="paper-table">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {included.map((i) => (
                  <tr key={i.id} className={isBlocked(i) ? 'blocked' : ''}>
                    <td>
                      <strong>{itemTitle(i.normalized)}</strong>
                      <small>{itemSize(i.normalized)}{i.normalized.finish ? ` · ${i.normalized.finish}` : ''} · {i.matchedSku ?? 'no SKU'} · {i.leadTime ?? 'lead time TBC'}</small>
                      {i.compliance.filter((c) => c.status !== 'not_requested').map((c, k) => <small key={k} className="paper-comp">{c.requirement}: {c.status}</small>)}
                    </td>
                    <td className="num">{i.spec.quantity ?? '—'} {i.pricing?.unit ?? ''}</td>
                    <td className="num">{i.pricing ? money(i.pricing.unitPrice) : 'Pending'}</td>
                    <td className="num">{i.pricing ? money(i.pricing.lineTotal) : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="paper-total"><span>Total (USD)<small>Excludes freight and applicable taxes</small></span><strong>{money(quote.total)}</strong></div>
          {excluded.length > 0 && (
            <div className="paper-section"><h3>Not quoted</h3>{excluded.map((i) => <p key={i.id}>{i.original.replace(/\s*\|\s*/g, ' ')}</p>)}</div>
          )}
          <div className="paper-section"><h3>Terms</h3><p>Prices in USD, excluding freight and taxes. Payment and delivery subject to agreement. No substitution of material, grade, temper or certification is authorized by this quotation.</p></div>
          <p className="paper-disclosure">{quote.disclosure}</p>
        </article>

        <aside className="final-side">
          <section className={`card export ${canExport ? 'ok' : 'blocked'}`}>
            <div className="export-state">
              {canExport ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <strong>{canExport ? 'Ready to send' : `${blocked.length + headerIssues.length} item${blocked.length + headerIssues.length === 1 ? '' : 's'} to resolve`}</strong>
            </div>
            <dl className="export-facts">
              <div><dt>Lines quoted</dt><dd>{included.length}{excluded.length ? ` (+${excluded.length} excluded)` : ''}</dd></div>
              <div><dt>Total</dt><dd>{money(quote.total)}</dd></div>
              <div><dt>Gross margin</dt><dd>{margin === null ? '—' : pct(margin)}</dd></div>
              <div><dt>Valid through</dt><dd>{quote.expires || '—'}</dd></div>
            </dl>
            <button className="button primary block" disabled={!canExport || !!busy} onClick={() => onExport(quote)}>
              {busy === 'Generating PDF' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}Download PDF
            </button>
            <button className="button secondary block" disabled={!canExport} onClick={() => setCoverOpen(true)}><Mail size={14} />Draft cover email</button>
          </section>

          {(headerIssues.length > 0 || blocked.length > 0) && (
            <section className="card issues">
              <h3>Before export</h3>
              {headerIssues.map((h) => <p key={h} className="issue">{h}</p>)}
              {blocked.map((i) => (
                <button key={i.id} className="issue-row" onClick={() => onBack(i.id)}>
                  <Badge status={i.status} />
                  <span>{bareQuestion([...i.conflicts, ...i.questions, ...i.blockers][0] ?? 'Needs review.')}</span>
                  <ArrowRight size={13} />
                </button>
              ))}
              <p className="muted small-note">Resolve each line or untick “Include in quote” to send without it.</p>
            </section>
          )}
        </aside>
      </div>
      {coverOpen && <CoverEmail quote={quote} onClose={() => setCoverOpen(false)} />}
    </>
  );
}

function CoverEmail({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const included = quote.items.filter((i) => i.included);
  const excluded = quote.items.filter((i) => !i.included);
  const subject = `Quotation ${quote.id}${quote.rfqReference ? ` for RFQ ${quote.rfqReference}` : ''}`;
  const body = [
    `Hi${quote.customer ? ` ${quote.customer} team` : ''},`,
    '',
    `Please find attached quotation ${quote.id}${quote.rfqReference ? ` for your RFQ ${quote.rfqReference}` : ''}, valid through ${quote.expires}.`,
    '',
    ...included.map((i, n) => `${n + 1}. ${itemTitle(i.normalized)}, ${itemSize(i.normalized)} — ${i.spec.quantity} ${i.pricing?.unit ?? 'pc'} @ ${money(i.pricing?.unitPrice ?? 0)} = ${money(i.pricing?.lineTotal ?? 0)} (${i.leadTime ?? 'lead time TBC'})`),
    '',
    `Total: ${money(quote.total)} USD, excluding freight and applicable taxes.`,
    ...(excluded.length ? ['', `Not included in this quote: ${excluded.map((i) => `"${i.original.replace(/\s*\|\s*/g, ' ').slice(0, 80)}"`).join('; ')}.`] : []),
    '',
    'Let us know if you have any questions or would like to place the order.',
    '',
    'Best regards,',
  ].join('\n');
  return (
    <Modal title="Cover email" onClose={onClose} wide footer={<>
      <span className="muted">Attach the downloaded PDF.</span>
      <CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy email" />
      <a className="button primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} />Open in mail app</a>
    </>}>
      <div className="email-preview"><div className="email-subject"><span>Subject</span>{subject}</div><pre>{body}</pre></div>
    </Modal>
  );
}
