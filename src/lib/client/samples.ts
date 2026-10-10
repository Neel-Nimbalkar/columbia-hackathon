/**
 * Sample RFQs for a first visit. They run through the real backend (AI
 * extraction, catalog matching, pricing); nothing here is precomputed output.
 */
export interface SampleRfq {
  id: string;
  /** Input type shown on the card, e.g. "Excel (.xlsx)". */
  format: string;
  title: string;
  summary: string;
  expect: string;
  kind: 'text' | 'file';
  /** Pasted email text, or the /samples file to upload. */
  text?: string;
  file?: { path: string; name: string; type: string };
}

/** One sample per supported input type. */
export const SAMPLES: SampleRfq[] = [
  {
    id: 'ready',
    format: 'Pasted email',
    title: 'Messy shop email',
    summary: 'Three lines, shorthand like "16ga", "CRS", fractions.',
    expect: 'All three lines match and price; ready to export.',
    kind: 'text',
    text: `From: Dana Ortiz <dana.ortiz@northfield-fab.example>
Subject: RFQ NF-2291 - need pricing by Thu

Hi team,

Can you quote the following for a bracket job? Need it next week if possible.

1) 304 SS sheet 16ga, 12" x 24", #4 brushed - qty 6
2) 1018 CRS round bar 1" dia x 36" long, 10 pcs
3) A36 HR plate 1/2" x 12" x 18" - 4 ea

No certs needed on this one. Ship to our Elyria, OH shop.

Thanks,
Dana Ortiz
Purchasing, Northfield Fabrication`,
  },
  {
    id: 'form',
    format: 'PDF form',
    title: 'Fillable RFQ form',
    summary: 'Government-style form; values live in form fields.',
    expect: 'Reads the schedule table from the form fields; four ready lines.',
    kind: 'file',
    file: { path: '/samples/harbor-marine-rfq-form.pdf', name: 'harbor-marine-rfq-form.pdf', type: 'application/pdf' },
  },
  {
    id: 'scan',
    format: 'Scanned PDF',
    title: 'Scanned purchase request',
    summary: 'Image-only PDF with no text layer; read by the vision model.',
    expect: 'Three ready lines; asks for grade and temper on "aluminum sheet".',
    kind: 'file',
    file: { path: '/samples/great-lakes-rfq-scan.pdf', name: 'great-lakes-rfq-scan.pdf', type: 'application/pdf' },
  },
  {
    id: 'photo',
    format: 'Photo (.png)',
    title: 'Phone photo of a printout',
    summary: 'Angled photo of a typed RFQ with a handwritten note.',
    expect: 'Transcribes all three lines; ready to export.',
    kind: 'file',
    file: { path: '/samples/ridgeline-fab-rfq-photo.png', name: 'ridgeline-fab-rfq-photo.png', type: 'image/png' },
  },
  {
    id: 'xlsx',
    format: 'Excel (.xlsx)',
    title: 'Spreadsheet BOM',
    summary: 'Merged title, a blank row, a formula and a "TBD" quantity.',
    expect: 'Asks for the missing temper (answer "T651") and the quantity.',
    kind: 'file',
    file: { path: '/samples/lakeview-robotics-rfq.xlsx', name: 'lakeview-robotics-rfq.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  },
  {
    id: 'csv',
    format: 'CSV',
    title: 'BOM export with certs',
    summary: 'Standard, cert and origin columns per line.',
    expect: 'ASTM verified; MTR and USA origin flagged as missing on line 1.',
    kind: 'file',
    file: { path: '/samples/apex-machining-rfq.csv', name: 'apex-machining-rfq.csv', type: 'text/csv' },
  },
  {
    id: 'docx',
    format: 'Word (.docx)',
    title: 'Aerospace RFQ letter',
    summary: '316L, 17-4 PH, DFARS, US melt and 3.1 MTRs in a Word table.',
    expect: 'Refuses near matches; shows alternatives and missing compliance.',
    kind: 'file',
    file: { path: '/samples/summit-aero-rfq.docx', name: 'summit-aero-rfq.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  },
  {
    id: 'eml',
    format: 'Email file (.eml)',
    title: 'Email with CSV attachment',
    summary: 'Saved .eml; the BOM is an attached semicolon CSV.',
    expect: 'Reads the attachment; MTRs on stainless block export until resolved.',
    kind: 'file',
    file: { path: '/samples/keystone-pumps-rfq.eml', name: 'keystone-pumps-rfq.eml', type: 'message/rfc822' },
  },
];
