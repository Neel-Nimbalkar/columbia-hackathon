import { z } from 'zod';
import { quoteSchema } from '@/lib/shared/schema';
import { exportBlockers,generateQuotePdf } from '@/lib/server/pdf';
import { validateQuoteForExport } from '@/lib/server/quote-validation';
export const runtime='nodejs';
const requestSchema=z.object({quote:quoteSchema,demo:z.boolean().default(false)});
export async function POST(request:Request){
 try {
  if(Number(request.headers.get('content-length')??0)>1_000_000)return Response.json({error:{code:'TOO_LARGE',message:'Quotation exceeds the 1 MB export limit.'}},{status:413});
  const raw=await request.text();if(raw.length>1_000_000)return Response.json({error:{code:'TOO_LARGE',message:'Quotation exceeds the export limit.'}},{status:413});
  let data:unknown;try{data=JSON.parse(raw);}catch{return Response.json({error:{code:'INVALID_JSON',message:'Send valid JSON.'}},{status:400});}
  const parsed=requestSchema.safeParse(data);if(!parsed.success)return Response.json({error:{code:'INVALID_QUOTE',message:'Quotation data is invalid.',details:parsed.error.flatten()}},{status:400});
  const {demo}=parsed.data;
  const quote=demo?{...parsed.data.quote,disclosure:'DEMO SAMPLE — fictional quotation for interface review. All costs, benchmarks, inventory and lead times are synthetic. No certificates are verified.'}:await validateQuoteForExport(parsed.data.quote);
  const blockers=exportBlockers(quote);if(blockers.length)return Response.json({error:{code:'QUOTE_BLOCKED',message:'Resolve or exclude all blocked lines before export.',details:blockers}},{status:422});
  const bytes=await generateQuotePdf(quote,demo);return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${quote.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf"`,'Cache-Control':'no-store'}});
 }catch(error){const e=error as Error&{code?:string;status?:number};return Response.json({error:{code:e.code??'PDF_FAILED',message:e.code?e.message:'PDF generation failed. Please retry.'}},{status:e.status??500});}
}
