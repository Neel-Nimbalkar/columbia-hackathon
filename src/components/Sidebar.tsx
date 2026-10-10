'use client';
import type { Quote } from '@/lib/shared/schema';
import { isBlocked } from '@/lib/client/format';

export type View = 'new' | 'workspace' | 'final';

export function Sidebar({ view, onView, quote, disabled = false }: { view: View; onView: (v: View) => void; quote: Quote | null; disabled?: boolean }) {
  const open = quote?.items.filter(isBlocked).length ?? 0;
  const steps = [{ view: 'new', label: 'RFQ' }, { view: 'workspace', label: 'Review' }, { view: 'final', label: 'Quote' }] as const;
  return (
    <header className="workflow-nav">
      <span className="brand" aria-label="RudCo">rudco<span>.</span></span>
      <nav aria-label="Quote steps">
        {steps.map((step, i) => <button key={step.view} className={`nav ${view === step.view ? 'active' : ''}`} disabled={disabled || (step.view !== 'new' && !quote)} onClick={() => onView(step.view)} aria-current={view === step.view ? 'step' : undefined}>
          <span className="step-number">{i + 1}</span>{step.label}{step.view === 'workspace' && open > 0 && <span className="nav-count amber">{open}</span>}
        </button>)}
      </nav>
    </header>
  );
}
