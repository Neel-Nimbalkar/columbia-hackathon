import { z } from 'zod';
const text = z.string().max(1000).nullable();
const dim = z.number().positive().max(100000).nullable();
export const specSchema = z.object({material:text,grade:text,form:text,thickness:dim,width:dim,length:dim,diameter:dim,dimensionUnit:z.enum(['in','mm','ft']).nullable(),gauge:z.number().int().min(1).max(40).nullable(),quantity:dim,quantityUnit:text,temper:text,finish:text,standards:z.array(z.string().max(100)).max(20),certifications:z.array(z.string().max(100)).max(20),mtr:z.boolean().nullable(),countryOfOrigin:text,tolerance:dim});
export type Spec = z.infer<typeof specSchema>;
export const extractedItemSchema = z.object({id:z.string().max(100),original:z.string().max(8000),source:z.string().max(200),spec:specSchema,conflicts:z.array(z.string().max(1000)).max(30),provenance:z.record(z.string(),z.enum(['customer','normalized','suggestion'])),included:z.boolean().default(true),
/** TypeSafe Jev typed classification of the line, when available. */
classification:z.object({material:z.string().nullable(),form:z.string().nullable(),risk:z.string(),confidence:z.number().min(0).max(1),model:z.string()}).nullable().optional()});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type Compliance = {requirement:string;status:'verified'|'pending'|'missing'|'not_requested';evidence:string};
export type Product = {sku:string;supplierId:string;description:string;spec:Spec;stock:number;cost:number;unit:string;leadTime:string;sourceUrl:string;sourceDate:string;mtrAvailable:boolean;standards:string[];certifications:string[];origin:string|null;benchmark:{price:number;unit:string;date:string;source:string;synthetic:true}|null};
export type Pricing = {cost:number;unitPrice:number;lineTotal:number;margin:number;benchmark:number|null;benchmarkDate:string|null;benchmarkSource:string|null;benchmarkStatus:string;unit:string;explanation:string;competitive:boolean|null};
export type QuoteItem = ExtractedItem & {normalized:Spec;status:'Ready'|'Matched'|'Needs Clarification'|'Compliance Pending'|'No Match';matchedSku:string|null;alternatives:{sku:string;reason:string}[];matchExplanation:string[];compliance:Compliance[];questions:string[];blockers:string[];pricing:Pricing|null;leadTime:string|null};
export const quoteInputSchema = z.object({id:z.string().max(100),customer:z.string().max(200),
/** The buyer's own RFQ / solicitation number, when the document states one. */
rfqReference:z.string().max(200).nullable().optional(),date:z.string().max(40),expires:z.string().max(40),originalText:z.string().max(100000),targetMargin:z.number().min(0).max(0.8),items:z.array(extractedItemSchema).min(1).max(100)});
export type Quote = Omit<z.infer<typeof quoteInputSchema>,'items'> & {items:QuoteItem[];total:number;ready:boolean;warnings:string[];provider:{extraction:string;classification:string};disclosure:string};
export const emptySpec:Spec={material:null,grade:null,form:null,thickness:null,width:null,length:null,diameter:null,dimensionUnit:null,gauge:null,quantity:null,quantityUnit:null,temper:null,finish:null,standards:[],certifications:[],mtr:null,countryOfOrigin:null,tolerance:null};
export type ApiError = {error:{code:string;message:string;details?:unknown}};
const complianceSchema=z.object({requirement:z.string().max(200),status:z.enum(['verified','pending','missing','not_requested']),evidence:z.string().max(2000)});
const pricingSchema=z.object({cost:z.number().nonnegative(),unitPrice:z.number().nonnegative(),lineTotal:z.number().nonnegative(),margin:z.number().min(0).max(1),benchmark:z.number().nonnegative().nullable(),benchmarkDate:z.string().nullable(),benchmarkSource:z.string().nullable(),benchmarkStatus:z.string(),unit:z.string(),explanation:z.string().max(2000),competitive:z.boolean().nullable()});
/** `normalized` must state its dimension unit explicitly; a unit-less customer value stays in `spec` and becomes a question. */
export const normalizedSpecSchema=specSchema.refine(s=>s.dimensionUnit!==null||[s.thickness,s.width,s.length,s.diameter,s.tolerance].every(v=>v===null),{message:'Normalized dimensions require an explicit dimensionUnit.',path:['dimensionUnit']});
export const quoteItemSchema=extractedItemSchema.extend({normalized:normalizedSpecSchema,status:z.enum(['Ready','Matched','Needs Clarification','Compliance Pending','No Match']),matchedSku:z.string().nullable(),alternatives:z.array(z.object({sku:z.string(),reason:z.string()})),matchExplanation:z.array(z.string()),compliance:z.array(complianceSchema),questions:z.array(z.string()),blockers:z.array(z.string()),pricing:pricingSchema.nullable(),leadTime:z.string().nullable()});
export const quoteSchema=quoteInputSchema.extend({items:z.array(quoteItemSchema).min(1).max(100),total:z.number().nonnegative(),ready:z.boolean(),warnings:z.array(z.string()),provider:z.object({extraction:z.string(),classification:z.string()}),disclosure:z.string()});
export const clarifyRequestSchema=z.object({quote:quoteSchema,itemId:z.string(),response:z.string().max(8000).optional(),corrections:specSchema.optional(),included:z.boolean().optional(),targetMargin:z.number().min(0).max(.8).optional()});
