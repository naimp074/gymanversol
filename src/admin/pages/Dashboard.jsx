import { useApp, useUi, permissions, canSee } from '../context.js';
import { Badge, Empty, Icon, Metric } from '../ui.jsx';
import { MemberCell, useActions } from '../actions.jsx';
import { AttendanceChart, AccessTable, byDate, todayCheckins, isBirthday, dueSoon } from './shared.jsx';
import { money, localDay, addDays } from '../../lib/format.js';

export default function Dashboard() {
  const { data, user, navigate } = useApp();
  const actions = useActions();
  const can = permissions(user);
  const [chartDays, setChartDays] = useUi('chartDays');
  const [alertTab, setAlertTab] = useUi('dashboardAlert');
  const admitted = todayCheckins(data).filter(c => c.allowed);
  const inside = admitted.filter(c => !c.checkout_at);
  const activeMembers = data.members.filter(m => m.status === 'activo');
  const expired = data.members.filter(m => m.status === 'vencido');
  const todayPayments = data.payments.filter(p => localDay(p.date) === data.today);
  const weekNew = data.members.filter(m => m.joined_at >= addDays(data.today, -6));
  const todayClasses = data.classes.filter(c => c.date === data.today).sort((a, b) => a.time.localeCompare(b.time));
  const due = dueSoon(data);
  const birthdays = data.members.filter(m => isBirthday(m, data.today));
  const alertList = alertTab === 'birthday' ? birthdays.slice(0, 5) : due.slice(0, 3);

  return <>
    <section className="stats-grid">
      <Metric label="Socios activos" value={activeMembers.length} icon="users" detail={<><span className="positive"><Icon name="up" size={13} /> {weekNew.length} nuevos</span><span className="muted"> en los últimos 7 días</span></>} />
      <Metric label="Ingresos de hoy" value={admitted.length} icon="door" tone="blue" detail={<><span className="live-dot"></span><span>{inside.length} personas dentro del gimnasio</span></>} />
      {can.finance
        ? <Metric label="Recaudación de hoy" value={money(todayPayments.reduce((a, p) => a + p.amount, 0))} icon="wallet" tone="mint" detail={<span className="muted">{todayPayments.length} cuotas cobradas hoy</span>} />
        : <Metric label="Clases de hoy" value={todayClasses.length} icon="wallet" tone="mint" detail="Sesiones programadas" />}
      <Metric label="Vencimientos próximos" value={due.length} icon="calendar" tone="lavender" detail={<><span className="amber-text">Próximos 5 días</span><span className="muted"> · {expired.length} vencidos</span></>} />
    </section>

    <div className="dashboard-main">
      <section className="card attendance-card">
        <div className="card-head"><div><h2>Así se mueve tu comunidad</h2><p className="muted">Ingresos al gimnasio</p></div>
          <select aria-label="Período de asistencia" value={chartDays} onChange={e => setChartDays(Number(e.target.value))}><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option></select></div>
        <AttendanceChart days={chartDays} />
        <div className="chart-bottom"><span><i className="legend-dot"></i>Ingresos habilitados</span><a href="#asistencia" onClick={e => { e.preventDefault(); navigate('asistencia'); }}>Ver asistencia <Icon name="arrow" size={15} /></a></div>
      </section>
      <section className="quick-card">
        <div className="quick-decoration"><Icon name="dumbbell" size={130} /></div>
        <span className="eyebrow">TODO A MANO</span>
        <h2>Menos gestión.<br />Más movimiento.</h2>
        <p>Tu día a día, un poco más simple.</p>
        <div className="quick-actions">
          {can.pay && <button type="button" onClick={() => actions.payment()}><Icon name="wallet" /><span>Registrar un pago</span><Icon name="arrow" size={18} /></button>}
          {can.desk && <button type="button" onClick={() => actions.memberForm()}><Icon name="users" /><span>Sumar un nuevo socio</span><Icon name="arrow" size={18} /></button>}
          {can.checkin && <button type="button" onClick={() => navigate('accesos')}><Icon name="door" /><span>Registrar un ingreso</span><Icon name="arrow" size={18} /></button>}
          {!can.desk && canSee(user, 'socios') && <button type="button" onClick={() => navigate('socios')}><Icon name="users" /><span>Consultar socios</span><Icon name="arrow" size={18} /></button>}
          {!can.pay && canSee(user, 'rutinas') && <button type="button" onClick={() => navigate('rutinas')}><Icon name="chart" /><span>Ver rutinas</span><Icon name="arrow" size={18} /></button>}
          {!can.pay && canSee(user, 'reportes') && <button type="button" onClick={() => navigate('reportes')}><Icon name="chart" /><span>Consultar reportes</span><Icon name="arrow" size={18} /></button>}
        </div>
        <span className="quick-footer"><i></i>Un gran entrenamiento empieza acá.</span>
      </section>
    </div>

    <div className="dashboard-lower">
      <section className="card">
        <div className="card-head"><div><h2>Últimos ingresos</h2><p className="muted">La comunidad no se detiene</p></div><Badge tone="green">Hoy</Badge></div>
        <AccessTable list={byDate(todayCheckins(data)).slice(0, 5)} compact />
        <a className="card-link" href="#" onClick={e => { e.preventDefault(); navigate(can.checkin ? 'accesos' : 'asistencia'); }}>Ver todos los ingresos <Icon name="arrow" size={16} /></a>
      </section>
      <section className="card due-card">
        <div className="card-head"><div><h2>Para tener en cuenta</h2><p className="muted">Un pequeño recordatorio hace la diferencia</p></div><span className="soft-icon peach"><Icon name="bell" /></span></div>
        <div className="alert-tabs">
          <button type="button" className={alertTab === 'due' ? 'selected' : ''} onClick={() => setAlertTab('due')}>Por vencer <b>{due.length}</b></button>
          <button type="button" className={alertTab === 'birthday' ? 'selected' : ''} onClick={() => setAlertTab('birthday')}>Cumpleaños <b>{birthdays.length}</b></button>
        </div>
        <div className="due-list">{alertList.length ? alertList.map(m => <div key={m.id} className="due-row"><MemberCell member={m} /><div>
          {alertTab === 'birthday' ? <Badge tone="green">Hoy</Badge> : <Badge tone="amber">{m.days_left === 0 ? 'Vence hoy' : `En ${m.days_left} día${m.days_left === 1 ? '' : 's'}`}</Badge>}
          {can.desk && <button type="button" className="icon-btn" aria-label={`Mensaje para ${m.name}`} onClick={() => actions.whatsapp(m.id, alertTab === 'birthday' ? 'cumpleanos' : 'recordatorio')}><Icon name="message" size={18} /></button>}
        </div></div>) : <Empty message={alertTab === 'birthday' ? 'Hoy no hay cumpleaños.' : 'No hay cuotas por vencer en los próximos días.'} />}</div>
        <a href="#" className="card-link" onClick={e => { e.preventDefault(); navigate(canSee(user, 'vencimientos') ? 'vencimientos' : 'socios'); }}>Ver socios <Icon name="arrow" size={16} /></a>
      </section>
    </div>

    <section className="card daily-classes">
      <div className="card-head"><div><h2>La agenda de hoy</h2><p className="muted">Energía compartida, objetivos en común</p></div>{canSee(user, 'clases') && <a href="#clases" onClick={e => { e.preventDefault(); navigate('clases'); }}>Ver agenda completa →</a>}</div>
      <div className="class-strip">{todayClasses.length ? todayClasses.slice(0, 4).map(c => {
        const reserved = data.reservations.filter(r => r.class_id === c.id).length;
        return <div key={c.id} className="class-mini"><span className="class-time">{c.time}</span><div><strong>{c.name}</strong><small>{data.teachers.find(t => t.id === c.teacher_id)?.name || 'Sin profesor'}</small></div><span className="class-spots">{reserved}/{c.capacity}<small>reservas</small></span></div>;
      }) : <Empty message="Hoy no hay clases programadas." />}</div>
    </section>
  </>;
}
