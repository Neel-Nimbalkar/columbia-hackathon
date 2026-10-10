'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, ExternalLink, Loader2, Plus, Search } from 'lucide-react';
import { fetchCatalog, type CatalogItem } from '@/lib/client/api';
import { marginPriceCents, percentToMargin } from '@/lib/shared/pricing';
import { money, pct, titleCase } from '@/lib/client/format';
import { Empty, Message, Modal, PageHeader } from './ui';

type Sort = 'product' | 'stock' | 'price' | 'headroom' | 'lead';

const inch = (v: number) => `${Math.round(v * 10_000) / 10_000}"`;

export function catalogSize(p: CatalogItem): string {
  if (p.form === 'round bar') return `${inch(p.diameter!)} dia × ${inch(p.length!)}`;
  if (p.form === 'tube') return `${inch(p.diameter!)} OD × ${inch(p.thickness!)} wall × ${inch(p.length!)}`;
  return [p.gauge ? `${p.gauge} ga (${inch(p.thickness!)})` : p.thickness !== null ? inch(p.thickness) : null, p.width !== null ? inch(p.width) : null, p.length !== null ? inch(p.length) : null].filter(Boolean).join(' × ');
}

export const catalogName = (p: CatalogItem) => `${p.grade}${p.temper ? `-${p.temper}` : ''} ${p.material} ${p.form}`;

/** An RFQ line that names everything needed for an exact match. */
function rfqLine(p: CatalogItem, qty: number): string {
  const size = catalogSize(p).replace(/×/g, 'x');
  return `${qty} pcs ${catalogName(p)}, ${size}${p.finish ? `, ${p.finish} finish` : ''}`;
}

const priceAt = (cost: number, margin: number) => marginPriceCents(Math.round(cost * 100), margin) / 100;

