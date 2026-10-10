'use client';
import { useEffect, useState } from 'react';
import { FileCheck2, Inbox, ListChecks } from 'lucide-react';
import type { Quote } from '@/lib/shared/schema';

export type View = 'new' | 'workspace' | 'final';

interface Health { status: 'ok' | 'degraded'; providers: { nicrron: { configured: boolean; model: string }; typesafe: { configured: boolean } } }

export function Sidebar({ view, onView, quote }: { view: View; onView: (v: View) => void; quote: Quote | null }) {
  const [health, setHealth] = useState<Health | null | 'error'>(null);
  useEffect(() => {
    fetch('/api/health', { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).then(setHealth, () => setHealth('error'));
  }, []);

  const open = quote ? quote.items.filter((i) => i.included && i.status !== 'Ready').length : 0;

  const item = (v: View, label: string, icon: React.ReactNode, opts: { disabled?: boolean; count?: number | null; countTone?: string } = {}) => (
    <button className={`nav ${view === v ? 'active' : ''}`} disabled={opts.disabled} onClick={() => onView(v)} aria-current={view === v ? 'page' : undefined}>
      {icon}<span>{label}</span>
      {opts.count ? <span className={`nav-count ${opts.countTone ?? ''}`}>{opts.count}</span> : null}
    </button>
  );

  const model = health && health !== 'error' ? health.providers.nicrron.model.split('/').pop() : null;
  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="RudCo home">rudco<span>.</span></a>
      <nav aria-label="Quote">
        <div className="nav-label">Quote</div>
        {item('new', 'New RFQ', <Inbox size={16} />)}
        {item('workspace', 'Workspace', <ListChecks size={16} />, { disabled: !quote, count: open || null, countTone: 'amber' })}
        {item('final', 'Final quote', <FileCheck2 size={16} />, { disabled: !quote })}
      </nav>
      <div className="sidebar-foot">
        {health === null ? <span className="status-line"><i className="dot" />Checking AI…</span>
          : health === 'error' ? <span className="status-line"><i className="dot red" />Server unreachable</span>
            : health.status === 'ok' ? <span className="status-line" title="Extraction via Nicrron, classification via TypeSafe Jev"><i className="dot green" />AI online · {model}</span>
              : <span className="status-line" title="Set NICRRON_API_KEY and TYPESAFE_API_KEY on the server"><i className="dot amber" />AI keys not configured</span>}
      </div>
    </aside>
  );
}
