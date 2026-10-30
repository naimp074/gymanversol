import { useApp, permissions } from '../context.js';
import { Empty, Icon, Metric, StatusBadge } from '../ui.jsx';
import { MemberCell, useActions } from '../actions.jsx';
import { dueSoon } from './shared.jsx';
import { date, addDays } from '../../lib/format.js';

export default function Expiry() {
  const { data, user } = useApp();
  const actions = useActions();
  const canDesk = permissions(user).pay;
  const expired = data.members.filter(m => m.status === 'vencido');
  const today = data.members.filter(m => m.days_left === 0 && m.status === 'activo');
  const tomorrow = data.members.filter(m => m.days_left === 1 && m.status === 'activo');
  const due = dueSoon(data);
  const list = [...expired, ...due].sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));
  return <>
    <section className="stats-grid">
      <Metric label="Cuotas vencidas" value={expired.length} detail="Membresías pendientes de renovación" icon="alert" tone="peach" />
      <Metric label="Vencen hoy" value={today.length} detail={date(data.today)} icon="calendar" tone="sand" />
      <Metric label="Vencen mañana" value={tomorrow.length} detail={date(addDays(data.today, 1))} icon="clock" tone="blue" />
      <Metric label="Próximos 5 días" value={due.length} detail="Incluye las cuotas que vencen hoy" icon="card" tone="lavender" />
    </section>
    <section className="card">
      <div className="card-head"><div><h2>Que nadie se quede sin entrenar</h2><p className="muted">Contactá a tus socios o registrá su renovación.</p></div>
        {canDesk && <button type="button" className="btn btn-primary" onClick={() => actions.payment()}><Icon name="plus" size={17} />Registrar pago</button>}</div>
      {list.length ? <div className="table-wrap"><table className="data-table">
        <thead><tr><th>Socio</th><th>Plan</th><th>Vencimiento</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{list.map(m => <tr key={m.id}><td><MemberCell member={m} /></td><td>{m.plan_name || 'Sin plan'}</td><td>{date(m.expires_at)}</td><td><StatusBadge member={m} /></td>
          <td><div className="row-actions">{canDesk ? <>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => actions.whatsapp(m.id)}><Icon name="message" size={15} />Recordar</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => actions.payment(m.id)}>Cobrar cuota</button>
          </> : '—'}</div></td></tr>)}</tbody>
      </table></div> : <Empty message="Todas las membresías están al día." />}
    </section>
  </>;
}