export function Catalog({ onAddToRfq, draftLines, onGoToDraft }: { onAddToRfq: (line: string) => void; draftLines: number; onGoToDraft: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchCatalog>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [material, setMaterial] = useState('');
  const [form, setForm] = useState('');
  const [inStock, setInStock] = useState(false);
  const [margin, setMargin] = useState('20');
  const [sort, setSort] = useState<{ key: Sort; dir: 1 | -1 }>({ key: 'product', dir: 1 });
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const load = () => { setError(null); fetchCatalog().then(setData, (e: Error) => setError(e.message)); };
  useEffect(load, []);

  const marginValid = margin.trim() !== '' && Number.isFinite(Number(margin)) && Number(margin) >= 0 && Number(margin) <= 80;
  const m = marginValid ? percentToMargin(Number(margin)) : .2;
  const rows = useMemo(() => {
    if (!data) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = data.products.filter((p) => {
      if (material && p.material !== material) return false;
      if (form && p.form !== form) return false;
      if (inStock && p.stock <= 0) return false;
      const hay = `${p.sku} ${p.supplierPartNumber} ${catalogName(p)} ${p.finish ?? ''} ${catalogSize(p)} ${p.standards.join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const val = (p: CatalogItem): number | string => {
      const price = priceAt(p.cost, m);
      switch (sort.key) {
        case 'stock': return p.stock;
        case 'price': return price;
        case 'lead': return p.leadTimeDays;
        case 'headroom': return p.listPrice?.unit === 'pc' ? p.listPrice.usd - price : -Infinity;
        default: return `${catalogName(p)} ${(p.thickness ?? p.diameter ?? 0).toFixed(4).padStart(12, '0')} ${(p.length ?? 0).toFixed(4).padStart(12, '0')}`;
      }
    };
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [data, query, material, form, inStock, sort, m]);

  const head = (key: Sort, label: string, num = false) => (
    <th className={num ? 'num' : ''}>
      <button className="sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'product' ? 1 : -1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Catalog & stock"
        subtitle={data ? `${new Set(data.products.map((p) => p.supplierPartNumber)).size} products, ${data.products.length} sizes from ${data.supplier.name} (retrieved ${data.supplier.retrieved}). Stock, cost and lead time are synthetic.` : 'Loading catalog…'}
        actions={draftLines > 0 ? <button className="button secondary" onClick={onGoToDraft}>RFQ draft · {draftLines} line{draftLines === 1 ? '' : 's'}<ArrowRight size={14} /></button> : undefined}
      />
      {error && <Message tone="error">{error} <button className="link" onClick={load}>Retry</button></Message>}
      {!data && !error && <section className="card"><Empty icon={<Loader2 size={20} className="spin" />} title="Loading catalog" /></section>}
      {!marginValid && <Message tone="warning">Enter a margin from 0 to 80%. Price previews use 20% until corrected.</Message>}
      {data && (
        <section className="card">
          <div className="card-head table-tools">
            <div className="filters">
              <label className="search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search grade, size, part #, standard…" aria-label="Search catalog" /></label>
              <select aria-label="Material" value={material} onChange={(e) => setMaterial(e.target.value)}>
                <option value="">All materials</option>
                {[...new Set(data.products.map((p) => p.material))].sort().map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
              </select>
              <select aria-label="Form" value={form} onChange={(e) => setForm(e.target.value)}>
                <option value="">All forms</option>
                {[...new Set(data.products.map((p) => p.form))].sort().map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
              </select>
              <label className="toggle"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />In stock</label>
            </div>
            <label className="inline-field">Price at
              <span className="input-suffix small"><input type="number" min={0} max={80} value={margin} onChange={(e) => setMargin(e.target.value)} aria-label="Margin for price column" /><span>%</span></span>
              margin
            </label>
          </div>
          <div className="table-wrap">
            <table className="catalog">
              <thead>
                <tr>
                  {head('product', 'Product')}<th>Size</th>{head('stock', 'Stock', true)}{head('lead', 'Lead', true)}<th className="num">Cost</th>{head('price', 'Price', true)}<th className="num">List</th>{head('headroom', 'Headroom', true)}<th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const price = priceAt(p.cost, m);
                  const list = p.listPrice?.unit === 'pc' ? p.listPrice.usd : null;
                  return (
                    <tr key={p.sku} onClick={() => setSelected(p)}>
                      <td><button className="row-button" onClick={(e) => { e.stopPropagation(); setSelected(p); }}><strong>{titleCase(catalogName(p))}</strong><small>{p.sku} · {p.supplierPartNumber}{p.finish ? ` · ${p.finish}` : ''}</small></button></td>
                      <td>{catalogSize(p)}</td>
                      <td className={`num ${p.stock < 15 ? 'text-amber' : ''}`}>{p.stock}</td>
                      <td className="num">{p.leadTimeDays} d</td>
                      <td className="num muted">{money(p.cost)}</td>
                      <td className="num"><strong>{money(price)}</strong></td>
                      <td className="num">{list === null ? '—' : money(list)}</td>
                      <td className={`num ${list !== null && list < price ? 'text-amber' : ''}`}>{list === null ? '—' : `${list >= price ? '+' : '−'}${money(Math.abs(list - price))}`}</td>
                      <td><button className="icon-button" aria-label={`Add ${p.sku} to RFQ`} title="Add to RFQ draft" onClick={(e) => { e.stopPropagation(); onAddToRfq(rfqLine(p, 1)); }}><Plus size={15} /></button></td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={9}><Empty icon={<Boxes size={20} />} title="No products match">Try a different grade or size.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted table-foot">Price = cost ÷ (1 − margin), rounded up to the cent — the same rule as quotes. Headroom is the list price minus our price; negative means we would be above the supplier's list price.</p>
        </section>
      )}
      {selected && <ProductDetail p={selected} onClose={() => setSelected(null)} onAdd={(qty) => { onAddToRfq(rfqLine(selected, qty)); setSelected(null); }} />}
    </>
  );
}

function ProductDetail({ p, onClose, onAdd }: { p: CatalogItem; onClose: () => void; onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState('1');
  const q = Number(qty);
  const list = p.listPrice?.unit === 'pc' ? p.listPrice.usd : null;
  const breakEven = list ? 1 - p.cost / list : null;
  return (
    <Modal title={titleCase(catalogName(p))} onClose={onClose} wide footer={<>
      <label className="inline-field">Qty<input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} /></label>
      {Number.isInteger(q) && q > p.stock && <span className="text-amber">Only {p.stock} in stock</span>}
      <button className="button primary" disabled={!Number.isInteger(q) || q < 1} onClick={() => onAdd(q)}><Plus size={14} />Add to RFQ draft</button>
    </>}>
      <dl className="spec-grid">
        <div><dt>SKU</dt><dd>{p.sku}</dd></div>
        <div><dt>Supplier part</dt><dd>{p.supplierPartNumber}</dd></div>
        <div><dt>Size</dt><dd>{catalogSize(p)}</dd></div>
        <div><dt>Finish</dt><dd>{p.finish ?? 'Not documented'}</dd></div>
        <div><dt>Stock</dt><dd>{p.stock} pc <small className="prov">synthetic</small></dd></div>
        <div><dt>Lead time</dt><dd>{p.leadTimeDays} business days</dd></div>
        <div><dt>Standards</dt><dd>{p.standards.join(', ') || 'None listed'}</dd></div>
        <div><dt>Certs / MTR</dt><dd>{p.certsAvailable ? 'Offered by supplier' : 'Not documented'}</dd></div>
        <div><dt>Origin</dt><dd>{p.countryOfOrigin ?? 'Not documented'}</dd></div>
      </dl>
      <h3 className="sub">Price ladder</h3>
      <table className="data-table">
        <thead><tr><th>Margin</th><th className="num">Unit price</th>{Number.isInteger(q) && q > 1 && <th className="num">× {q}</th>}<th className="num">vs list</th></tr></thead>
        <tbody>
          {[0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4].map((mm) => {
            const price = priceAt(p.cost, mm);
            return (
              <tr key={mm}>
                <td>{pct(mm, 0)}</td>
                <td className="num">{money(price)}</td>
                {Number.isInteger(q) && q > 1 && <td className="num">{money(price * q)}</td>}
                <td className={`num ${list !== null && price > list ? 'text-amber' : ''}`}>{list === null ? '—' : price > list ? `${money(price - list)} above` : `${money(list - price)} below`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small-note">
        Cost {money(p.cost)} (synthetic). {list !== null ? `List ${money(list)} (retrieved ${p.retrievedDate}); margins up to ${pct(breakEven!)} stay at or below list.` : 'No per-piece list price to compare.'}{' '}
        <a className="link" href={p.url} target="_blank" rel="noreferrer">Supplier page <ExternalLink size={11} /></a>
      </p>
    </Modal>
  );
}
