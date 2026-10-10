/**
 * Sample RFQs for a first visit. They run through the real backend (AI
 * extraction, catalog matching, pricing); nothing here is precomputed output.
 */
export interface SampleRfq {
  id: string;
  title: string;
  summary: string;
  expect: string;
  kind: 'text' | 'file';
  /** Pasted email text, or the /samples file to upload. */
  text?: string;
  file?: { path: string; name: string; type: string };
  /** Answer to type when the sample asks a question. */
  answer?: string;
}

export const SAMPLES: SampleRfq[] = [
  {
    id: 'ready',
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
    id: 'clarify',
    title: 'Missing temper',
    summary: '6061 plate with no temper stated.',
    expect: 'Asks which temper. Answer "T6" to complete it.',
    kind: 'text',
    answer: 'T6',
    text: `Subject: Quote request - aluminum plate

Please quote 8 pcs 6061 aluminum plate, .125" thick, 12" x 24". Price per piece please.

Marcus Lee
Lakeview Robotics`,
  },
  {
    id: 'blocked',
    title: 'Unavailable grade & certs',
    summary: '316L, 17-4 PH, DFARS, US melt and 3.1 MTRs.',
    expect: 'Refuses the near match; shows alternatives and missing compliance.',
    kind: 'text',
    text: `RFQ #AE-5530 - aerospace bracket stock

Line 1: 316L stainless sheet, 16 ga, 12 x 24 in, 2B finish, qty 10. ASTM A240.
Line 2: 17-4 PH round bar, condition H1025, 1" dia x 12" long - 5 pcs, AMS 5643.

All material must be DFARS compliant, US melt, with MTRs (EN 10204 3.1).

Regards,
Avery Chen, Summit Aero Components`,
  },
  {
    id: 'form',
    title: 'Fillable RFQ form (PDF)',
    summary: 'Government-style form; values live in form fields.',
    expect: 'Reads the schedule table from the form fields; four ready lines.',
    kind: 'file',
    file: { path: '/samples/harbor-marine-rfq-form.pdf', name: 'harbor-marine-rfq-form.pdf', type: 'application/pdf' },
  },
  {
    id: 'xlsx',
    title: 'Spreadsheet BOM (Excel)',
    summary: 'Merged title, a blank row, a formula and a "TBD" quantity.',
    expect: 'Flags the missing temper and the invalid quantity.',
    kind: 'file',
    file: { path: '/samples/lakeview-robotics-rfq.xlsx', name: 'lakeview-robotics-rfq.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  },
  {
    id: 'eml',
    title: 'Email with CSV attachment',
    summary: 'Saved .eml; the BOM is an attached semicolon CSV.',
    expect: 'Reads the attachment; MTRs on stainless block export until resolved.',
    kind: 'file',
    file: { path: '/samples/keystone-pumps-rfq.eml', name: 'keystone-pumps-rfq.eml', type: 'message/rfc822' },
  },
];
