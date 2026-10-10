import { emptySpec, type Quote, type QuoteItem, type Spec } from '../shared/schema';
export const demoTexts = {
 successful: `From: purchasing@northstar.example\nSubject: stock for fabrication — please quote\n\nHi RudCo, need pricing for these two lines:\n1) 304 SS sheet, .060 inch thick x 48 inch x 96 inch, 2B finish, 3 sheets.\n2) Aluminum 6061-T6 sheet, 1/8 inch x 24 inch x 48 inch, mill finish, 5 sheets.\nPlease quote per sheet. No certification or origin restrictions.\nThanks, Northstar Fabrication`,
 ambiguous: `Please quote 4 sheets aluminum 6061, .125 in thick, 24 in wide x 48 in long, mill finish. Price per sheet. No certification or origin restrictions.`,
 invalid: `Need 2 sheets stainless 316L, .060 in x 48 in x 96 in, 2B finish. ASTM A240 and AS9100 certification required. USA origin only. Quote per sheet.`
};
export type DemoKind=keyof typeof demoTexts;
function line(id:string,original:string,spec:Partial<Spec>):QuoteItem {
 const full={...emptySpec,...spec};
 return {id,original,source:`Email · line ${id==='line-1'?1:2}`,spec:full,normalized:{...full},conflicts:[],provenance:Object.fromEntries(Object.entries(full).filter(([,v])=>v!==null).map(([k])=>[k,'customer' as const])),included:true,status:'Ready',matchedSku:id==='line-1'?'DEMO-SS304-060-4896':'DEMO-AL6061-125-2448',alternatives:[],matchExplanation:['Illustrative exact material, grade and form match.','Dimensions and requested finish agree with the fixture.','Synthetic stock is sufficient for the requested quantity.'],compliance:[{requirement:'MTR',status:'not_requested',evidence:'Not requested in this fixture.'},{requirement:'Country of origin',status:'not_requested',evidence:'No restriction requested.'},{requirement:'Standards',status:'not_requested',evidence:'No standard requested.'}],questions:[],blockers:[],pricing:null,leadTime:'3–5 business days (synthetic)'};
}
export function demoReprice(quote:Quote):Quote {
 const items=quote.items.map(item=>{
  if(item.status!=='Ready')return {...item,pricing:null};
  const cost=item.spec.material==='aluminum'?154:248;
  const benchmark=item.spec.material==='aluminum'?205:335;
  const unitPrice=Math.ceil(cost/(1-quote.targetMargin)*100)/100;
  return {...item,pricing:{cost,unitPrice,lineTotal:Math.round(unitPrice*(item.spec.quantity??0)*100)/100,margin:1-cost/unitPrice,benchmark,benchmarkDate:'2026-10-10',benchmarkSource:'Synthetic demo comparison; not a market feed',benchmarkStatus:'Synthetic · comparable per sheet',unit:'sheet',explanation:`Demo cost $${cost.toFixed(2)} / (1 − ${(quote.targetMargin*100).toFixed(0)}% margin). Rounded up to preserve margin. ${unitPrice>benchmark?'Above synthetic benchmark; margin/competitiveness conflict.':'Below synthetic benchmark.'}`,competitive:unitPrice<=benchmark}};
 });
 const included=items.filter(i=>i.included);
 return {...quote,items,total:Math.round(included.reduce((n,i)=>n+(i.pricing?.lineTotal??0),0)*100)/100,ready:included.length>0&&included.every(i=>i.status==='Ready'&&i.blockers.length===0&&i.pricing!==null)};
}
export function makeDemoQuote(kind:DemoKind):Quote {
 let items:QuoteItem[];
 const al={material:'aluminum',grade:'6061',form:'sheet',thickness:.125,width:24,length:48,dimensionUnit:'in' as const,quantity:5,quantityUnit:'sheet',temper:'T6',finish:'mill'};
 if(kind==='successful')items=[line('line-1','304 SS sheet .060 inch x 48 inch x 96 inch, 2B, 3 sheets',{material:'stainless steel',grade:'304',form:'sheet',thickness:.06,width:48,length:96,dimensionUnit:'in',quantity:3,quantityUnit:'sheet',finish:'2B'}),line('line-2','Aluminum 6061-T6 sheet 1/8 inch x 24 inch x 48 inch, mill, 5 sheets',al)];
 else if(kind==='ambiguous')items=[{...line('line-1',demoTexts.ambiguous,{...al,quantity:4,temper:null}),matchedSku:null,status:'Needs Clarification',questions:['Do you require 6061-T6 or another temper?'],blockers:['Aluminum temper is not specified.'],matchExplanation:['6061 grade identified; temper is unknown. A fixture candidate exists in T6, but it is not an approved substitution.'],alternatives:[{sku:'DEMO-AL6061-125-2448',reason:'T6 candidate; buyer must confirm temper.'}]}];
 else items=[{...line('line-1',demoTexts.invalid,{material:'stainless steel',grade:'316L',form:'sheet',thickness:.06,width:48,length:96,dimensionUnit:'in',quantity:2,quantityUnit:'sheet',finish:'2B',standards:['ASTM A240'],certifications:['AS9100'],countryOfOrigin:'USA'}),status:'No Match',matchedSku:null,blockers:['316L grade unavailable in the illustrative catalog.','AS9100 evidence and USA origin evidence unavailable.'],matchExplanation:['304 is not an equivalent substitute for 316L.'],compliance:[{requirement:'ASTM A240',status:'pending',evidence:'No matched product to verify.'},{requirement:'AS9100',status:'missing',evidence:'No certification evidence in fixture.'},{requirement:'USA origin',status:'missing',evidence:'Country of origin not documented.'}],alternatives:[{sku:'DEMO-SS304-060-4896',reason:'Incompatible grade: 304 instead of 316L.'}]}];
 return demoReprice({id:`DEMO-${kind.toUpperCase()}`,customer:'Northstar Fabrication',date:'2026-10-10',expires:'2026-11-09',originalText:demoTexts[kind],targetMargin:.2,items,total:0,ready:false,warnings:['Illustrative fixture. No AI call has been made. Inventory, costs, benchmarks and lead times are synthetic.'],provider:{extraction:'Illustrative fixture — no AI',classification:'Illustrative fixture — no Jev'},disclosure:'DEMO SAMPLE — fictional quotation for interface review. No verified supplier offer, inventory or certificate. All costs and benchmarks are synthetic.'});
}
export function clarifyDemo(quote:Quote,itemId:string,response:string):Quote {
 const item=quote.items.find(i=>i.id===itemId);
 if(!item||item.status!=='Needs Clarification'||!/^\s*(6061[- ]?)?t6\s*[.!]?\s*$/i.test(response))throw new Error('This illustrative scenario accepts “T6” only. Other answers require the real backend.');
 return demoReprice({...quote,items:quote.items.map(i=>i.id!==itemId?i:{...i,spec:{...i.spec,temper:'T6'},normalized:{...i.normalized,temper:'T6'},provenance:{...i.provenance,temper:'customer'},questions:[],blockers:[],status:'Ready',matchedSku:'DEMO-AL6061-125-2448',alternatives:[],matchExplanation:['Buyer confirmed T6 in the illustrative scenario.','Fixture dimensions and finish agree.'],leadTime:'3–5 business days (synthetic)'})});
}
