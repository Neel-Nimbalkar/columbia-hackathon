'use client';
import { isIsoDate } from '@/lib/shared/dates';
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, Inbox, Loader2 } from 'lucide-react';
import { ACCEPTANCE_STATEMENT, QUOTE_TERMS, signatureSchema, type Signature } from '@/lib/shared/acceptance';
import type { Quote } from '@/lib/shared/schema';
import { bareQuestion, isBlocked, itemSize, itemTitle, money } from '@/lib/client/format';
import { Badge, Empty, PageHeader } from './ui';

export function FinalQuote({ quote, busy, onEdit, onExport, onSign, signed, onDownloadSigned, onBack, onNew }: {
  quote: Quote | null;
  busy: string | null;
  onEdit: (q: Quote) => void;
  onExport: (q: Quote) => void;
  onSign: (signature: Signature) => void;
  signed: { id: string; signedAt: string; name: string } | null;
  onDownloadSigned: () => void;
  onBack: (itemId?: string) => void;
  onNew: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  useEffect(() => { setConsent(false); }, [quote, name, email]);
  if (!quote) return <Empty icon={<Inbox size={22} />} title="No quote open" action={<button className="button primary" onClick={onNew}>New RFQ<ArrowRight size={14} /></button>}>Process an RFQ first.</Empty>;

  const included = quote.items.filter((i) => i.included);
  const excluded = quote.items.filter((i) => !i.included);
  const blocked = included.filter(isBlocked);
  const headerIssues = [
    !included.length ? 'Include at least one ready line.' : null,
    !quote.customer.trim() ? 'Add the customer name.' : null,
    !isIsoDate(quote.date) || !isIsoDate(quote.expires) || quote.expires < quote.date ? 'Set a valid issue date and an expiry on or after it.' : null,
  ].filter(Boolean) as string[];
  const canExport = included.length > 0 && blocked.length === 0 && quote.ready && headerIssues.length === 0;
  const today = new Date().toISOString().slice(0, 10);
  const signingDateError = quote.expires < today ? 'This quotation has expired. Update and review it before signing.' : quote.date > today ? 'This quotation is not yet valid for acceptance.' : null;
  const signature = signatureSchema.safeParse({ name, email, company: quote.customer, consent });

  return (
    <>
      <PageHeader
        title="Your quote"
        subtitle="Check the preview, then download your PDF."
        actions={<button className="button secondary" disabled={!!busy} onClick={() => onBack()}><ArrowLeft size={14} />Back to review</button>}
      />
      <div className="final">
        <article className="paper" aria-label="Quotation preview">
          <header className="paper-head">
            <div className="paper-brand">rudco<span>.</span><small>Industrial metals supply</small></div>
            <div className="paper-id"><h2>Quotation</h2><code>{quote.id}</code></div>
          </header>
          <div className="paper-meta">
            <label>Prepared for<input disabled={!!busy} value={quote.customer} maxLength={200} onChange={(e) => onEdit({ ...quote, customer: e.target.value })} placeholder="Customer name" /></label>
            </div>
          <details className="quote-settings"><summary>Reference & dates</summary><div className="paper-meta">
            <label>Your reference<input disabled={!!busy} value={quote.rfqReference ?? ''} maxLength={200} onChange={(e) => onEdit({ ...quote, rfqReference: e.target.value || null })} placeholder="—" /></label>
            <label>Issued<input disabled={!!busy} type="date" value={quote.date} onChange={(e) => onEdit({ ...quote, date: e.target.value })} /></label>
            <label>Valid through<input disabled={!!busy} type="date" min={quote.date} value={quote.expires} onChange={(e) => onEdit({ ...quote, expires: e.target.value })} /></label>
          </div></details>
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
          <div className="paper-section"><h3>Terms</h3><p>{QUOTE_TERMS}</p></div>
          {quote.warnings.length > 0 && <div className="paper-section"><h3>Review notes</h3>{quote.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}
          <p className="paper-disclosure">{quote.disclosure}</p>
        </article>

        <aside className="final-side">
          <section className={`card export ${canExport ? 'ok' : 'blocked'}`}>
            <div className="export-state">
              {canExport ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <strong>{canExport ? 'Ready to download' : `${blocked.length + headerIssues.length} item${blocked.length + headerIssues.length === 1 ? '' : 's'} to resolve`}</strong>
            </div>
            <dl className="export-facts">
              <div><dt>Lines quoted</dt><dd>{included.length}{excluded.length ? ` (+${excluded.length} excluded)` : ''}</dd></div>
              <div><dt>Valid through</dt><dd>{quote.expires || '—'}</dd></div>
            </dl>
            <button className="button primary block" disabled={!canExport || !!busy} onClick={() => onExport(quote)}>
              {busy === 'Generating PDF' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}Download PDF
            </button>
          </section>

          <details className="card signing" open={signed ? true : undefined}>
            <summary>Buyer acceptance (optional)</summary>
            {signed ? <>
              <p>Signed by {signed.name} at {signed.signedAt}.</p>
              <small>Reference: {signed.id}</small>
              <button className="button primary block" disabled={!!busy} onClick={onDownloadSigned}><Download size={15} />Download signed PDF</button>
            </> : <form onSubmit={(e) => { e.preventDefault(); if (canExport && !signingDateError && signature.success && !busy) onSign(signature.data); }}>
              <label>Full name<input value={name} maxLength={200} disabled={!!busy} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
              <label>Email<input type="email" value={email} maxLength={254} disabled={!!busy} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              <p>{ACCEPTANCE_STATEMENT}</p>
              <label className="signing-consent"><input type="checkbox" checked={consent} disabled={!canExport || !!busy} onChange={(e) => setConsent(e.target.checked)} />I confirm this purchase authorization for {quote.customer || 'the quotation customer'}.</label>
              {signingDateError && <p className="issue">{signingDateError}</p>}
              <button className="button primary block" disabled={!canExport || !!signingDateError || !signature.success || !!busy}>
                {busy === 'Signing quote' ? <Loader2 size={15} className="spin" /> : <Download size={15} />}Sign & download PDF
              </button>
            </form>}
            <small>Save and send the PDF to request purchase. Signing does not transmit an order, verify identity or reserve stock. Refreshing clears this signature.</small>
          </details>

          {(headerIssues.length > 0 || blocked.length > 0) && (
            <section className="card issues">
              <h3>Before export</h3>
              {headerIssues.map((h) => <p key={h} className="issue">{h}</p>)}
              {blocked.map((i) => (
                <button key={i.id} className="issue-row" disabled={!!busy} onClick={() => onBack(i.id)}>
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
    </>
  );
}
