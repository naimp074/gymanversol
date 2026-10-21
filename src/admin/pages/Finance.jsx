import { useApp, useUi, permissions } from '../context.js';
import { Empty, Metric, Icon } from '../ui.jsx';
import { BarList, ColumnChart, Legend, SERIES, INK, compactMoney } from '../charts.jsx';
import { money, localDay } from '../../lib/format.js';

const monthKey = (today, back) => { const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7); };
const monthLabel = (key, long = false) => new Date(`${key}-15T12:00:00`).toLocaleDateString('es-AR', long ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
const sum = list => list.reduce((s, x) => s + Number(x.amount || 0), 0);
const incomeSeries = [{ key: 'cuotas', label: 'Cuotas', color: SERIES.cuotas }, { key: 'ventas', label: 'Ventas', color: SERIES.ventas }, { key: 'otros', label: 'Otros ingresos', color: SERIES.otros }];

function trend(current, previous) {
  if (!previous) return <span className="muted">Sin datos del período anterior</span>;
  const pct = Math.round((current - previous) / Math.abs(previous) * 100);
  return <><span className={`trend ${pct >= 0 ? 'positive' : 'negative'}`}>{pct >= 0 ? '+' : ''}{pct}%</span><span className="muted"> vs. período anterior</span></>;
}

// Clasifica cada movimiento: las anulaciones de venta restan de ventas, los retiros no son gasto del negocio.
function classify(movements) {
  const out = { cuotas: 0, ventas: 0, otros: 0, gastos: 0, retiros: 0 };
  for (const m of movements) {
    const amount = Number(m.amount) || 0;
    if (m.type === 'ingreso') out[m.category === 'Cuotas' ? 'cuotas' : m.category === 'Ventas' ? 'ventas' : 'otros'] += amount;
    else if (m.type === 'gasto' && m.category === 'Anulación de venta') out.ventas -= amount;
    else if (m.type === 'gasto') out.gastos += amount;
    else out.retiros += amount;
  }
  out.ingresos = out.cuotas + out.ventas + out.otros;
  out.resultado = out.ingresos - out.gastos;
  return out;
}

export default function Finance() {
  const { data, user } = useApp();
  const [months, setMonths] = useUi('financeMonths');
  if (!permissions(user).audit) return <Empty message="Tu perfil no tiene acceso a esta sección." />;

  const keys = Array.from({ length: months }, (_, i) => monthKey(data.today, months - 1 - i));
  const previousKeys = Array.from({ length: months }, (_, i) => monthKey(data.today, 2 * months - 1 - i));
  const byMonth = new Map();
  for (const m of data.movements) { const k = localDay(m.date).slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(m); }
  const inKeys = list => list.flatMap(k => byMonth.get(k) || []);
  const current = classify(inKeys(keys));
  const previous = classify(inKeys(previousKeys));
  const monthly = keys.map(k => ({ key: k, label: monthLabel(k), long: monthLabel(k, true), totals: classify(byMonth.get(k) || []) }));

  const keySet = new Set(keys);
  const inRange = d => keySet.has(localDay(d).slice(0, 7));
  const periodMovements = data.movements.filter(m => inRange(m.date));
  const payments = data.payments.filter(p => inRange(p.date));
  const sales = data.sales.filter(s => !s.voided && inRange(s.date));

  const group = (list, keyOf, valueOf) => {
    const map = new Map();
    for (const item of list) { const k = keyOf(item); const row = map.get(k) || { value: 0, count: 0 }; row.value += valueOf(item); row.count++; map.set(k, row); }
    return [...map].map(([label, row]) => ({ label, ...row })).sort((a, b) => b.value - a.value);
  };
  const byMethod = group(periodMovements.filter(m => m.type === 'ingreso'), m => m.method, m => Number(m.amount)).map(r => ({ ...r, detail: `${r.count} operaciones` }));
  const byExpense = group(periodMovements.filter(m => m.type === 'gasto' && m.category !== 'Anulación de venta'), m => m.category || 'Otros', m => Number(m.amount)).map(r => ({ ...r, detail: `${r.count} gastos` }));
  const byPlan = group(payments, p => data.plans.find(pl => pl.id === p.plan_id)?.name || 'Plan eliminado', p => Number(p.amount)).map(r => ({ ...r, detail: `${r.count} cuotas` }));
  const products = new Map();
  for (const s of sales) for (const item of s.items) { const row = products.get(item.name) || { value: 0, count: 0 }; row.value += Number(item.subtotal) || 0; row.count += Number(item.quantity) || 0; products.set(item.name, row); }
  const byProduct = [...products].map(([label, row]) => ({ label, ...row, detail: `${row.count} unidades` })).sort((a, b) => b.value - a.value).slice(0, 8);

  // Cuotas que vencen en los próximos 30 días, valuadas al precio actual del plan.
  const renewals = data.members.filter(m => m.status === 'activo' && m.days_left <= 30);
  const planPrice = id => { const p = data.plans.find(pl => pl.id === id); return p ? Math.round(p.price * (1 - (Number(p.discount) || 0) / 100)) : 0; };
  const expected = renewals.reduce((s, m) => s + planPrice(m.plan_id), 0);
  const avgTicket = payments.length ? Math.round(sum(payments) / payments.length) : 0;
  const hasData = monthly.some(m => m.totals.ingresos || m.totals.gastos);

  return <>
    <div className="finance-filters" role="group" aria-label="Período">
      {[[3, 'Últimos 3 meses'], [6, 'Últimos 6 meses'], [12, 'Últimos 12 meses']].map(([n, label]) => <button key={n} type="button" className={months === n ? 'selected' : ''} aria-pressed={months === n} onClick={() => setMonths(n)}>{label}</button>)}
      <span className="muted small">{monthLabel(keys[0], true)} — {monthLabel(keys.at(-1), true)}</span>
    </div>

    <section className="stats-grid">
      <Metric label="Ingresos" value={money(current.ingresos)} icon="trending-up" tone="mint" detail={trend(current.ingresos, previous.ingresos)} />
      <Metric label="Gastos" value={money(current.gastos)} icon="trending-down" tone="peach" detail={<span className="muted">Retiros aparte: {money(current.retiros)}</span>} />
      <Metric label="Resultado" value={money(current.resultado)} icon="wallet" tone="blue" detail={trend(current.resultado, previous.resultado)} />
      <Metric label="Renovaciones próximas" value={money(expected)} icon="calendar" tone="lavender" detail={<span className="muted">{renewals.length} cuotas vencen en 30 días · ticket promedio {money(avgTicket)}</span>} />
    </section>

    {!hasData ? <section className="card"><Empty message="Todavía no hay movimientos de caja en este período." /></section> : <>
      <section className="card">
        <div className="card-head"><div><h2>Ingresos por mes</h2><p className="muted">Cuotas, ventas y otros ingresos registrados en caja. Las ventas anuladas se descuentan.</p></div></div>
        <Legend series={incomeSeries} totals={current} format={money} />
        <ColumnChart label="Ingresos por mes, apilados por origen" data={monthly.map(m => ({ key: m.key, label: m.label, long: m.long, values: { cuotas: m.totals.cuotas, ventas: m.totals.ventas, otros: m.totals.otros } }))} series={incomeSeries} format={money} axisFormat={compactMoney} />
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Resultado mensual</h2><p className="muted">Ingresos menos gastos de cada mes. Debajo de la línea, el mes dio pérdida. No incluye retiros.</p></div></div>
        <ColumnChart label="Resultado mensual" data={monthly.map(m => ({ key: m.key, label: m.label, long: m.long, values: { resultado: m.totals.resultado } }))} series={[{ key: 'resultado', label: 'Resultado', color: INK }]} format={money} axisFormat={compactMoney} />
      </section>

      <div className="grid-2">
        <section className="card"><div className="card-head"><div><h2>Ingresos por medio de pago</h2><p className="muted">Total del período</p></div><Icon name="card" /></div><BarList items={byMethod} format={money} /></section>
        <section className="card"><div className="card-head"><div><h2>Gastos por categoría</h2><p className="muted">Total del período</p></div><Icon name="trending-down" /></div><BarList items={byExpense} format={money} empty="No hay gastos registrados en el período." /></section>
      </div>
      <div className="grid-2">
        <section className="card"><div className="card-head"><div><h2>Cuotas por plan</h2><p className="muted">Lo cobrado en cada membresía</p></div><Icon name="layers" /></div><BarList items={byPlan} format={money} empty="No hay cuotas cobradas en el período." /></section>
        <section className="card"><div className="card-head"><div><h2>Productos más vendidos</h2><p className="muted">Por facturación</p></div><Icon name="cart" /></div><BarList items={byProduct} format={money} empty="No hay ventas en el período." /></section>
      </div>
    </>}
  </>;
}
