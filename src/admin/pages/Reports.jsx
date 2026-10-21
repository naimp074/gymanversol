import { useState } from 'react';
import { useApp, useUi, permissions } from '../context.js';
import { Button, Empty, Heading, Stat, Table } from '../ui.jsx';
import { memberName } from './Classes.jsx';
import { exportCsv } from '../exports.js';
import { money, date, time, localDay, addDays } from '../../lib/format.js';

const total = list => list.reduce((sum, item) => sum + Number(item.amount || 0), 0);
const byNewest = list => [...list].sort((a, b) => (b.date || b.created_at || '').localeCompare(a.date || a.created_at || ''));
const reportOptions = [{ value: 'movements', label: 'Caja: ingresos, gastos y retiros' }, { value: 'payments', label: 'Cuotas cobradas' }, { value: 'sales', label: 'Ventas' }, { value: 'checkins', label: 'Asistencia' }, { value: 'members', label: 'Socios · padrón completo' }, { value: 'products', label: 'Productos · stock actual' }];

export default function Reports() {
  const app = useApp();
  const { data, user } = app;
  const [range, setRange] = useUi('reportRange');
  const [type, setType] = useUi('reportType');
  const from = range?.from || `${data.today.slice(0, 7)}-01`;
  const to = range?.to || data.today;
  const [draft, setDraft] = useState({ from, to, type });
  if (!permissions(user).finance) return <Empty message="Tu perfil no tiene acceso a esta sección." />;

  const inRange = value => { const day = localDay(value); return day >= from && day <= to; };
  const movements = data.movements.filter(m => inRange(m.date));
  const payments = data.payments.filter(p => inRange(p.date));
  const sales = data.sales.filter(s => inRange(s.date) && !s.voided);
  const checkins = data.checkins.filter(c => c.allowed && inRange(c.date));
  const income = total(movements.filter(m => m.type === 'ingreso'));
  const expenses = total(movements.filter(m => m.type === 'gasto'));
  const newMembers = data.members.filter(m => inRange(m.joined_at || m.created_at));
  const expired = data.members.filter(m => m.status === 'vencido');

  let headers, rows;
  if (type === 'payments') { headers = ['Fecha', 'Socio', 'Plan', 'Medio', 'Importe']; rows = byNewest(payments).map(p => <tr key={p.id}><td>{date(p.date)}</td><td>{memberName(data, p.member_id)}</td><td>{data.plans.find(plan => plan.id === p.plan_id)?.name || 'Plan'}</td><td>{p.method}</td><td>{money(p.amount)}</td></tr>); }
  else if (type === 'sales') { headers = ['Fecha', 'Productos', 'Medio', 'Total']; rows = byNewest(sales).map(s => <tr key={s.id}><td>{date(s.date)}</td><td>{s.items.map(i => `${i.quantity} × ${i.name || 'Producto'}`).join(', ')}</td><td>{s.method}</td><td>{money(s.total)}</td></tr>); }
  else if (type === 'checkins') { headers = ['Fecha', 'Socio', 'Ingreso', 'Salida']; rows = byNewest(checkins).map(c => <tr key={c.id}><td>{date(c.date)}</td><td>{memberName(data, c.member_id)}</td><td>{time(c.date)}</td><td>{c.checkout_at ? time(c.checkout_at) : '—'}</td></tr>); }
  else if (type === 'members') { headers = ['Socio', 'DNI', 'Plan', 'Vencimiento', 'Estado']; rows = data.members.map(m => <tr key={m.id}><td>{m.name}</td><td>{m.dni}</td><td>{m.plan_name || 'Sin plan'}</td><td>{date(m.expires_at)}</td><td>{m.status}</td></tr>); }
  else if (type === 'products') { headers = ['Producto', 'Categoría', 'Precio', 'Stock', 'Mínimo']; rows = data.products.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.category || 'General'}</td><td>{money(p.price)}</td><td>{p.stock}</td><td>{p.min_stock || 0}</td></tr>); }
  else { headers = ['Fecha', 'Tipo', 'Descripción', 'Medio', 'Importe']; rows = byNewest(movements).map(m => <tr key={m.id}><td>{date(m.date)}</td><td>{m.type}</td><td>{m.description}</td><td>{m.method}</td><td>{m.type === 'ingreso' ? '+' : '−'} {money(m.amount)}</td></tr>); }

  function apply() {
    if (!draft.from || !draft.to || draft.from > draft.to) { app.toast('Ingresá un rango de fechas válido.', 'error'); return; }
    setRange({ from: draft.from, to: draft.to });
    setType(draft.type);
  }
  function period(kind) {
    const day = data.today;
    const start = kind === 'today' ? day : kind === 'year' ? `${day.slice(0, 4)}-01-01` : kind === 'week' ? addDays(day, -6) : `${day.slice(0, 7)}-01`;
    setRange({ from: start, to: day });
    setDraft({ ...draft, from: start, to: day });
  }

  return <>
    <Heading title="Los números de tu gimnasio" sub="Elegí un período para revisar actividad y resultados." actions={<>
      <Button icon="download" onClick={() => exportCsv(app, type, { from, to })}>CSV para Excel</Button>
      <Button className="btn-primary" icon="printer" onClick={() => window.print()}>Imprimir / guardar PDF</Button>
    </>} />
    <div className="card no-print">
      <div className="report-filters">
        <label className="field"><span>Desde</span><input type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="field"><span>Hasta</span><input type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <label className="field"><span>Reporte</span><select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{reportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <Button className="btn-primary" onClick={apply}>Aplicar</Button>
      </div>
      <div className="toolbar-actions report-shortcuts">{[['today', 'Hoy'], ['week', 'Últimos 7 días'], ['month', 'Este mes'], ['year', 'Este año']].map(([id, label]) => <Button key={id} className="btn-secondary btn-sm" onClick={() => period(id)}>{label}</Button>)}</div>
    </div>
    <div className="print-heading"><h2>{data.settings.gym_name || 'Anversol Gym'} · Reporte</h2><p>Del {date(from)} al {date(to)}</p></div>
    <div className="stats-grid">
      <Stat title="Recaudación" value={money(income)} note={`${payments.length} cuotas · ${sales.length} ventas`} icon="trending-up" />
      <Stat title="Gastos" value={money(expenses)} note="Gastos registrados en el período" icon="trending-down" />
      <Stat title="Resultado operativo" value={money(income - expenses)} note="Ingresos menos gastos; excluye retiros" icon="wallet" />
      <Stat title="Ingresos al gimnasio" value={checkins.length} note={`${new Set(checkins.map(c => c.member_id)).size} socios distintos`} icon="users" />
    </div>
    <div className="card"><div className="report-summary">
      <div><strong>{newMembers.length}</strong><span>Nuevos socios en el período</span></div>
      <div><strong>{expired.length}</strong><span>Membresías vencidas al día de hoy</span></div>
      <div><strong>{data.members.filter(m => m.state === 'baja').length}</strong><span>Socios dados de baja actualmente</span></div>
      <div><strong>{money(total(payments))}</strong><span>Cuotas cobradas en el período</span></div>
    </div></div>
    <div className="card"><div className="card-head"><h3 className="card-title">{reportOptions.find(o => o.value === type)?.label || 'Movimientos'}</h3><span className="muted">{['members', 'products'].includes(type) ? 'Estado actual' : `${date(from)} — ${date(to)}`}</span></div>
      <Table headers={headers} rows={rows} empty="No hay registros en este período." /></div>
    <p className="muted no-print">El archivo CSV se abre en Excel. Para PDF, elegí «Guardar como PDF» en el diálogo de impresión.</p>
  </>;
}
