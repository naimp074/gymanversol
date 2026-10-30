import { useApp, useUi, permissions, methods } from '../context.js';
import { Badge, Button, Empty, Field, Modal, SelectField, Stat, Table, TextArea } from '../ui.jsx';
import { exportCsv } from '../exports.js';
import { rpc } from '../../lib/supabase.js';
import { money, fullDate, localDay } from '../../lib/format.js';

const total = list => list.reduce((sum, item) => sum + Number(item.amount || 0), 0);
const byNewest = list => [...list].sort((a, b) => (b.date || b.created_at || '').localeCompare(a.date || a.created_at || ''));
export const activeCash = data => data.cash_sessions.find(s => !s.closed_at);

function OpenCash() {
  const { toast } = useApp();
  return <Modal title="Abrir caja" onSubmit={async fd => { await rpc('cash_open', { p_opening: Number(fd.get('opening_amount')), p_opening_transfer: Number(fd.get('opening_transfer')) }); toast('Caja abierta. Ya podés registrar operaciones.'); }}>
    <p className="muted">Ingresá con cuánto dinero comienza el turno.</p>
    <div className="form-grid">
      <Field label="Efectivo inicial (ARS)" name="opening_amount" type="number" defaultValue={0} required min="0" step="1" />
      <Field label="Transferencia inicial (ARS)" name="opening_transfer" type="number" defaultValue={0} required min="0" step="1" />
    </div>
  </Modal>;
}

function CloseCash({ session }) {
  const { toast } = useApp();
  return <Modal title="Cerrar caja" onSubmit={async fd => { await rpc('cash_close', { p_counted: Number(fd.get('counted_amount')), p_notes: fd.get('notes') }); toast('Caja cerrada y arqueo registrado.'); }}>
    <div className="notice">Efectivo esperado: <strong>{money(session.expected_amount)}</strong></div>
    <p className="muted">Contá el efectivo físico. La diferencia quedará registrada en el cierre.</p>
    <Field label="Efectivo contado (ARS)" name="counted_amount" type="number" required min="0" step="1" />
    <TextArea label="Notas del cierre" name="notes" />
  </Modal>;
}

function MovementModal({ kind }) {
  const { toast } = useApp();
  const expense = kind === 'gasto';
  const categories = expense ? ['Luz', 'Agua', 'Internet', 'Alquiler', 'Sueldos', 'Limpieza', 'Mantenimiento', 'Máquinas', 'Mercadería', 'Otros'] : ['Inscripción', 'Servicios', 'Otros ingresos'];
  return <Modal title={expense ? 'Registrar gasto o retiro' : 'Registrar ingreso'} wide onSubmit={async fd => { await rpc('register_movement', { p: Object.fromEntries(fd) }); toast('Movimiento registrado.'); }}>
    <div className="form-grid">
      {expense ? <SelectField label="Tipo de movimiento" name="type" defaultValue="gasto" options={[{ value: 'gasto', label: 'Gasto del gimnasio' }, { value: 'retiro', label: 'Retiro de dinero' }]} /> : <input type="hidden" name="type" value="ingreso" />}
      <SelectField label="Categoría" name="category" options={categories.map(v => ({ value: v, label: v }))} />
      <Field label="Importe (ARS)" name="amount" type="number" required min="1" step="1" />
      <SelectField label="Medio de pago" name="method" defaultValue="Efectivo" options={methods.map(v => ({ value: v, label: v }))} />
      <Field label="Descripción" name="description" required maxLength={250} />
    </div>
  </Modal>;
}

