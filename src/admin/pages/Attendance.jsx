import { useApp, useUi, permissions } from '../context.js';
import { Empty, Icon, Metric } from '../ui.jsx';
import { MemberCell, useActions } from '../actions.jsx';
import { AttendanceChart, AccessTable, byDate } from './shared.jsx';
import { exportCsv } from '../exports.js';
import { date, time, localDay, addDays } from '../../lib/format.js';

export default function Attendance() {
  const app = useApp();
  const { data, user } = app;
  const actions = useActions();
  const can = permissions(user.role);
  const [chartDays, setChartDays] = useUi('chartDays');
  const admitted = data.checkins.filter(c => c.allowed);
  const period = admitted.filter(c => localDay(c.date) >= addDays(data.today, -29));
  const ranked = data.members.map(m => ({ ...m, visits: period.filter(c => c.member_id === m.id).length })).sort((a, b) => b.visits - a.visits);
  const absent = data.members.filter(m => m.state === 'activo' && (!m.last_checkin ? m.joined_at <= addDays(data.today, -15) : localDay(m.last_checkin) <= addDays(data.today, -15)));
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: period.filter(c => Number(time(c.date).split(':')[0]) === h).length }));
  const peak = hours.reduce((a, b) => a.count >= b.count ? a : b);
  return <>
    <section className="stats-grid">
      <Metric label="Visitas en 30 días" value={period.length} detail="Ingresos habilitados registrados" icon="door" />
      <Metric label="Promedio diario" value={(period.length / 30).toFixed(1)} detail="Últimos 30 días calendario" icon="chart" tone="blue" />
      <Metric label="Horario con más visitas" value={peak.count ? `${String(peak.hour).padStart(2, '0')}:00` : '—'} detail={`${peak.count} ingresos en esa franja`} icon="clock" tone="mint" />
      <Metric label="Sin asistir hace 15 días" value={absent.length} detail="Socios para volver a conectar" icon="heart" tone="lavender" />
    </section>
    <section className="card">
      <div className="card-head"><div><h2>La constancia, a la vista</h2><p className="muted">Ingresos diarios al gimnasio</p></div>
        <select aria-label="Período de asistencia" value={chartDays} onChange={e => setChartDays(Number(e.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option></select></div>
      <AttendanceChart days={chartDays} />
    </section>
    <div className="grid-2">
      <section className="card">
        <div className="card-head"><div><h2>Los más constantes</h2><p className="muted">Entrenamientos en los últimos 30 días</p></div><Icon name="sparkles" /></div>
        <div className="rank-list">{ranked.some(m => m.visits > 0) ? ranked.filter(m => m.visits > 0).slice(0, 8).map((m, i) => <div key={m.id} className="rank-row"><span className="rank-number">{String(i + 1).padStart(2, '0')}</span><MemberCell member={m} /><strong>{m.visits}<small>visitas</small></strong></div>) : <Empty message="Los próximos ingresos aparecerán acá." />}</div>
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Los extrañamos por acá</h2><p className="muted">Sin visitas registradas en los últimos 15 días</p></div><Icon name="heart" /></div>
        <div className="due-list">{absent.length ? absent.slice(0, 15).map(m => <div key={m.id} className="due-row"><MemberCell member={m} />
          {can.desk ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => actions.whatsapp(m.id, 'recuperacion')}><Icon name="message" size={16} />Contactar</button> : <span className="muted">{m.last_checkin ? date(m.last_checkin) : 'Sin visitas'}</span>}
        </div>) : <Empty message="Tu comunidad se mantiene en movimiento." />}</div>
      </section>
    </div>
    <section className="card">
      <div className="card-head"><h2>Historial de ingresos</h2>{can.finance && <button type="button" className="btn btn-secondary" onClick={() => exportCsv(app, 'checkins')}>Exportar CSV</button>}</div>
      <AccessTable list={byDate(data.checkins).slice(0, 100)} />
      <p className="table-note">Últimos 100 registros. El archivo exportado incluye el historial disponible (últimos 400 días).</p>
    </section>
  </>;
}
