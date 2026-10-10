import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { parseUpload, parseCsvRows, emailToText } from '../src/lib/server/parse';
import { parseMeasure, normalizeGrade, normalizeMaterial, normalizeForm, normalizeFinish, gaugeToInches, normalizeQtyUnit } from '../src/lib/server/normalize';

const file = (name: string, bytes: Uint8Array) => ({ name, size: bytes.length, bytes });

async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 740 - i * 20, size: 11, font }));
  return doc.save();
}

test('text PDF keeps page and line references', async () => {
  const src = await parseUpload(file('rfq.pdf', await textPdf(['Request for quote', '12 pcs 304 SS sheet 16ga 48 x 96 in'])));
  assert.equal(src.kind, 'pdf');
  const hit = src.segments.find((s) => s.text.includes('304 SS'));
  assert.ok(hit);
  assert.match(hit!.ref, /^rfq\.pdf · page 1 · line \d+$/);
});

test('fillable PDF form values are read from form fields', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const f = form.createTextField('request_number');
  f.setText('RFQ-2026-118');
  f.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  const src = await parseUpload(file('form.pdf', await doc.save()));
  assert.ok(src.segments.some((s) => s.text.includes('RFQ-2026-118') && s.ref.includes('form field')));
});

test('empty/scanned PDF asks for OCR; corrupt PDF and wrong magic are rejected clearly', async () => {
  const blank = await PDFDocument.create();
  blank.addPage();
  const blankBytes = await blank.save();
  await assert.rejects(() => parseUpload(file('scan.pdf', blankBytes)), { code: 'OCR_REQUIRED', status: 422 });
  await assert.rejects(() => parseUpload(file('bad.pdf', new TextEncoder().encode('%PDF-1.7 garbage'))), { status: 422 });
  await assert.rejects(() => parseUpload(file('fake.pdf', new TextEncoder().encode('hello'))), { code: 'UNSUPPORTED_FILE_TYPE' });
  await assert.rejects(() => parseUpload(file('x.docx', new Uint8Array([1]))), { code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
  await assert.rejects(() => parseUpload(file('empty.txt', new Uint8Array())), { code: 'EMPTY_DOCUMENT' });
});

test('CSV keeps row numbers, header labels and skips blank cells/rows', async () => {
  assert.deepEqual(parseCsvRows('a,"b ""q"", c",d\n1,2,3'), [['a', 'b "q", c', 'd'], ['1', '2', '3']]);
  const csv = 'Item,Material,Qty,Notes\n1,6061-T6 sheet .125 x 24 x 48,5,\n,,,\n2,304 SS rd bar 1in x 12ft,abc,rush';
  const src = await parseUpload(file('rfq.csv', new TextEncoder().encode(csv)));
  const row2 = src.segments.find((s) => s.ref === 'rfq.csv · row 2');
  assert.equal(row2?.text, 'Item: 1; Material: 6061-T6 sheet .125 x 24 x 48; Qty: 5');
  assert.ok(src.segments.some((s) => s.ref === 'rfq.csv · row 4' && s.text.includes('Qty: abc')));
  assert.ok(!src.segments.some((s) => s.ref === 'rfq.csv · row 3'));
});

test('XLSX uses cached formula results (never evaluates) and keeps sheet/row refs', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lines');
  ws.addRow(['Item', 'Description', 'Qty']);
  ws.addRow([1, '6061-T651 plate 0.5 x 12 x 12', 4]);
  ws.addRow([2, '1018 CRS rd 1"', { formula: 'C2*2', result: 8 }]);
  ws.addRow([]);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  const src = await parseUpload(file('rfq.xlsx', bytes));
  assert.ok(src.segments.some((s) => s.ref === 'rfq.xlsx · sheet "Lines" · row 3' && s.text.includes('Qty: 8')));
});

test('email: headers and quoted-printable plain body', () => {
  const eml = 'From: Buyer <b@example.com>\nSubject: RFQ 118\nContent-Type: multipart/alternative; boundary="X"\n\n--X\nContent-Type: text/plain\nContent-Transfer-Encoding: quoted-printable\n\nNeed 4 pcs 6061 plate =C2=BD" thick\n--X--';
  const text = emailToText(eml);
  assert.match(text, /Subject: RFQ 118/);
  assert.match(text, /Need 4 pcs 6061 plate ½" thick/);
});

test('normalization: fractions, grades, materials, forms, gauges, quantity units', () => {
  assert.equal(parseMeasure('1-1/2'), 1.5);
  assert.equal(parseMeasure('1/8"'), 0.125);
  assert.equal(parseMeasure('.060'), 0.06);
  assert.equal(parseMeasure('0'), null);
  assert.equal(parseMeasure('abc'), null);
  assert.deepEqual(normalizeGrade('6061-T6'), { grade: '6061', temper: 'T6' });
  assert.deepEqual(normalizeGrade('304 SS'), { grade: '304', temper: null });
  assert.deepEqual(normalizeGrade('type 316l'), { grade: '316L', temper: null });
  assert.deepEqual(normalizeGrade('17-4PH'), { grade: '17-4 PH', temper: null });
  assert.equal(normalizeMaterial('SS'), 'stainless steel');
  assert.equal(normalizeMaterial('Aluminium'), 'aluminum');
  assert.equal(normalizeForm('rd bar'), 'round bar');
  assert.equal(normalizeForm('sht'), 'sheet');
  assert.equal(gaugeToInches(16, 'carbon steel')?.inches, 0.0598);
  assert.equal(gaugeToInches(16, 'aluminum')?.inches, 0.0508);
  assert.equal(gaugeToInches(16, null), null);
  assert.equal(normalizeFinish('#2 finish'), '#2');
  assert.equal(normalizeFinish('No. 2B'), '2B');
  assert.equal(normalizeFinish('#4 brushed'), '#4');
  assert.equal(normalizeQtyUnit('sheets'), 'pc');
  assert.equal(normalizeQtyUnit('lbs'), 'lb');
});
