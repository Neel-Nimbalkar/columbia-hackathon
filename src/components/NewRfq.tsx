'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Mail, Play, Upload, X } from 'lucide-react';
import { SAMPLES, type SampleRfq } from '@/lib/client/samples';
import { PageHeader } from './ui';
import type { Processing } from '@/app/page';

export interface IntakeDraft { text: string; files: File[]; customer: string; margin: string }

const ACCEPT = '.pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.txt,.eml,.png,.jpg,.jpeg,.webp,.gif';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

function fileIcon(name: string) {
  if (/\.(xlsx|xlsm|csv|tsv)$/i.test(name)) return <FileSpreadsheet size={15} />;
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return <ImageIcon size={15} />;
  if (/\.eml$/i.test(name)) return <Mail size={15} />;
  return <FileText size={15} />;
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function NewRfq({ draft, onDraft, processing, onProcess, onError }: {
  draft: IntakeDraft;
  onDraft: (d: IntakeDraft) => void;
  processing: Processing | null;
  onProcess: (input: { text: string; files: File[]; customer: string; margin: number; source: string }) => void;
  onError: (message: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const samplePending = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    if (processing || samplePending.current) return;
    const incoming = Array.from(list);
    const bad = incoming.find((f) => !new RegExp(`(${ACCEPT.split(',').map((e) => e.replace('.', '\\.')).join('|')})$`, 'i').test(f.name));
    if (bad) {
      const ext = /\.[^.]+$/.exec(bad.name)?.[0]?.toLowerCase();
      const hints: Record<string, string> = { '.xls': 'Save it as .xlsx or CSV.', '.doc': 'Save it as .docx or PDF.', '.msg': 'Save the email as .eml or print it to PDF.', '.heic': 'Export the photo as JPG.' };
      onError(`${bad.name} is not a supported file. ${hints[ext ?? ''] ?? 'Use PDF, Word, Excel, CSV, TXT, EML or a photo (PNG/JPG).'}`);
      return;
    }
    const big = incoming.find((f) => f.size > MAX_BYTES);
    if (big) { onError(`${big.name} is larger than 10 MB.`); return; }
    const empty = incoming.find((f) => f.size === 0);
    if (empty) { onError(`${empty.name} is empty.`); return; }
    const merged = [...draft.files.filter((f) => !incoming.some((n) => n.name === f.name && n.size === f.size)), ...incoming];
    if (merged.length > MAX_FILES) { onError(`Attach at most ${MAX_FILES} files per RFQ.`); return; }
    onDraft({ ...draft, files: merged });
  }

  function submit() {
    const m = Number(draft.margin);
    if (draft.margin.trim() === '' || !Number.isFinite(m) || m < 0 || m > 80) { onError('Enter a target margin between 0% and 80%.'); return; }
    const source = [...draft.files.map((f) => f.name), draft.text.trim() ? 'Pasted email' : ''].filter(Boolean).join(' + ');
    onProcess({ text: draft.text, files: draft.files, customer: draft.customer, margin: m, source });
  }

  async function runSample(s: SampleRfq) {
    if (processing || samplePending.current) return;
    const m = Number(draft.margin);
    if (!draft.margin.trim() || !Number.isFinite(m) || m < 0 || m > 80) { onError('Enter a target margin between 0% and 80%.'); return; }
    if (s.kind === 'text') {
      onDraft({ ...draft, text: s.text!, files: [] });
      onProcess({ text: s.text!, files: [], customer: '', margin: m, source: `Sample · ${s.title}` });
      return;
    }
    samplePending.current = true; setLoadingSample(true);
    try {
      const res = await fetch(s.file!.path, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error();
      const file = new File([await res.blob()], s.file!.name, { type: s.file!.type });
      onDraft({ ...draft, files: [file], text: '' });
      onProcess({ text: '', files: [file], customer: '', margin: m, source: `Sample · ${s.file!.name}` });
    } catch {
      onError('Could not load the sample file. Please retry.');
    } finally { samplePending.current = false; setLoadingSample(false); }
  }

  const canSubmit = !processing && !loadingSample && (draft.text.trim().length > 0 || draft.files.length > 0);

  return (
    <>
      <PageHeader title="New RFQ" subtitle="Upload the buyer’s files or paste their request. We’ll flag anything that needs an answer." />
      <div className="intake">
        <section className="card intake-card">
          <div
            className={`dropzone ${drag ? 'dragging' : ''} ${draft.files.length ? 'has-files' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" disabled={!!processing || loadingSample} multiple accept={ACCEPT} className="visually-hidden" aria-label="Upload RFQ files" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            <Upload size={20} />
            <div>
              <strong>Drop RFQ files here</strong> or <button className="link" disabled={!!processing || loadingSample} onClick={() => fileRef.current?.click()}>browse</button>
              <p>PDF, Word, Excel, CSV, email or photos · 5 files max, 10 MB each</p>
            </div>
          </div>
          {draft.files.length > 0 && (
            <ul className="file-list">
              {draft.files.map((f) => (
                <li key={f.name + f.size}>
                  {fileIcon(f.name)}<span className="file-name">{f.name}</span><span className="muted">{size(f.size)}</span>
                  <button className="icon-button" aria-label={`Remove ${f.name}`} disabled={!!processing || loadingSample} onClick={() => onDraft({ ...draft, files: draft.files.filter((x) => x !== f) })}><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          <label className="field-label" htmlFor="rfq-text">Buyer’s request <span className="muted">(optional with files)</span></label>
          <textarea
            disabled={!!processing || loadingSample}
            id="rfq-text"
            className="rfq-text"
            maxLength={100_000}
            value={draft.text}
            onChange={(e) => onDraft({ ...draft, text: e.target.value })}
            placeholder={'Paste the buyer\'s email, e.g.\n\nNeed 6 pcs 304 SS sheet 16ga 12" x 24" #4, and 10 pcs 1018 CRS rd bar 1" x 36"…'}
          />
          <details className="intake-options">
            <summary>Customer & pricing settings</summary>
            <div className="intake-row">
              <label>Customer <span className="muted">(optional)</span>
                <input disabled={!!processing || loadingSample} value={draft.customer} maxLength={200} onChange={(e) => onDraft({ ...draft, customer: e.target.value })} placeholder="Read from the RFQ" />
              </label>
              <label>Target gross margin
                <span className="input-suffix"><input disabled={!!processing || loadingSample} type="number" min={0} max={80} step={1} value={draft.margin} onChange={(e) => onDraft({ ...draft, margin: e.target.value })} /><span>%</span></span>
              </label>
            </div>
          </details>
          <div className="intake-submit">
            <span className="muted">Missing details become questions.</span>
            <button className="button primary" disabled={!canSubmit} onClick={submit}>
              {processing ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}Process RFQ
            </button>
          </div>
          {processing && <ProcessingBar processing={processing} />}
        </section>

        <details className="samples example-drawer">
<summary>Try an example RFQ</summary>
          <div className="sample-grid">
            {SAMPLES.map((s) => (
              <div key={s.id} className="sample-card">
                <div className="sample-top">
                  <span className="sample-kind">{s.kind === 'file' ? fileIcon(s.file!.name) : <Mail size={15} />}{s.kind === 'file' ? s.file!.name.split('.').pop()!.toUpperCase() : 'EMAIL'}</span>
                  {s.file && <a className="icon-button" href={s.file.path} download aria-label={`Download ${s.file.name}`} title="Download the file"><Download size={14} /></a>}
                </div>
                <h3>{s.title}</h3>
                <p>{s.summary}</p>
                <p className="sample-expect">{s.expect}</p>
                <button className="button secondary small" disabled={!!processing || loadingSample} onClick={() => runSample(s)}><Play size={13} />Run sample</button>
              </div>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}

function ProcessingBar({ processing }: { processing: Processing }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const s = Math.floor((now - processing.startedAt) / 1000);
  const stage = s < 2 ? 'Reading documents' : s < 25 ? 'Extracting line items' : s < 60 ? 'Checking matches, prices and requirements' : 'Still working — long or scanned RFQs take longer';
  return (
    <div className="processing" role="status" aria-live="polite">
      <Loader2 size={16} className="spin" />
      <div>
        <strong>{stage}…</strong>
        <span className="muted"> {s}s · {processing.label}</span>
        <div className="progress"><span style={{ width: `${Math.min(95, 100 * (1 - Math.exp(-s / (processing.hasFiles ? 25 : 12))))}%` }} /></div>
      </div>
      <button className="button secondary small" onClick={() => processing.controller.abort()}>Cancel</button>
    </div>
  );
}
