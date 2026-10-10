'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleDashed, CircleHelp, Copy, Info, X, XCircle } from 'lucide-react';

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_TONE: Record<string, Tone> = {
  Ready: 'green', verified: 'green', won: 'green',
  Matched: 'blue', sent: 'blue', pending: 'amber',
  'Needs Clarification': 'amber', 'Compliance Pending': 'amber', expired: 'amber',
  'No Match': 'red', missing: 'red', lost: 'red',
  not_requested: 'neutral', draft: 'neutral', Excluded: 'neutral',
};

const STATUS_ICON: Record<Tone, ReactNode> = {
  green: <CheckCircle2 size={12} />, blue: <Check size={12} />, amber: <CircleHelp size={12} />, red: <XCircle size={12} />, neutral: <CircleDashed size={12} />,
};

const LABELS: Record<string, string> = { not_requested: 'Not requested', draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost', expired: 'Expired', verified: 'Verified', pending: 'Pending', missing: 'Missing' };

/** Status pill: icon + label, never color alone. */
export function Badge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return <span className={`badge ${tone}`}>{STATUS_ICON[tone]}{LABELS[status] ?? status}</span>;
}

export function Message({ tone, children, onClose }: { tone: 'error' | 'info' | 'warning'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`message ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' ? <AlertTriangle size={16} /> : tone === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />}
      <div>{children}</div>
      {onClose && <button className="icon-button" aria-label="Dismiss" onClick={onClose}><X size={14} /></button>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="button secondary small"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}{done ? 'Copied' : label}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
