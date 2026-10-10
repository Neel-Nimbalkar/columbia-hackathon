/**
 * Server-owned catalog. Product facts (part numbers, URLs, specs, standards,
 * cert availability, origin, list prices) come from the supplier's own pages
 * — see catalog-data.ts. Stock, cost and lead time are SYNTHETIC seeds.
 */
import type { Material } from './normalize';
import { SOURCED_PRODUCTS, SUPPLIER } from './catalog-data';

export interface SourcedProduct {
  supplierPartNumber: string;
  url: string;
  retrievedDate: string;
  description: string;
  material: Material;
  grade: string;
  temper: string | null;
  form: string;
  finish: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  diameter: number | null;
  gauge: number | null;
  thicknessTolerance: string | null;
  standards: string[];
  certsAvailable: boolean | null;
  certNote: string | null;
  countryOfOrigin: string | null;
  /** Price shown on the supplier page at retrieval (per piece of this size), used as a benchmark. */
  listPrice: { usd: number; unit: 'pc' | 'ft' | 'lb'; synthetic: boolean } | null;
  /** Supplier's cut-length / cut-size tolerance for this option. */
  cutTolerance: string | null;
}

export interface CatalogProduct extends SourcedProduct {
  /** Internal RudCo SKU. */
  sku: string;
  supplier: string;
  /** SYNTHETIC seeds — not live supplier data. */
  costCents: number;
  stock: number;
  leadTimeDays: number;
}

/** Deterministic pseudo-random seed per part number (stable across deploys). */
function seed(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

export const CATALOG: CatalogProduct[] = SOURCED_PRODUCTS.map((p, i) => {
  const r = seed(p.supplierPartNumber);
  // Synthetic distributor cost: 62–72% of the sourced list price when one exists.
  const costCents = p.listPrice ? Math.round(p.listPrice.usd * 100 * (0.62 + r * 0.1)) : Math.round(2500 + r * 20000);
  return {
    ...p,
    sku: `RUD-${String(i + 1).padStart(3, '0')}`,
    supplier: SUPPLIER.name,
    costCents,
    stock: 5 + Math.floor(r * 60),
    leadTimeDays: 2 + Math.floor(r * 6),
  };
});

export const CATALOG_DISCLOSURE = `Catalog: ${new Set(CATALOG.map((p) => p.supplierPartNumber)).size} products (${CATALOG.length} size options) sourced from ${SUPPLIER.name} product pages (${SUPPLIER.site}, retrieved ${SUPPLIER.retrieved}). Part numbers, specifications, standards, certificate availability and list-price benchmarks come from those pages. Stock, cost and lead times are synthetic seeds. Certificate availability does not mean a lot-specific MTR is in hand. Prices in USD, excluding tax and freight.`;
