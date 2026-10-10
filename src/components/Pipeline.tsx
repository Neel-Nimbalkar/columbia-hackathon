'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Download, ExternalLink, Mail, Search, Trash2 } from 'lucide-react';
import type { Quote } from '@/lib/shared/schema';
import { compactMoney, duration, money, pct, quoteMargin, relativeDate } from '@/lib/client/format';
import { LOSS_REASONS, dealState, ledgerCsv, removeEntry, setNote, setStatus, type DealStatus, type LedgerEntry, type LossReason } from '@/lib/client/ledger';
import { Badge, CopyButton, Empty, Modal, PageHeader, Segmented } from './ui';

type Range = '30' | '90' | 'all';
type Filter = 'all' | DealStatus | 'expired';

const SERIES = { quoted: '#2a78d6', won: '#eb6834' };
const DAY = 86_400_000;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Monday 00:00 UTC of the week containing t. */
const weekStart = (t: number) => {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
};

export function Pipeline({ ledger, currentId, onOpen, onNew }: { ledger: LedgerEntry[]; currentId: string | null; onOpen: (q: Quote) => void; onNew: () => void }) {
  const [range, setRange] = useState<Range>('90');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [followUp, setFollowUp] = useState<LedgerEntry | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const inRange = useMemo(() => ledger.filter((e) => range === 'all' || now - Date.parse(e.createdAt) <= Number(range) * DAY), [ledger, range, now]);

  if (!ledger.length) {
    return (
      <>
        <PageHeader title="Pipeline" subtitle="Quoted value, win rate and follow-ups for every RFQ you process." />
        <section className="card">
          <Empty icon={<BarChart3 size={22} />} title="No quotes yet" action={<button className="button primary" onClick={onNew}>Process an RFQ<ArrowRight size={14} /></button>}>
            Each RFQ you process is logged here automatically, in this browser only. Download a quote PDF to mark it sent, then record won or lost to track conversion.
          </Empty>
        </section>
      </>
    );
  }

  const state = (e: LedgerEntry) => dealState(e, today);
  const quoted = inRange.filter((e) => e.status !== 'draft');
  const won = inRange.filter((e) => e.status === 'won');
  const lost = inRange.filter((e) => e.status === 'lost');
  const open = inRange.filter((e) => state(e) === 'sent');
  const sum = (xs: LedgerEntry[]) => xs.reduce((s, e) => s + e.quote.total, 0);
  const decided = won.length + lost.length;
  const marginBase = quoted.filter((e) => e.quote.total > 0);
  const weightedMargin = marginBase.length ? marginBase.reduce((s, e) => s + (quoteMargin(e.quote) ?? 0) * e.quote.total, 0) / sum(marginBase) : null;
  const toReady = median(inRange.filter((e) => e.readyAt).map((e) => Date.parse(e.readyAt!) - Date.parse(e.createdAt) + e.processingMs));
  const aiTime = median(inRange.map((e) => e.processingMs));
  const lines = inRange.reduce((s, e) => s + e.firstPassLines, 0);
  const firstPass = lines ? inRange.reduce((s, e) => s + e.firstPassReady, 0) / lines : null;

  const followUps = ledger
    .filter((e) => state(e) === 'sent' && (Date.parse(e.quote.expires) - now < 7 * DAY || now - Date.parse(e.sentAt ?? e.createdAt) > 3 * DAY))
    .sort((a, b) => a.quote.expires.localeCompare(b.quote.expires))
    .slice(0, 5);

  const shown = ledger
    .filter((e) => filter === 'all' || state(e) === filter)
    .filter((e) => !query.trim() || `${e.customer} ${e.id} ${e.rfqReference ?? ''} ${e.source}`.toLowerCase().includes(query.trim().toLowerCase()));

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([ledgerCsv(ledger)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rudco-pipeline-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Logged in this browser as you process RFQs. Downloading a PDF marks a quote sent; record the outcome when the buyer replies."
        actions={<>
          <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }]} />
          <button className="button secondary" onClick={downloadCsv}><Download size={14} />Export CSV</button>
        </>}
      />

      <div className="kpis">
        <div className="kpi hero">
          <span>Won revenue</span>
          <strong>{compactMoney(sum(won))}</strong>
          <small>{won.length} won of {quoted.length} quoted ({compactMoney(sum(quoted))})</small>
        </div>
        <div className="kpi"><span>Win rate</span><strong>{decided ? pct(won.length / decided, 0) : '—'}</strong><small>{decided ? `${won.length} of ${decided} decided` : 'No outcomes recorded yet'}</small></div>
        <div className="kpi"><span>Open pipeline</span><strong>{compactMoney(sum(open))}</strong><small>{open.length} awaiting a reply</small></div>
        <div className="kpi"><span>Avg gross margin</span><strong>{weightedMargin === null ? '—' : pct(weightedMargin)}</strong><small>Value-weighted, quoted</small></div>
        <div className="kpi"><span>RFQ → ready quote</span><strong>{toReady === null ? '—' : duration(toReady)}</strong><small>Median · AI pass {aiTime === null ? '—' : duration(aiTime)}</small></div>
        <div className="kpi"><span>First-pass ready</span><strong>{firstPass === null ? '—' : pct(firstPass, 0)}</strong><small>Lines with no questions</small></div>
      </div>

      <div className="charts">
        <section className="card chart-card wide">
          <div className="card-head"><h2>Quoted vs won, by week</h2>
            <div className="legend"><span><i style={{ background: SERIES.quoted }} />Quoted</span><span><i style={{ background: SERIES.won }} />Won</span></div>
          </div>
          <WeeklyChart entries={inRange} range={range} now={now} />
        </section>
        <section className="card chart-card">
          <div className="card-head"><h2>Conversion</h2><span className="muted">{inRange.length} RFQs</span></div>
          <Funnel steps={[
            { label: 'Processed', n: inRange.length },
            { label: 'Ready to quote', n: inRange.filter((e) => e.readyAt).length },
            { label: 'Sent', n: quoted.length },
            { label: 'Won', n: won.length },
          ]} />
        </section>
        <section className="card chart-card">
          <div className="card-head"><h2>Why we lose</h2><span className="muted">{lost.length} lost</span></div>
          {lost.length ? <BarList rows={LOSS_REASONS.map((r) => ({ label: r, value: lost.filter((e) => e.lossReason === r).length, sub: compactMoney(sum(lost.filter((e) => e.lossReason === r))) })).filter((r) => r.value)} format={(v) => `${v}`} />
            : <p className="muted chart-empty">Mark a quote lost to see the reasons here.</p>}
        </section>
        <section className="card chart-card">
          <div className="card-head"><h2>Top customers</h2><span className="muted">Quoted value</span></div>
          {quoted.length ? <BarList rows={Object.entries(quoted.reduce<Record<string, number>>((m, e) => { const k = e.customer || 'Unnamed'; m[k] = (m[k] ?? 0) + e.quote.total; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }))} format={compactMoney} />
            : <p className="muted chart-empty">Send a quote to rank customers.</p>}
        </section>
        <section className="card chart-card">
          <div className="card-head"><h2>Follow up</h2><span className="muted">Sent, expiring or quiet</span></div>
          {followUps.length ? (
            <ul className="follow">
              {followUps.map((e) => {
                const days = Math.ceil((Date.parse(e.quote.expires) - now) / DAY);
                return (
                  <li key={e.id}>
                    <div><strong>{e.customer || e.id}</strong><small>{money(e.quote.total)} · {days < 0 ? 'expired' : days === 0 ? 'expires today' : `expires in ${days} d`}</small></div>
                    <button className="button secondary small" onClick={() => setFollowUp(e)}><Mail size={13} />Follow up</button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted chart-empty">Nothing needs a nudge right now.</p>}
        </section>
      </div>

      <section className="card">
        <div className="card-head table-tools">
          <h2>Quotes</h2>
          <div className="filters">
            <Segmented label="Status filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All ${ledger.length}` }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }, { value: 'expired', label: 'Expired' }]} />
            <label className="search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Customer, quote or RFQ #" aria-label="Search quotes" /></label>
          </div>
        </div>
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th>Quote</th><th>Created</th><th>Lines</th><th className="num">Total</th><th className="num">Margin</th><th>Expires</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((e) => <LedgerRow key={e.id} e={e} today={today} current={e.id === currentId} onOpen={onOpen} />)}
              {!shown.length && <tr><td colSpan={8} className="muted">No quotes match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {followUp && <FollowUpEmail e={followUp} onClose={() => setFollowUp(null)} />}
    </>
  );
}

function LedgerRow({ e, today, current, onOpen }: { e: LedgerEntry; today: string; current: boolean; onOpen: (q: Quote) => void }) {
  const st = dealState(e, today);
  const ready = e.quote.items.filter((i) => i.included && i.status === 'Ready').length;
  const included = e.quote.items.filter((i) => i.included).length;
  const margin = quoteMargin(e.quote);
  const days = Math.ceil((Date.parse(e.quote.expires) - Date.now()) / DAY);
  return (
    <tr className={current ? 'current' : ''}>
      <td>
        <button className="row-button" onClick={() => onOpen(e.quote)}>
          <strong>{e.customer || 'Unnamed customer'}</strong>
          <small>{e.id}{e.rfqReference ? ` · RFQ ${e.rfqReference}` : ''} · {e.source}</small>
        </button>
        <input className="note" value={e.note} placeholder="Add a note…" aria-label={`Note for ${e.id}`} onChange={(ev) => setNote(e.id, ev.target.value)} />
      </td>
      <td>{relativeDate(e.createdAt)}<small>{duration(e.processingMs)} AI pass</small></td>
      <td>{ready}/{included} ready</td>
      <td className="num">{money(e.quote.total)}</td>
      <td className="num">{margin === null ? '—' : pct(margin)}</td>
      <td>{e.quote.expires}<small className={st === 'sent' && days <= 7 ? 'text-amber' : ''}>{st === 'won' || st === 'lost' ? '' : days < 0 ? 'expired' : `${days} d left`}</small></td>
      <td>
        <div className="status-cell">
          <Badge status={st} />
          <select aria-label={`Status of ${e.id}`} value={e.status} onChange={(ev) => setStatus(e.id, ev.target.value as DealStatus)}>
            <option value="draft">Draft</option><option value="sent">Sent</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
          {e.status === 'lost' && (
            <select aria-label={`Loss reason for ${e.id}`} value={e.lossReason ?? 'Other'} onChange={(ev) => setStatus(e.id, 'lost', ev.target.value as LossReason)}>
              {LOSS_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
        </div>
      </td>
      <td>
        <div className="row-actions">
          <button className="icon-button" title="Open in workspace" aria-label={`Open ${e.id}`} onClick={() => onOpen(e.quote)}><ExternalLink size={14} /></button>
          <button className="icon-button" title="Delete" aria-label={`Delete ${e.id}`} onClick={() => { if (confirm(`Delete ${e.id} from the pipeline?`)) removeEntry(e.id); }}><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  );
}

/** Grouped columns: quoted (sent/won/lost) and won value per week the RFQ came in. */
function WeeklyChart({ entries, range, now }: { entries: LedgerEntry[]; range: Range; now: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const first = entries.reduce((m, e) => Math.min(m, Date.parse(e.createdAt)), now);
  const startT = range === 'all' ? Math.max(weekStart(first), weekStart(now) - 25 * 7 * DAY) : weekStart(now - Number(range) * DAY);
  const weeks: { t: number; quoted: number; won: number }[] = [];
  for (let t = startT; t <= weekStart(now); t += 7 * DAY) weeks.push({ t, quoted: 0, won: 0 });
  for (const e of entries) {
    const w = weeks.find((x) => x.t === weekStart(Date.parse(e.createdAt)));
    if (!w) continue;
    if (e.status !== 'draft') w.quoted += e.quote.total;
    if (e.status === 'won') w.won += e.quote.total;
  }
  const max = Math.max(...weeks.map((w) => w.quoted), 1);
  const step = (() => { const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!; })();
  const top = step * Math.ceil(max / step);
  const H = 200, padL = 46, padB = 24, padT = 8;
  const plotW = Math.max(0, width - padL - 4);
  const band = weeks.length ? plotW / weeks.length : 0;
  const bar = Math.max(3, Math.min(24, (band - 10) / 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const label = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const col = (x: number, v: number, color: string) => {
    if (v <= 0) return null;
    const y0 = y(0), y1 = y(v), r = Math.min(4, (y0 - y1) / 2, bar / 2);
    return <path d={`M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bar - r} Q${x + bar},${y1} ${x + bar},${y1 + r} V${y0} Z`} fill={color} />;
  };
  const every = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 64)));
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`Weekly quoted and won value. Total quoted ${money(weeks.reduce((s, w) => s + w.quoted, 0))}, won ${money(weeks.reduce((s, w) => s + w.won, 0))}.`}>
          {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={padL} x2={width} y1={y(v)} y2={y(v)} stroke="#ececf0" strokeWidth={1} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="tick">{compactMoney(v)}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const x0 = padL + i * band + (band - (bar * 2 + 2)) / 2;
            return (
              <g key={w.t} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * band} y={padT} width={band} height={H - padT - padB} fill={hover === i ? '#f4f4f8' : 'transparent'} />
                {col(x0, w.quoted, SERIES.quoted)}
                {col(x0 + bar + 2, w.won, SERIES.won)}
                {i % every === 0 && <text x={padL + i * band + band / 2} y={H - 6} textAnchor="middle" className="tick">{label(w.t)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && weeks[hover] && (
        <div className="tooltip" style={{ left: Math.min(width - 170, Math.max(0, padL + hover * band + band / 2 - 80)) }}>
          <strong>Week of {label(weeks[hover]!.t)}</strong>
          <span><i style={{ background: SERIES.quoted }} />Quoted<b>{money(weeks[hover]!.quoted)}</b></span>
          <span><i style={{ background: SERIES.won }} />Won<b>{money(weeks[hover]!.won)}</b></span>
        </div>
      )}
      <button className="link small-link" onClick={() => setTable(!table)}>{table ? 'Hide data' : 'Show data'}</button>
      {table && (
        <table className="data-table">
          <thead><tr><th>Week of</th><th className="num">Quoted</th><th className="num">Won</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.t}><td>{label(w.t)}</td><td className="num">{money(w.quoted)}</td><td className="num">{money(w.won)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const max = Math.max(steps[0]?.n ?? 0, 1);
  return (
    <ol className="funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1]!.n : null;
        return (
          <li key={s.label}>
            <div className="funnel-label"><span>{s.label}</span><strong>{s.n}</strong>{prev !== null && <small>{prev ? pct(s.n / prev, 0) : '—'} of previous</small>}</div>
            <div className="track"><span style={{ width: `${(s.n / max) * 100}%` }} /></div>
          </li>
        );
      })}
    </ol>
  );
}

function BarList({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.sub ? ` · ${r.sub}` : ''}`}>
          <div className="barlist-label"><span>{r.label}</span><strong>{format(r.value)}{r.sub && <small> · {r.sub}</small>}</strong></div>
          <div className="track"><span style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function FollowUpEmail({ e, onClose }: { e: LedgerEntry; onClose: () => void }) {
  const q = e.quote;
  const subject = `Following up: quotation ${q.id}${q.rfqReference ? ` (RFQ ${q.rfqReference})` : ''}`;
  const body = [
    `Hi${e.customer ? ` ${e.customer} team` : ''},`,
    '',
    `Following up on quotation ${q.id}${q.rfqReference ? ` for your RFQ ${q.rfqReference}` : ''} — ${money(q.total)} for ${q.items.filter((i) => i.included).length} line${q.items.filter((i) => i.included).length === 1 ? '' : 's'}, valid through ${q.expires}.`,
    '',
    'Stock is allocated on order, so let us know if you’d like to proceed or if anything needs adjusting (quantities, lengths, documentation).',
    '',
    'Best regards,',
  ].join('\n');
  return (
    <Modal title="Follow-up email" onClose={onClose} footer={<>
      <CopyButton text={`Subject: ${subject}\n\n${body}`} label="Copy email" />
      <a className="button primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} />Open in mail app</a>
    </>}>
      <div className="email-preview"><div className="email-subject"><span>Subject</span>{subject}</div><pre>{body}</pre></div>
    </Modal>
  );
}
