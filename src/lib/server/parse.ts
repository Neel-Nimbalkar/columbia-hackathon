/**
 * In-memory RFQ document parsing. Nothing is written to disk, no formulas are
 * evaluated and no links are fetched. Every segment keeps a human-readable
 * reference (page/line, sheet/row, CSV row, text line) back to its source.
 */
import { HttpError } from './errors';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 100_000;
const MAX_SEGMENTS = 1500;
const MAX_SHEETS = 10;
const MAX_ROWS_PER_SHEET = 2000;
const MAX_CELLS = 100_000;

export type SourceKind = 'pdf' | 'csv' | 'xlsx' | 'txt' | 'email' | 'text';

export interface Segment {
  /** e.g. "rfq.pdf · page 1 · line 4", "Pasted text · line 2". */
  ref: string;
  text: string;
}

export interface ParsedSource {
  kind: SourceKind;
  name: string;
  segments: Segment[];
}

const EXTENSIONS: Record<string, SourceKind> = { '.pdf': 'pdf', '.csv': 'csv', '.xlsx': 'xlsx', '.txt': 'txt', '.eml': 'email' };

export function kindForFileName(name: string): SourceKind | null {
  const ext = /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? '';
  return EXTENSIONS[ext] ?? null;
}

function linesToSegments(text: string, label: string): Segment[] {
  const out: Segment[] = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) out.push({ ref: `${label} · line ${i + 1}`, text: t });
  });
  return out;
}

function decodeUtf8(buf: Uint8Array, name: string): string {
  if (buf.includes(0)) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', `${name} is not a text file.`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    // Legacy exports are often Windows-1252.
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parsePastedText(text: string): ParsedSource {
  if (text.length > MAX_TEXT_CHARS) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Pasted text exceeds ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
  return { kind: 'text', name: 'Pasted text', segments: linesToSegments(text, 'Pasted text') };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Render a table as "Header: value; Header: value" rows, skipping blank cells and blank rows. */
function tableToSegments(rows: string[][], label: (rowNumber: number) => string): Segment[] {
  const clean = rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()));
  const headerIndex = clean.findIndex((r) => r.filter(Boolean).length >= 2);
  if (headerIndex < 0) return clean.flatMap((r, i) => (r.some(Boolean) ? [{ ref: label(i + 1), text: r.filter(Boolean).join(' | ') }] : []));
  const header = clean[headerIndex]!;
  const out: Segment[] = [{ ref: `${label(headerIndex + 1)} (header)`, text: header.filter(Boolean).join(' | ') }];
  clean.forEach((r, i) => {
    if (i <= headerIndex || !r.some(Boolean)) return;
    const cells = r.map((v, c) => (v ? `${header[c] || `Column ${c + 1}`}: ${v}` : '')).filter(Boolean);
    out.push({ ref: label(i + 1), text: cells.join('; ') });
  });
  // Lines above the header (titles, notes) are still useful context.
  clean.slice(0, headerIndex).forEach((r, i) => r.some(Boolean) && out.unshift({ ref: label(i + 1), text: r.filter(Boolean).join(' | ') }));
  return out;
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: string; formula?: string };
    // Formulas: use the cached result only — never evaluate.
    if ('formula' in v || 'sharedFormula' in v) return v.result === undefined ? '' : cellText(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return cellText(v.text); // hyperlink: keep the text, never fetch
    if (v.error) return '';
    return '';
  }
  return String(value);
}

