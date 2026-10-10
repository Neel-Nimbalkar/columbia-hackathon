/**
 * Generates the sample RFQ files served from /samples (npx tsx scripts/make-samples.ts).
 * Customers are fictional; every line targets real catalog sizes or a documented edge case.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUT = 'public/samples';

async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();
  const ink = rgb(0.1, 0.12, 0.18);
  const fill = rgb(0.87, 0.91, 0.96);
  const grid = rgb(0.7, 0.74, 0.8);
  const text = (s: string, x: number, y: number, size = 8, f = bold) => page.drawText(s, { x, y, size, font: f, color: ink });
  const field = (name: string, value: string, x: number, y: number, w: number, h = 18) => {
    const tf = form.createTextField(name);
    if (value) tf.setText(value);
    tf.addToPage(page, { x, y, width: w, height: h, borderWidth: 0, font });
    tf.setFontSize(8);
  };

  text('REQUEST FOR QUOTATION', 36, 742, 20);
  text('THIS IS NOT AN ORDER', 36, 726, 8, font);

  const header: [string, string, string][] = [
    ['1. REQUEST NUMBER', 'request_number', 'HMI-RFQ-2026-0412'],
    ['2. DATE ISSUED', 'date_issued', '10/08/2026'],
    ['3. ISSUED BY', 'issued_by', 'Harbor Marine Industries - Purchasing'],
    ['4. FOR INFORMATION, CALL', 'contact', 'Priya Nair, (216) 555-0148'],
    ['5. DELIVERY BY (DATE)', 'delivery_by', '10/24/2026'],
    ['6. SHIP TO', 'ship_to', 'Harbor Marine Industries, 1200 Dock Rd, Cleveland, OH 44114'],
  ];
  header.forEach(([label, name, value], i) => {
    const y = 690 - i * 22;
    page.drawRectangle({ x: 36, y, width: 200, height: 20, color: fill, borderColor: grid, borderWidth: 0.5 });
    page.drawRectangle({ x: 236, y, width: 340, height: 20, borderColor: grid, borderWidth: 0.5 });
    text(label, 42, y + 7);
    field(name, value, 240, y + 1, 332);
  });

  text('Certifications required:', 36, 540, 8);
  const mtr = form.createCheckBox('cert_mtr');
  mtr.addToPage(page, { x: 150, y: 537, width: 9, height: 9 });
  text('MTR', 162, 540, 8, font);
  const dfars = form.createCheckBox('cert_dfars');
  dfars.addToPage(page, { x: 190, y: 537, width: 9, height: 9 });
  text('DFARS', 202, 540, 8, font);

  text('7. SCHEDULE (Include applicable Federal, State and local taxes)', 36, 516, 9);
  const cols = [{ t: 'ITEM NO.', w: 50 }, { t: 'SUPPLIES / SERVICES', w: 270 }, { t: 'QUANTITY', w: 60 }, { t: 'UNIT', w: 45 }, { t: 'UNIT PRICE', w: 60 }, { t: 'AMOUNT', w: 55 }];
  const rows = [
    ['1', '6061-T6511 aluminum round bar, 1" dia x 48" lg', '12', 'EA'],
    ['2', '4140 alloy steel round bar, 1" dia x 24"', '8', 'EA'],
    ['3', '304 stainless round tube 1" OD x .065" wall x 36"', '6', 'EA'],
    ['4', 'A36 HR flat bar 1/4" x 2" x 48"', '20', 'EA'],
  ];
  let x = 36;
  const top = 492;
  cols.forEach((c) => {
    page.drawRectangle({ x, y: top, width: c.w, height: 18, color: fill, borderColor: grid, borderWidth: 0.5 });
    text(c.t, x + 4, top + 6, 7);
    x += c.w;
  });
  for (let r = 0; r < 8; r++) {
    const y = top - 20 * (r + 1);
    let cx = 36;
    cols.forEach((c, ci) => {
      page.drawRectangle({ x: cx, y, width: c.w, height: 20, borderColor: grid, borderWidth: 0.5 });
      const value = ci < 4 ? rows[r]?.[ci] ?? '' : '$0.00';
      field(`schedule_${c.t.replace(/\W+/g, '_').toLowerCase()}_row${r + 1}`, value, cx + 2, y + 1, c.w - 4);
      cx += c.w;
    });
  }
  text('Please furnish quotations to the issuing office on or before the close of business 10/15/2026.', 36, 300, 8, font);
  text('8. TERMS AND CONDITIONS', 36, 280, 8);
  field('terms', 'Net 30. Quote valid 30 days. Material must be new, unused and traceable to the mill.', 40, 255, 530, 20);
  doc.setTitle('Harbor Marine Industries RFQ HMI-RFQ-2026-0412');
  return doc.save();
}

async function workbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RFQ');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'Lakeview Robotics — Material RFQ LR-7781';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = 'Need by 10/30. All dimensions in inches. Quote per piece.';
  ws.addRow([]);
  ws.addRow(['Line', 'Material', 'Size (in)', 'Qty', 'UOM', 'Notes']);
  ws.getRow(4).font = { bold: true };
  ws.addRow([1, '6061 aluminum plate', '0.25 x 12 x 12', 5, 'EA', 'temper per drawing']);
  ws.addRow([2, '5052-H32 aluminum sheet', '0.063 x 12 x 24', 10, 'EA', '']);
  ws.addRow([]);
  ws.addRow([3, '7075-T651 aluminum plate', '0.5 x 12 x 18', 'TBD', 'EA', 'confirming qty with engineering']);
  ws.addRow([4, '304 stainless round bar', '1/2 dia x 24', { formula: '2*3', result: 6 }, 'EA', '']);
  ws.columns.forEach((c, i) => { c.width = [6, 28, 18, 8, 6, 32][i]; });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function email(): string {
  const csv = 'Item;Description;Size;Qty;Unit\n1;316 stainless sheet 14 ga 2B;12 x 18 in;4;pcs\n2;1018 cold rolled round bar;1/2 in dia x 72 in;20;pcs\n';
  const b64 = Buffer.from(csv).toString('base64').replace(/.{76}/g, '$&\n');
  return [
    'From: "Tomas Reyes" <treyes@keystone-pumps.example>',
    'To: quotes@rudco.example',
    'Subject: =?UTF-8?Q?RFQ_KP-1180_=E2=80=94_pump_skid_material?=',
    'Date: Thu, 08 Oct 2026 09:14:00 -0400',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    '--outer',
    'Content-Type: multipart/alternative; boundary="inner"',
    '',
    '--inner',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Hi RudCo,',
    '',
    'Please quote the attached BOM for our KP-1180 pump skid. MTRs required on the =',
    'stainless. Delivery to Allentown, PA.',
    '',
    'Thanks,',
    'Tomas Reyes =E2=80=94 Keystone Pumps',
    '--inner',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hi RudCo,</p><p>Please quote the attached BOM for our KP-1180 pump skid. MTRs required on the stainless.</p>',
    '--inner--',
    '--outer',
    'Content-Type: text/csv; name="KP-1180-BOM.csv"',
    'Content-Disposition: attachment; filename="KP-1180-BOM.csv"',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '--outer--',
    '',
  ].join('\r\n');
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/harbor-marine-rfq-form.pdf`, await formPdf());
  await writeFile(`${OUT}/lakeview-robotics-rfq.xlsx`, await workbook());
  await writeFile(`${OUT}/keystone-pumps-rfq.eml`, email());
  console.log(`Wrote samples to ${OUT}/`);
}

main();
