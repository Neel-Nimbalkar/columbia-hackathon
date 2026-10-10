/** Explicitly invoked acceptance harness. Does not run in npm test or builds.
 * Usage: npm run harness -- https://your-service.onrender.com
 * Calls real Nicrron/Jev through the app; configured PRISM receives the traces.
 */
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { quoteSchema, type Quote } from '../src/lib/shared/schema';
import { CATALOG } from '../src/lib/server/catalog';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const text = [
  '1) 6061-T651 aluminum plate 1/4 in x 12 in x 24 in, qty 2 pieces, ASTM B209',
  '2) 304 SS sheet 16ga 12 in x 24 in #2 finish, qty 2 pieces',
  '3) 6061 aluminum plate 1/8 in x 12 in x 24 in, qty 2 pieces',
  '4) 6061-T651 aluminum plate 1/4 in x 12 in x 24 in, qty 1 piece. MTR, USA origin, AS9100 required.',
].join('\n');
let stage = 'configuration';
async function request(path: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, body === undefined ? {signal:AbortSignal.timeout(240000)} : {
    method:'POST', headers:body instanceof FormData ? undefined : {'Content-Type':'application/json'},
    body:body instanceof FormData ? body : JSON.stringify(body), signal:AbortSignal.timeout(240000),
  });
}
async function quoteResponse(response: Response): Promise<Quote> {
  assert.equal(response.status,200,await response.clone().text());
  return quoteSchema.parse(await response.json());
}
async function step(name: string, run: () => Promise<void> | void) {
  stage=name;
  await run();
  console.log(`PASS ${name}`);
}

