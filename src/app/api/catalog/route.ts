import { CATALOG, CATALOG_DISCLOSURE } from '@/lib/server/catalog';
import { SUPPLIER } from '@/lib/server/catalog-data';

export const runtime = 'nodejs';

/** GET → the server-owned catalog (sourced specs + synthetic stock/cost/lead time) for the catalog browser. */
export async function GET(): Promise<Response> {
  const products = CATALOG.map((p) => ({
    sku: p.sku,
    supplierPartNumber: p.supplierPartNumber,
    description: p.description,
    url: p.url,
    material: p.material,
    grade: p.grade,
    temper: p.temper,
    form: p.form,
    finish: p.finish,
    thickness: p.thickness,
    width: p.width,
    length: p.length,
    diameter: p.diameter,
    gauge: p.gauge,
    standards: p.standards,
    certsAvailable: p.certsAvailable,
    countryOfOrigin: p.countryOfOrigin,
    listPrice: p.listPrice,
    retrievedDate: p.retrievedDate,
    cost: p.costCents / 100,
    stock: p.stock,
    leadTimeDays: p.leadTimeDays,
  }));
  return Response.json({ supplier: SUPPLIER, disclosure: CATALOG_DISCLOSURE, products }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
