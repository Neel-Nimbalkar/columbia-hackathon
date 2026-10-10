'use client';
import { useState } from 'react';
import { DENSITIES, GAUGE_TABLES, MM_PER_IN, SHAPES, crossSection, nearestFraction, parseFraction, type Shape } from '@/lib/shared/metals';
import { marginPriceCents, percentToMargin } from '@/lib/shared/pricing';
import { money, pct } from '@/lib/client/format';
import { PageHeader, Segmented } from './ui';

type Tab = 'weight' | 'gauge' | 'units' | 'margin';
const LB_PER_KG = 2.20462;
const r = (n: number, d = 4) => `${Math.round(n * 10 ** d) / 10 ** d}`;

export function Calculator() {
  const [tab, setTab] = useState<Tab>('weight');
  return (
    <>
      <PageHeader
        title="Calculator"
        subtitle="Shop-floor math for quoting: weight and freight, gauge to decimal, fractions and millimeters, margin versus markup."
        actions={<Segmented label="Calculator" value={tab} onChange={setTab} options={[{ value: 'weight', label: 'Weight & price' }, { value: 'gauge', label: 'Gauge' }, { value: 'units', label: 'Fractions & mm' }, { value: 'margin', label: 'Margin' }]} />}
      />
      {tab === 'weight' && <Weight />}
      {tab === 'gauge' && <Gauge />}
      {tab === 'units' && <Units />}
      {tab === 'margin' && <Margin />}
    </>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="calc-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Weight() {
  const [material, setMaterial] = useState('cs');
  const [shape, setShape] = useState<Shape>('sheet');
  const [unit, setUnit] = useState<'in' | 'mm'>('in');
  const [dims, setDims] = useState<Record<string, string>>({ t: '1/4', w: '12', d: '1', a: '1', h: '2' });
  const [length, setLength] = useState('24');
  const [lengthUnit, setLengthUnit] = useState<'in' | 'ft' | 'mm' | 'm'>('in');
  const [qty, setQty] = useState('1');
  const [priceMode, setPriceMode] = useState<'lb' | 'pc'>('lb');
  const [price, setPrice] = useState('');

  const density = DENSITIES.find((d) => d.id === material)!;
  const def = SHAPES.find((s) => s.id === shape)!;
  const toIn = (v: number) => (unit === 'mm' ? v / MM_PER_IN : v);
  const values: Record<string, number> = {};
  const missing: string[] = [];
  for (const d of def.dims) {
    const v = parseFraction(dims[d.key] ?? '');
    if (v === null) missing.push(d.label); else values[d.key] = toIn(v);
  }
  const lenRaw = parseFraction(length);
  const lenIn = lenRaw === null ? null : lengthUnit === 'in' ? lenRaw : lengthUnit === 'ft' ? lenRaw * 12 : lengthUnit === 'mm' ? lenRaw / MM_PER_IN : (lenRaw * 1000) / MM_PER_IN;
  const area = missing.length ? null : crossSection(shape, values);
  const q = Number(qty);
  const quantityValid = qty.trim() !== '' && Number.isSafeInteger(q) && q > 0;
  const each = area !== null && lenIn !== null ? area * lenIn * density.lbPerIn3 : null;
  const perFt = area !== null ? area * 12 * density.lbPerIn3 : null;
  const p = Number(price);
  const priceOk = price.trim() !== '' && Number.isFinite(p) && p > 0;

  return (
    <div className="calc">
      <section className="card calc-inputs">
        <div className="calc-grid">
          <Field label="Material"><select value={material} onChange={(e) => setMaterial(e.target.value)}>{DENSITIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
          <Field label="Shape"><select value={shape} onChange={(e) => setShape(e.target.value as Shape)}>{SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Field label="Section units"><select value={unit} onChange={(e) => setUnit(e.target.value as 'in' | 'mm')}><option value="in">inches</option><option value="mm">millimeters</option></select></Field>
          {def.dims.map((d) => (
            <Field key={d.key} label={d.label} hint={unit === 'in' ? 'Fractions OK: 1-1/2, 3/16' : undefined}>
              <input value={dims[d.key] ?? ''} onChange={(e) => setDims({ ...dims, [d.key]: e.target.value })} inputMode="decimal" />
            </Field>
          ))}
          <Field label="Length">
            <span className="input-pair">
              <input value={length} onChange={(e) => setLength(e.target.value)} inputMode="decimal" />
              <select value={lengthUnit} onChange={(e) => setLengthUnit(e.target.value as typeof lengthUnit)}><option value="in">in</option><option value="ft">ft</option><option value="mm">mm</option><option value="m">m</option></select>
            </span>
          </Field>
          <Field label="Quantity"><input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        </div>
      </section>
      <section className="card calc-out">
        {each === null || !quantityValid ? (
          <p className="muted">{!quantityValid ? 'Enter a positive whole quantity.' : missing.length ? `Enter ${missing.join(', ').toLowerCase()}.` : lenIn === null ? 'Enter a length.' : 'Those dimensions are not a valid section (e.g. wall thicker than half the width).'}</p>
        ) : (
          <>
            <div className="result-hero"><span>Total weight</span><strong>{r(each * q, 2)} lb</strong><small>{r((each * q) / LB_PER_KG, 2)} kg · {q} pc</small></div>
            <dl className="result-list">
              <div><dt>Per piece</dt><dd>{r(each, 3)} lb · {r(each / LB_PER_KG, 3)} kg</dd></div>
              <div><dt>Per foot</dt><dd>{r(perFt!, 3)} lb/ft</dd></div>
              <div><dt>Cross-section</dt><dd>{r(area!, 4)} in²</dd></div>
              <div><dt>Density</dt><dd>{density.lbPerIn3} lb/in³</dd></div>
            </dl>
            <div className="price-convert">
              <Segmented label="Price basis" value={priceMode} onChange={setPriceMode} options={[{ value: 'lb', label: '$ per lb' }, { value: 'pc', label: '$ per piece' }]} />
              <span className="input-suffix small"><span>$</span><input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price" placeholder="0.00" /></span>
              {priceOk && (
                <dl className="result-list">
                  {priceMode === 'lb'
                    ? <><div><dt>Per piece</dt><dd>{money(p * each)}</dd></div><div><dt>Per foot</dt><dd>{money(p * perFt!)}</dd></div><div><dt>Line ({q} pc)</dt><dd>{money(p * each * q)}</dd></div></>
                    : <><div><dt>Per lb</dt><dd>{money(p / each)}</dd></div><div><dt>Per foot</dt><dd>{money((p / each) * perFt!)}</dd></div><div><dt>Line ({q} pc)</dt><dd>{money(p * q)}</dd></div></>}
                </dl>
              )}
            </div>
          </>
        )}
        <p className="muted small-note">Nominal density; mill tolerances and corner radii change actual weight by a few percent.</p>
      </section>
    </div>
  );
}

function Gauge() {
  const [family, setFamily] = useState<keyof typeof GAUGE_TABLES>('carbon steel');
  const [thick, setThick] = useState('');
  const [thickUnit, setThickUnit] = useState<'in' | 'mm'>('in');
  const table = GAUGE_TABLES[family];
  const t = parseFraction(thick);
  const tin = t === null ? null : thickUnit === 'mm' ? t / MM_PER_IN : t;
  const entries = Object.entries(table.table).map(([g, v]) => ({ g: Number(g), v }));
  const nearest = tin === null ? null : entries.reduce((best, e) => (Math.abs(e.v - tin) < Math.abs(best.v - tin) ? e : best));
  return (
    <div className="calc">
      <section className="card calc-inputs">
        <div className="calc-grid">
          <Field label="Material"><select value={family} onChange={(e) => setFamily(e.target.value as typeof family)}>{Object.keys(GAUGE_TABLES).map((k) => <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>)}</select></Field>
          <Field label="Find gauge for a thickness">
            <span className="input-pair"><input value={thick} onChange={(e) => setThick(e.target.value)} placeholder='e.g. .060 or 1/16' inputMode="decimal" /><select value={thickUnit} onChange={(e) => setThickUnit(e.target.value as 'in' | 'mm')}><option value="in">in</option><option value="mm">mm</option></select></span>
          </Field>
        </div>
        {nearest && tin !== null && (
          <p className="calc-answer">Nearest: <strong>{nearest.g} ga</strong> = {nearest.v}" ({r(nearest.v * MM_PER_IN, 2)} mm), {Math.abs(nearest.v - tin) < 0.0015 ? 'a match' : `${r(Math.abs(nearest.v - tin), 4)}" ${nearest.v > tin ? 'thicker' : 'thinner'}`}.</p>
        )}
        <p className="muted small-note">{table.name}. The same gauge number is a different thickness in steel, stainless and aluminum — always confirm the decimal with the buyer.</p>
      </section>
      <section className="card">
        <table className="data-table gauge-table">
          <thead><tr><th>Gauge</th><th className="num">Inches</th><th className="num">mm</th>{(Object.keys(GAUGE_TABLES) as (keyof typeof GAUGE_TABLES)[]).filter((k) => k !== family).map((k) => <th key={k} className="num muted">{k}</th>)}</tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.g} className={nearest?.g === e.g ? 'selected' : ''}>
                <td>{e.g} ga</td><td className="num">{e.v}</td><td className="num">{r(e.v * MM_PER_IN, 2)}</td>
                {(Object.keys(GAUGE_TABLES) as (keyof typeof GAUGE_TABLES)[]).filter((k) => k !== family).map((k) => <td key={k} className="num muted">{GAUGE_TABLES[k].table[e.g] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Units() {
  const [value, setValue] = useState('1-3/16');
  const [unit, setUnit] = useState<'in' | 'mm' | 'ft'>('in');
  const v = parseFraction(value);
  const inches = v === null ? null : unit === 'in' ? v : unit === 'mm' ? v / MM_PER_IN : v * 12;
  const frac = inches === null ? null : nearestFraction(inches);
  return (
    <div className="calc">
      <section className="card calc-inputs">
        <div className="calc-grid">
          <Field label="Value" hint="Decimal or fraction: .1875, 3/16, 1-1/2">
            <span className="input-pair"><input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" /><select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}><option value="in">in</option><option value="mm">mm</option><option value="ft">ft</option></select></span>
          </Field>
        </div>
      </section>
      <section className="card calc-out">
        {inches === null ? <p className="muted">Enter a positive number or fraction.</p> : (
          <dl className="result-list big">
            <div><dt>Decimal inches</dt><dd>{r(inches, 4)}"</dd></div>
            <div><dt>Nearest fraction (1/64)</dt><dd>{frac!.text}"{Math.abs(frac!.error) > 1e-9 && <small> {frac!.error > 0 ? '+' : '−'}{r(Math.abs(frac!.error), 4)}"</small>}</dd></div>
            <div><dt>Millimeters</dt><dd>{r(inches * MM_PER_IN, 3)} mm</dd></div>
            <div><dt>Feet</dt><dd>{r(inches / 12, 4)} ft</dd></div>
          </dl>
        )}
      </section>
    </div>
  );
}

function Margin() {
  const [cost, setCost] = useState('100');
  const [mode, setMode] = useState<'margin' | 'markup' | 'price'>('margin');
  const [input, setInput] = useState('20');
  const [bench, setBench] = useState('');
  const c = Number(cost), x = Number(input), b = Number(bench);
  const valid = cost.trim() !== '' && input.trim() !== '' && Number.isFinite(c) && c > 0 && c <= 1e9 && Number.isFinite(x) && x >= 0 && (mode !== 'margin' || x < 100);
  let price: number | null = null;
  if (valid) {
    try { price = mode === 'margin' ? marginPriceCents(Math.round(c * 100), percentToMargin(x)) / 100 : mode === 'markup' ? Math.round(c * (1 + x / 100) * 100) / 100 : x; } catch { price = null; }
    if (price !== null && (!Number.isFinite(price) || !Number.isSafeInteger(Math.round(price * 100)))) price = null;
  }
  const margin = price ? (price - c) / price : null;
  const markup = price ? (price - c) / c : null;
  return (
    <div className="calc">
      <section className="card calc-inputs">
        <div className="calc-grid">
          <Field label="Unit cost ($)"><input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          <Field label="Solve from"><Segmented label="Solve from" value={mode} onChange={setMode} options={[{ value: 'margin', label: 'Margin %' }, { value: 'markup', label: 'Markup %' }, { value: 'price', label: 'Price $' }]} /></Field>
          <Field label={mode === 'price' ? 'Selling price ($)' : `${mode === 'margin' ? 'Gross margin' : 'Markup'} (%)`}><input type="number" min={0} step="0.1" value={input} onChange={(e) => setInput(e.target.value)} /></Field>
          <Field label="Benchmark price ($, optional)"><input type="number" min={0} step="0.01" value={bench} onChange={(e) => setBench(e.target.value)} /></Field>
        </div>
      </section>
      <section className="card calc-out">
        {price === null || margin === null ? <p className="muted">Enter a cost above zero{mode === 'margin' ? ' and a margin below 100%' : ''}.</p> : (
          <>
            <div className="result-hero"><span>Selling price</span><strong>{money(price)}</strong><small>{pct(margin)} margin · {pct(markup!)} markup</small></div>
            <dl className="result-list">
              <div><dt>Gross profit</dt><dd>{money(price - c)}</dd></div>
              {bench.trim() !== '' && Number.isFinite(b) && b > 0 && <>
                <div><dt>vs benchmark</dt><dd className={price > b ? 'text-amber' : 'text-green'}>{price > b ? `${money(price - b)} above` : `${money(b - price)} below`}</dd></div>
                <div><dt>Max margin at benchmark</dt><dd>{b >= c ? pct(1 - c / b) : 'Cost is above benchmark'}</dd></div>
              </>}
            </dl>
            <p className="muted small-note">Margin is profit ÷ price; markup is profit ÷ cost. A 20% margin is a 25% markup. Quotes use margin, rounded up to the cent so the floor is never undercut.</p>
          </>
        )}
      </section>
    </div>
  );
}