async function parseXlsx(buf: Uint8Array, name: string): Promise<Segment[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(422, 'UNPROCESSABLE_DOCUMENT', `${name} could not be read as an .xlsx workbook (corrupt or password-protected?).`);
  }
  const segments: Segment[] = [];
  let cells = 0;
  for (const ws of wb.worksheets.slice(0, MAX_SHEETS)) {
    if (ws.rowCount > MAX_ROWS_PER_SHEET * 5) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Sheet "${ws.name}" in ${name} is too large to process.`);
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (++cells > MAX_CELLS) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `${name} has too many cells to process.`);
        values[col - 1] = cellText(cell.value);
      });
      rows[rowNumber - 1] = Array.from(values, (v) => v ?? '');
    });
    const dense = Array.from(rows, (r) => r ?? []);
    segments.push(...tableToSegments(dense, (n) => `${name} · sheet "${ws.name}" · row ${n}`));
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

async function parsePdf(buf: Uint8Array, name: string): Promise<Segment[]> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf), { isEvalSupported: false, disableFontFace: true } as never);
  } catch (err) {
    const n = (err as { name?: string })?.name ?? '';
    if (n === 'PasswordException') throw new HttpError(422, 'PDF_PASSWORD_PROTECTED', `${name} is password-protected. Send an unlocked copy.`);
    throw new HttpError(422, 'UNPROCESSABLE_DOCUMENT', `${name} is not a readable PDF (it may be corrupt).`);
  }
  const { text } = await extractText(pdf, { mergePages: false });
  const segments: Segment[] = [];
  const pages = Array.isArray(text) ? text : [text];
  pages.forEach((pageText, i) => segments.push(...linesToSegments(pageText, `${name} · page ${i + 1}`)));

  // Fillable forms keep their values in form fields, not page text.
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const annots = (await page.getAnnotations()) as { fieldName?: string; alternativeText?: string; fieldValue?: unknown }[];
    for (const a of annots) {
      const value = Array.isArray(a.fieldValue) ? a.fieldValue.join(', ') : typeof a.fieldValue === 'string' ? a.fieldValue : '';
      if (a.fieldName && value.trim() && value !== 'Off')
        segments.push({ ref: `${name} · page ${p} · form field "${a.fieldName}"`, text: `${a.alternativeText || a.fieldName}: ${value.trim()}` });
    }
  }
  if (!segments.length) {
    throw new HttpError(422, 'OCR_REQUIRED', `${name} has ${pdf.numPages} page(s) but no extractable text — it looks scanned. OCR is required; please send a text-based PDF or paste the RFQ text.`);
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* Email (.eml)                                                         */
/* ------------------------------------------------------------------ */

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  const src = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-F]{2}$/i.test(src.slice(i + 1, i + 3))) { bytes.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(src.charCodeAt(i) & 0xff);
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/** Minimal RFC 822/MIME reader: headers of interest plus the text/plain body. */
export function emailToText(raw: string): string {
  const [head = '', ...rest] = raw.replace(/\r\n/g, '\n').split(/\n\n/);
  const body = rest.join('\n\n');
  const header = (k: string) => new RegExp(`^${k}:\\s*(.*(?:\\n[ \\t].*)*)`, 'im').exec(head)?.[1]?.replace(/\n[ \t]+/g, ' ').trim();
  const lines = ['From', 'To', 'Subject', 'Date'].map((k) => (header(k) ? `${k}: ${header(k)}` : '')).filter(Boolean);
  const type = header('Content-Type') ?? 'text/plain';
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  let text = body;
  const decode = (part: string, encoding?: string) =>
    /quoted-printable/i.test(encoding ?? '') ? decodeQuotedPrintable(part)
      : /base64/i.test(encoding ?? '') ? Buffer.from(part.replace(/\s+/g, ''), 'base64').toString('utf8') : part;
  if (boundary) {
    const parts = body.split(`--${boundary}`).map((p) => p.replace(/^\n/, ''));
    const plain = parts.find((p) => /^content-type:\s*text\/plain/im.test(p.split('\n\n')[0] ?? ''));
    const html = parts.find((p) => /^content-type:\s*text\/html/im.test(p.split('\n\n')[0] ?? ''));
    const chosen = plain ?? html ?? '';
    const [ph = '', ...pb] = chosen.split('\n\n');
    text = decode(pb.join('\n\n'), /content-transfer-encoding:\s*(\S+)/i.exec(ph)?.[1]);
    if (!plain && html) text = text.replace(/<br\s*\/?>|<\/p>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  } else {
    text = decode(body, header('Content-Transfer-Encoding'));
  }
  return [...lines, '', text].join('\n');
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export async function parseUpload(file: { name: string; size: number; bytes: Uint8Array }): Promise<ParsedSource> {
  const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'upload';
  const kind = kindForFileName(file.name);
  if (!kind) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a PDF, CSV, XLSX, TXT or EML file.');
  if (file.size === 0) throw new HttpError(422, 'EMPTY_DOCUMENT', `${name} is empty.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `${name} exceeds the 10 MB upload limit.`);
  const b = file.bytes;

  let segments: Segment[];
  if (kind === 'pdf') {
    if (String.fromCharCode(...b.slice(0, 1024)).indexOf('%PDF-') < 0) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', `${name} does not look like a PDF.`);
    segments = await parsePdf(b, name);
  } else if (kind === 'xlsx') {
    if (!(b[0] === 0x50 && b[1] === 0x4b)) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', `${name} does not look like an .xlsx workbook.`);
    segments = await parseXlsx(b, name);
  } else if (kind === 'csv') {
    segments = tableToSegments(parseCsvRows(decodeUtf8(b, name)), (n) => `${name} · row ${n}`);
  } else if (kind === 'email') {
    segments = linesToSegments(emailToText(decodeUtf8(b, name)), name);
  } else {
    segments = linesToSegments(decodeUtf8(b, name), name);
  }
  if (!segments.length) throw new HttpError(422, 'EMPTY_DOCUMENT', `${name} contains no readable text.`);
  if (segments.length > MAX_SEGMENTS) segments = segments.slice(0, MAX_SEGMENTS);
  return { kind, name, segments };
}
