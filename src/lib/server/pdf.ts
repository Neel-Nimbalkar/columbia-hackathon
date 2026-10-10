import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Quote } from '../shared/schema';
export function exportBlockers(quote:Quote):string[]{const included=quote.items.filter(i=>i.included);if(!included.length)return ['Include at least one ready line.'];return included.flatMap(i=>[...i.blockers,...i.questions,...i.conflicts,...(i.status!=='Ready'?[`${i.id}: ${i.status}`]:[]),...(!i.matchedSku?[`${i.id}: no matched SKU`]:[]),...(!i.pricing?[`${i.id}: no validated price`]:[]),...(i.spec.quantity===null||i.spec.quantity<=0?[`${i.id}: invalid quantity`]:[]),...i.compliance.filter(c=>c.status==='pending'||c.status==='missing').map(c=>`${i.id}: ${c.requirement} ${c.status}`)]);}
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
/** Keep everything Helvetica (WinAnsi) can encode, e.g. ± Ø ° ×; substitute the rest visibly instead of dropping it,
 * so "±0.005" never prints as "0.005". */
export const pdfText=(s:string)=>s.replace(/[–—−‐‑]/g,'-').replace(/×/g,'x').replace(/·/g,' | ').replace(/″/g,'"').replace(/′/g,"'").replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/⌀/g,'Ø').replace(/[^\x20-\x7E\n\u00A0-\u00FF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•˜™š›œžŸ]/g,'?');
const ascii=pdfText;
export async function generateQuotePdf(quote:Quote):Promise<Uint8Array>{
 const blockers=exportBlockers(quote);if(blockers.length)throw new Error(blockers.join('; '));
 const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.12,.15,.2),muted=rgb(.4,.44,.5),line=rgb(.87,.89,.92);
 let page=doc.addPage([595.28,841.89]);let y=0;
 const write=(s:string,x:number,yy:number,size=10,strong=false,color=ink)=>page.drawText(ascii(s),{x,y:yy,size,font:strong?bold:regular,color});
 function header(){write('RudCo',44,792,25,true);write('QUOTATION',423,795,10,true,muted);write('Industrial metals supply',44,771,9,false,muted);page.drawLine({start:{x:44,y:753},end:{x:551,y:753},color:line,thickness:1});y=727;}
 function ensure(height:number){if(y-height<66){page=doc.addPage([595.28,841.89]);header();}}
 function wrapped(text:string,width:number,size=10,strong=false):string[]{const font=strong?bold:regular;const lines:string[]=[];for(const paragraph of ascii(text).split('\n')){let current='';for(const word of paragraph.split(/\s+/)){if(font.widthOfTextAtSize((current?current+' ':'')+word,size)>width&&current){lines.push(current);current='';}if(font.widthOfTextAtSize(word,size)>width){for(const char of word){if(font.widthOfTextAtSize(current+char,size)>width){lines.push(current);current='';}current+=char;}}else current+=(current?' ':'')+word;}lines.push(current);}return lines;}
 function paragraph(text:string,size=10,color=ink,strong=false){for(const row of wrapped(text,507,size,strong)){ensure(size+6);write(row,44,y,size,strong,color);y-=size+6;}y-=6;}
 header();paragraph(`Quote ${quote.id}`,15,ink,true);paragraph(`Prepared for ${quote.customer || 'Customer not supplied'}`,11);if(quote.rfqReference)paragraph(`Your reference: ${quote.rfqReference}`,9,muted);paragraph(`Issued ${quote.date}  |  Valid through ${quote.expires}`,9,muted);y-=8;
 const tableHeader=()=>{ensure(30);page.drawRectangle({x:44,y:y-7,width:507,height:24,color:rgb(.96,.97,.98)});write('PRODUCT / SPECIFICATION',52,y,8,true,muted);write('QTY',345,y,8,true,muted);write('UNIT PRICE',392,y,8,true,muted);write('AMOUNT',477,y,8,true,muted);y-=30;};
 tableHeader();
 for(const item of quote.items.filter(i=>i.included)){
  const s=item.normalized;const description=`${s.material??'Unknown material'} ${s.grade??''}${s.temper?' / '+s.temper:''} ${s.form??''}`;
  const dimensions=[s.thickness,s.width,s.length].filter(v=>v!==null).join(' x ')+(s.dimensionUnit?' '+s.dimensionUnit:'');
  const rows=[...wrapped(description,275,10,true),...wrapped(`SKU ${item.matchedSku}`,275,9),...wrapped(`${dimensions} | ${s.finish??'Finish not specified'}`,275,9)];
  const h=rows.length*15+17;if(y-h<66){page=doc.addPage([595.28,841.89]);header();tableHeader();}
  rows.forEach((row,i)=>write(row,52,y-i*15,i===0?10:9,i===0));write(String(s.quantity),345,y,10);write(money(item.pricing!.unitPrice),392,y,10);write(money(item.pricing!.lineTotal),477,y,10);y-=h;page.drawLine({start:{x:44,y:y+7},end:{x:551,y:y+7},color:line,thickness:.5});
  paragraph(`Your request: ${item.original.replace(/\s*\|\s*/g,' ')}`,8,muted);
  for(const c of item.compliance.filter(c=>c.status!=='not_requested'))paragraph(`${c.requirement}: ${c.status}. ${c.evidence}`,8,muted);
  paragraph(`Price per ${item.pricing!.unit}. Lead time: ${item.leadTime??'To be confirmed'}.`,8,muted);
  if(s.standards.length)paragraph(`Requested standards: ${s.standards.join(', ')}`,8,muted);
 }
 ensure(58);y-=10;write('TOTAL (USD)',355,y,10,true);write(money(quote.total),466,y,17,true);y-=37;
 paragraph('Terms & assumptions',11,ink,true);paragraph('Freight and applicable taxes are excluded. Payment terms and delivery schedule are subject to agreement. No substitution of material, grade, temper or certification is authorized by this quotation.',9,muted);
 const excluded=quote.items.filter(i=>!i.included);if(excluded.length){paragraph('Excluded requests',10,ink,true);for(const i of excluded)paragraph(`${i.id}: ${i.original}`,9,muted);}
 paragraph(quote.disclosure,8,muted);
 const pages=doc.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:44,y:46},end:{x:551,y:46},color:line,thickness:.5});p.drawText(ascii(quote.id),{x:44,y:30,size:8,font:regular,color:muted});p.drawText(`${i+1} / ${pages.length}`,{x:515,y:30,size:8,font:regular,color:muted});});
 doc.setTitle(`RudCo quote ${quote.id}`);doc.setAuthor('RudCo');return doc.save();
}