export default function Cash() {
  const app = useApp();
  const { data, user, openModal, toast } = app;
  const [period, setPeriod] = useUi('cashPeriod');
  if (!permissions(user).finance) return <Empty message="Tu perfil no tiene acceso a esta sección." />;
  const session = activeCash(data);
  const movements = data.movements.filter(m => period === 'all' || (period === 'month' ? localDay(m.date).slice(0, 7) === data.today.slice(0, 7) : localDay(m.date) === data.today));
  const income = total(movements.filter(m => m.type === 'ingreso'));
  const expenses = total(movements.filter(m => m.type === 'gasto'));
  const withdrawals = total(movements.filter(m => m.type === 'retiro'));
  const needOpen = fn => () => session ? fn() : toast('Primero abrí la caja.', 'error');

  return <>
    <div className="card cash-status">
      <div><div className="card-head"><h2 className="section-title">{session ? 'La caja está abierta' : 'Caja cerrada'}</h2><Badge tone={session ? 'green' : 'neutral'}>{session ? 'Operativa' : 'Sin turno abierto'}</Badge></div>
        <p className="muted">{session ? `Apertura: ${fullDate(session.opened_at)} · Efectivo inicial ${money(session.opening_amount)} · Transferencia inicial ${money(session.opening_transfer)}` : 'Abrí un turno para registrar cobros, ventas y movimientos.'}</p></div>
      <div className="toolbar-actions">{session ? <>
        <Button icon="plus" onClick={needOpen(() => openModal(<MovementModal kind="ingreso" />))}>Registrar ingreso</Button>
        <Button icon="minus" onClick={needOpen(() => openModal(<MovementModal kind="gasto" />))}>Gasto / retiro</Button>
        <Button className="btn-primary" icon="lock" onClick={() => openModal(<CloseCash session={session} />)}>Cerrar caja</Button>
      </> : <Button className="btn-primary" icon="unlock" onClick={() => openModal(<OpenCash />)}>Abrir caja</Button>}</div>
    </div>
    <div className="toolbar"><h2 className="section-title">Resumen de caja</h2>
      <select className="filter-select" aria-label="Período de caja" value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoy</option><option value="month">Este mes</option><option value="all">Todo el historial</option></select></div>
    <div className="stats-grid">
      <Stat title="Ingresos" value={money(income)} note="Cuotas, ventas y otros ingresos" icon="trending-up" />
      <Stat title="Gastos" value={money(expenses)} note={`Retiros: ${money(withdrawals)}`} icon="trending-down" />
      <Stat title="Balance del período" value={money(income - expenses - withdrawals)} note="Ingresos menos gastos y retiros" icon="wallet" />
      <Stat title="Efectivo esperado" value={money(session ? session.expected_amount : 0)} note={session ? 'Incluye efectivo inicial del turno' : 'Abrí la caja para comenzar'} icon="banknote" />
    </div>
    <div className="card"><div className="card-head"><h3 className="card-title">Ingresos por medio de pago</h3><span className="muted">{movements.filter(m => m.type === 'ingreso').length} operaciones</span></div>
      <div className="method-grid">{methods.map(method => <div key={method} className="metric-mini"><span className="muted">{method}</span><strong>{money(total(movements.filter(m => m.type === 'ingreso' && m.method === method)))}</strong></div>)}</div></div>
    <div className="card"><div className="card-head"><h3 className="card-title">Movimientos</h3><Button className="btn-secondary btn-sm" icon="download" onClick={() => exportCsv(app, 'movements')}>Exportar CSV</Button></div>
      <Table headers={['Detalle', 'Categoría', 'Fecha', 'Medio', 'Importe']} empty="No hay movimientos en este período." rows={byNewest(movements).map(m => <tr key={m.id}>
        <td><strong>{m.description || m.type}</strong><small className="muted"><Badge tone={m.type === 'ingreso' ? 'green' : 'amber'}>{m.type === 'ingreso' ? 'Ingreso' : m.type === 'gasto' ? 'Gasto' : 'Retiro'}</Badge></small></td>
        <td>{m.category || 'General'}</td><td>{fullDate(m.date)}</td><td>{m.method}</td>
        <td className={`amount ${m.type === 'ingreso' ? 'text-green' : 'text-red'}`}>{m.type === 'ingreso' ? '+' : '−'} {money(m.amount)}</td>
      </tr>)} /></div>
    <div className="card"><div className="card-head"><h3 className="card-title">Historial de turnos</h3></div>
      <Table headers={['Apertura', 'Cierre', 'Efectivo inicial', 'Transf. inicial', 'Esperado', 'Contado', 'Diferencia']} rows={[...data.cash_sessions].sort((a, b) => b.opened_at.localeCompare(a.opened_at)).map(s => <tr key={s.id}>
        <td>{fullDate(s.opened_at)}</td><td>{s.closed_at ? fullDate(s.closed_at) : <Badge tone="green">Abierta</Badge>}</td><td>{money(s.opening_amount)}</td><td>{money(s.opening_transfer)}</td>
        <td>{money(s.expected_amount)}</td><td>{s.closed_at ? money(s.counted_amount) : '—'}</td>
        <td>{s.closed_at ? <Badge tone={Number(s.difference) === 0 ? 'green' : 'red'}>{money(s.difference)}</Badge> : '—'}</td>
      </tr>)} /></div>
  </>;
}