async function main() {
  const health=await (await request('/api/health')).json();
  assert.equal(health.status,'ok','Nicrron and Jev must be configured');
  assert.equal(health.providers.prism.configured,true,'PRISM tracing must be configured');
  let quote: Quote;
  await step('1. Parse every line into material, grade, dimensions, quantity and ASTM standard',async()=>{
    const form=new FormData();form.set('text',text);form.set('customer','Harness Buyer');form.set('targetMargin','0.2');
    quote=await quoteResponse(await request('/api/rfq/process',form));
    assert.equal(quote.items.length,4);
    assert.match(quote.provider.extraction,/Nicrron/);assert.match(quote.provider.classification,/Jev/);
    for(const item of quote.items){assert.ok(item.classification?.model.startsWith('jev-'));assert.ok(item.spec.material);assert.ok(item.spec.grade);assert.equal(item.spec.quantityUnit,'pc');assert.equal(item.normalized.dimensionUnit,'in');assert.equal(item.normalized.width,12);assert.equal(item.normalized.length,24);assert.ok(text.includes(item.original));}
    assert.equal(quote.items[0]!.spec.temper,'T651');assert.equal(quote.items[0]!.normalized.thickness,0.25);assert.equal(quote.items[1]!.spec.gauge,16);assert.ok(quote.items[0]!.spec.standards.includes('ASTM B209'));
  });
  await step('2. Match fully specified lines to sourced supplier catalog items without substituting',()=>{
    for(const index of [0,1,3]){const item=quote.items[index]!;const p=CATALOG.find(p=>p.sku===item.matchedSku);assert.ok(p);assert.ok(p.url.startsWith('https://'));assert.equal(p.grade,item.spec.grade);assert.equal(p.width,12);assert.equal(p.length,24);assert.match(item.matchExplanation.join(' '),/Exact match/);}
    assert.equal(quote.items[2]!.matchedSku,null);
  });
  await step('3. Price each matched line against a sourced benchmark with a competitive explanation',()=>{
    for(const index of [0,1,3]){const price=quote.items[index]!.pricing!;assert.ok(price);assert.ok(price.margin>=0.2);assert.equal(price.competitive,true);assert.match(price.benchmarkStatus,/Sourced/);assert.ok(price.benchmark!>=price.unitPrice);assert.match(price.benchmarkSource!,/https:\/\//);assert.match(price.explanation,/benchmark|comparison/);assert.equal(price.lineTotal,Math.round(price.unitPrice*quote.items[index]!.spec.quantity!*100)/100);}
    assert.equal(quote.items[2]!.pricing,null);
  });
  await step('4. Flag MTR, country of origin and spec certifications; block unsupported evidence',async()=>{
    assert.equal(quote.items[0]!.compliance.find(c=>c.requirement==='ASTM B209')!.status,'verified');
    const blocked=quote.items[3]!;assert.equal(blocked.status,'Compliance Pending');
    for(const requirement of ['MTR','Origin: USA','AS9100'])assert.equal(blocked.compliance.find(c=>c.requirement===requirement)!.status,'missing');
    assert.equal((await request('/api/quote/pdf',{quote})).status,422);
  });
  await step('5. Ask the buyer about ambiguity, then reprocess the explicit T6 answer',async()=>{
    const item=quote.items[2]!;assert.equal(item.status,'Needs Clarification');assert.equal(item.spec.temper,null);assert.match(item.questions.join(' '),/temper/);
    quote=await quoteResponse(await request('/api/rfq/clarify',{quote,itemId:item.id,response:'T6'}));
    assert.equal(quote.items[2]!.spec.temper,'T6');assert.equal(quote.items[2]!.status,'Ready');assert.equal(quote.items[2]!.questions.length,0);assert.ok(quote.items[2]!.classification);
  });
  await step('6. Exercise corrections, exclusions, margin recalculation and PDF export',async()=>{
    // A material-changing correction must replace the original Jev result.
    quote=await quoteResponse(await request('/api/rfq/clarify',{quote,itemId:quote.items[1]!.id,corrections:{...quote.items[0]!.spec,quantity:1}}));
    assert.equal(quote.items[1]!.classification?.material,'aluminum');assert.equal(quote.items[1]!.status,'Ready');
    quote=await quoteResponse(await request('/api/rfq/clarify',{quote,itemId:quote.items[3]!.id,included:false}));
    assert.equal(quote.items.length,4);assert.equal(quote.items[3]!.included,false);assert.equal(quote.ready,true);
    quote=await quoteResponse(await request('/api/rfq/clarify',{quote,itemId:quote.items[0]!.id,targetMargin:0.3}));
    assert.ok(quote.items.filter(i=>i.included).every(i=>i.pricing!.margin>=0.3));
    assert.equal(Math.round(quote.total*100),quote.items.filter(i=>i.included).reduce((sum,i)=>sum+Math.round(i.pricing!.lineTotal*100),0));
    const pdf=await request('/api/quote/pdf',{quote});assert.equal(pdf.status,200);assert.ok((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount()>0);
  });
  await step('7. Export typed purchase acceptance and reject missing consent, stale totals and expiration',async()=>{
    const signature={name:'Harness Buyer',email:'buyer@example.com',company:quote.customer,consent:true};
    const pdf=await request('/api/quote/accept',{quote,signature});assert.equal(pdf.status,200,await pdf.clone().text());assert.ok(pdf.headers.get('X-Quote-Acceptance-Id'));assert.ok(pdf.headers.get('X-Quote-Accepted-At'));assert.match((await PDFDocument.load(await pdf.arrayBuffer())).getTitle()!,/^Signed/);
    assert.equal((await request('/api/quote/accept',{quote,signature:{...signature,consent:false}})).status,400);
    assert.equal((await request('/api/quote/accept',{quote:{...quote,total:0},signature})).status,409);
    assert.equal((await request('/api/quote/accept',{quote:{...quote,date:'2020-01-01',expires:'2020-01-02'},signature})).status,422);
  });
  console.log(`All seven stages passed against ${base}. No purchase was sent to a supplier; the harness only generated PDFs.`);
}
main().catch(error=>{console.error(`FAIL ${stage}: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
