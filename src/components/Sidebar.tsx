'use client';
import { useState } from 'react';
import type { Quote } from '@/lib/shared/schema';
import { isBlocked } from '@/lib/client/format';

export type View = 'new' | 'workspace' | 'final' | 'pipeline' | 'catalog' | 'calculator';

export function Sidebar({ view, onView, quote, disabled = false }: { view: View; onView: (v: View) => void; quote: Quote | null; disabled?: boolean }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const open = quote?.items.filter(i => i.included && isBlocked(i)).length ?? 0;
  const steps = [{ view: 'new', label: 'RFQ' }, { view: 'workspace', label: 'Review' }, { view: 'final', label: 'Quote' }] as const;
  const tools = [{ view: 'pipeline', label: 'Pipeline' }, { view: 'catalog', label: 'Catalog & stock' }, { view: 'calculator', label: 'Calculator' }] as const;
  return <header className="workflow-nav">
    <span className="brand" aria-label="RudCo">rudco<span>.</span></span>
    <nav aria-label="Quote steps">
      {steps.map((step, i) => <button key={step.view} className={`nav ${view === step.view ? 'active' : ''}`} disabled={disabled || (step.view !== 'new' && !quote)} onClick={() => onView(step.view)} aria-current={view === step.view ? 'step' : undefined}>
        <span className="step-number">{i + 1}</span>{step.label}{step.view === 'workspace' && open > 0 && <span className="nav-count amber">{open}</span>}
      </button>)}
    </nav>
    <div className="tools-menu">
      <button className={`button secondary small ${tools.some(t => t.view === view) ? 'active' : ''}`} disabled={disabled} aria-expanded={toolsOpen} aria-controls="tools-navigation" onClick={() => setToolsOpen(!toolsOpen)}>Tools</button>
      {toolsOpen && <nav id="tools-navigation" aria-label="Tools">{tools.map(tool => <button key={tool.view} className={`nav ${view === tool.view ? 'active' : ''}`} disabled={disabled} aria-current={view === tool.view ? 'page' : undefined} onClick={() => { setToolsOpen(false); onView(tool.view); }}>{tool.label}</button>)}</nav>}
    </div>
  </header>;
}
