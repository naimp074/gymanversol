import { useApp, permissions } from '../context.js';
import { Badge, Empty } from '../ui.jsx';
import { MemberCell } from '../actions.jsx';
import { rpc } from '../../lib/supabase.js';
import { date, time, localDay, addDays } from '../../lib/format.js';

export const byDate = list => [...list].sort((a, b) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));
export const todayCheckins = data => data.checkins.filter(c => localDay(c.date) === data.today);
export const isBirthday = (m, today) => m.birth_date?.slice(5) === today.slice(5);
export const dueSoon = data => data.members.filter(m => m.status === 'activo' && m.days_left >= 0 && m.days_left <= 5).sort((a, b) => a.days_left - b.days_left);

function trend(current, previous) {
  if (!previous) return <span className="muted">{current ? 'Actividad registrada' : 'Sin actividad'} en el período</span>;
  const percent = Math.round((current - previous) / previous * 100);
  return <><span className={`trend ${percent >= 0 ? 'positive' : 'negative'}`}>{percent >= 0 ? '+' : ''}{percent}%</span><span className="muted"> vs. período anterior</span></>;
}

export function AttendanceChart({ days }) {
  const { data } = useApp();
  const values = Array.from({ length: days }, (_, i) => {
    const day = addDays(data.today, i - days + 1);
    return { day, value: data.checkins.filter(c => c.allowed && localDay(c.date) === day).length };
  });
  const total = values.reduce((a, x) => a + x.value, 0);
  const previous = data.checkins.filter(c => c.allowed && localDay(c.date) >= addDays(data.today, -2 * days + 1) && localDay(c.date) < values[0].day).length;
  const max = Math.max(4, ...values.map(v => v.value));
  const step = Math.ceil(max / 4);
  const chartMax = step * 4;
  const W = 700, H = 175;
  const points = values.map((v, i) => [35 + i * (W - 55) / (values.length - 1), H - 15 - (v.value / chartMax) * (H - 35)]);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  return <>
    <div className="chart-summary"><strong>{total}</strong><span>visitas</span><div>{trend(total, previous)}</div></div>
    <div className="attendance-chart">
      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label={`Asistencia: ${values.map(v => `${date(v.day)}: ${v.value}`).join(', ')}`}>
        <defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ef7b61" stopOpacity=".23" /><stop offset="1" stopColor="#ef7b61" stopOpacity=".01" /></linearGradient></defs>
        {Array.from({ length: 5 }, (_, i) => { const y = H - 15 - i * (H - 35) / 4; return <g key={i}><line x1="35" y1={y} x2={W - 20} y2={y} stroke="#eae9e7" strokeDasharray="3 5" /><text x="0" y={y + 4} className="chart-label">{step * i}</text></g>; })}
        <path d={`${line} L${W - 20},${H - 15} L35,${H - 15} Z`} fill="url(#area-fill)" />
        <path d={line} stroke="#ed775b" fill="none" strokeWidth="2.8" strokeLinejoin="round" />
        {days <= 7 && points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" stroke="#fff" strokeWidth="2" fill="#ed775b"><title>{`${date(values[i].day)}: ${values[i].value} ingresos`}</title></circle>)}
        {values.map((v, i) => (i === 0 || i === values.length - 1 || i % (days === 7 ? 1 : 5) === 0) && <text key={v.day} x={points[i][0]} y={H + 13} textAnchor="middle" className="chart-label">{days === 7 ? new Date(`${v.day}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short' }) : v.day.slice(8)}</text>)}
      </svg>
    </div>
  </>;
}

export function AccessTable({ list, compact = false }) {
  const { data, user, toast, refresh } = useApp();
  const canDesk = permissions(user).checkin;
  if (!list.length) return <Empty message="Todavía no hay ingresos registrados." />;
  async function checkout(id) {
    try { await rpc('register_checkout', { p_id: id }); toast('Salida registrada.'); await refresh(); }
    catch (error) { toast(error.message, 'error'); }
  }
  return <div className="table-wrap"><table className="data-table">
    <thead><tr><th>Socio</th>{!compact && <th>Fecha</th>}<th>Ingreso</th><th>Estado</th>{!compact && <><th>Salida</th><th></th></>}</tr></thead>
    <tbody>{list.map(c => {
      const m = data.members.find(x => x.id === c.member_id) || { id: '', name: 'Socio', number: '—' };
      return <tr key={c.id}>
        <td><MemberCell member={m} /></td>
        {!compact && <td>{date(c.date)}</td>}
        <td className="mono">{time(c.date)}</td>
        <td><Badge tone={c.allowed ? 'green' : 'red'}>{c.allowed ? 'Habilitado' : 'Denegado'}</Badge></td>
        {!compact && <>
          <td>{c.checkout_at ? time(c.checkout_at) : c.allowed ? 'Dentro' : '—'}</td>
          <td>{c.allowed && !c.checkout_at && canDesk ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => checkout(c.id)}>Salida</button> : (c.allowed ? '' : c.reason)}</td>
        </>}
      </tr>;
    })}</tbody>
  </table></div>;
}
