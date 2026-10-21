import { useEffect, useState } from 'react';
import { rpc } from '../lib/supabase.js';
import { subscribeChanges } from '../lib/realtime.js';
import { zone, addDays, localDay, initials } from '../lib/format.js';

const TOKEN_KEY = 'anversol-member-token';
const localHour = value => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));
const longDate = value => !value ? '—' : new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const weekday = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
const visitTime = value => new Date(value).toLocaleString('es-AR', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const weekStart = day => { const d = new Date(`${day}T12:00:00Z`); return addDays(day, -((d.getUTCDay() + 6) % 7)); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const storage = {
  get: key => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } },
  remove: key => { try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ } }
};

function Logo() {
  return <svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#ef6b50" /><path d="M14 47 28 17h9l14 30H40l-7-17-8 17z" fill="#fff" /><path d="m29 41 5-9 8 15H26z" fill="#ffd7c8" /></svg>;
}

function Login({ message, onLogin }) {
  const [dni, setDni] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Portal de socios · Anversol Gym'; }, []);

  async function submit(event) {
    event.preventDefault();
    if (!/^\d{5,12}$/.test(dni)) { setError('Revisá el DNI: tiene que tener entre 5 y 12 números.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await rpc('member_login', { p_dni: dni });
      if (result.error) throw new Error(result.error);
      storage.set(TOKEN_KEY, result.token);
      onLogin(result.portal);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return <div className="login">
    <section className="login-story">
      <a className="site-brand" href="/"><Logo /><span><b>Anversol</b><small>GYM</small></span></a>
      <div>
        <span className="kicker">Portal de socios</span>
        <h1>Mirá cuánto <em>avanzaste.</em></h1>
        <p>Tus días de entrenamiento por semana, tus rachas, tu cuota y tu rutina. Todo en un solo lugar.</p>
      </div>
      <div className="login-bars" aria-hidden="true">{[35, 55, 45, 70, 60, 85, 75, 100].map((h, i) => <i key={i} style={{ '--h': `${h}%` }}></i>)}</div>
    </section>
    <section className="login-form-area">
      <form className="login-card" noValidate onSubmit={submit}>
        <a className="login-mobile-brand site-brand" href="/"><Logo /><span><b>Anversol</b><small>GYM</small></span></a>
        <h2>Hola de nuevo</h2>
        <p className="muted">Ingresá con tu número de documento.</p>
        <label className="dni-field">
          <span>DNI</span>
          <input name="dni" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={12} placeholder="Ej: 30111222" required autoFocus value={dni} onChange={e => setDni(e.target.value.replace(/\D/g, ''))} />
        </label>
        <p className="login-error" role="alert" hidden={!error}>{error}</p>
        <button className="btn-xl btn-coral" type="submit" disabled={busy}>Ver mi progreso <span aria-hidden="true">→</span></button>
        <p className="login-help">Escribí el DNI sin puntos. Si no podés entrar, consultá en recepción.</p>
        <a className="login-back" href="/">← Volver al sitio</a>
      </form>
    </section>
  </div>;
}

function computeStats(data) {
  const today = data.today;
  const days = [...new Set(data.visits.map(localDay))].sort();
  const daySet = new Set(days);
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(thisWeek, -7 * (11 - i));
    let count = 0;
    for (let d = 0; d < 7; d++) if (daySet.has(addDays(start, d))) count++;
    return { start, count, current: start === thisWeek };
  });
  const firstWeek = days.length ? weekStart(days[0]) : thisWeek;
  const completed = weeks.filter(w => !w.current && w.start >= firstWeek);
  const average = completed.length ? completed.reduce((s, w) => s + w.count, 0) / completed.length : 0;
  let streak = 0;
  let cursor = weeks.at(-1).count ? thisWeek : addDays(thisWeek, -7);
  while (cursor >= firstWeek) {
    let has = false;
    for (let d = 0; d < 7 && !has; d++) has = daySet.has(addDays(cursor, d));
    if (!has) break;
    streak++;
    cursor = addDays(cursor, -7);
  }
  const dow = Array(7).fill(0);
  for (const d of days) dow[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]++;
  const buckets = { 'a la mañana': 0, 'a la tarde': 0, 'a la noche': 0 };
  for (const v of data.visits) { const h = localHour(v); buckets[h < 12 ? 'a la mañana' : h < 18 ? 'a la tarde' : 'a la noche']++; }
  return {
    days, daySet, weeks, average, streak, dow,
    favoriteTime: data.visits.length ? Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0] : '',
    favoriteDay: days.length ? ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][dow.indexOf(Math.max(...dow))] : '',
    thisWeek: weeks.at(-1).count,
    lastWeek: weeks.at(-2).count,
    month: days.filter(d => d.startsWith(today.slice(0, 7))).length,
    year: days.filter(d => d.startsWith(today.slice(0, 4))).length,
    best: Math.max(0, ...weeks.map(w => w.count))
  };
}

function WeeklyChart({ s, goal }) {
  const W = 680, H = 260, left = 34, right = 10, top = 26, bottom = 34;
  const max = Math.max(goal, s.best, 4);
  const innerW = W - left - right, innerH = H - top - bottom;
  const slot = innerW / s.weeks.length, barW = Math.min(34, slot * 0.62);
  const y = v => top + innerH - (v / max) * innerH;
  const grid = Array.from({ length: max + 1 }, (_, v) => v).filter(v => max <= 7 || v % 2 === 0);
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Días de entrenamiento por semana en las últimas 12 semanas">
    {grid.map(v => <g key={v}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className="grid-line" /><text x={left - 10} y={y(v) + 4} className="axis" textAnchor="end">{v}</text></g>)}
    {s.weeks.map((w, i) => {
      const x = left + slot * i + (slot - barW) / 2;
      const h = Math.max(w.count ? 6 : 2, (w.count / max) * innerH);
      return <g key={w.start} className="bar-group" style={{ '--i': i }}>
        <rect x={x} y={top + innerH - h} width={barW} height={h} rx="8" className={w.current ? 'bar current' : w.count >= goal ? 'bar hit' : 'bar'}><title>{`Semana del ${shortDate(w.start)}: ${plural(w.count, 'día', 'días')}`}</title></rect>
        {w.count > 0 && <text x={x + barW / 2} y={top + innerH - h - 8} textAnchor="middle" className="bar-value">{w.count}</text>}
        <text x={x + barW / 2} y={H - 10} textAnchor="middle" className={`axis ${w.current ? 'axis-strong' : ''}`}>{w.current ? 'Esta' : shortDate(w.start)}</text>
      </g>;
    })}
    <line x1={left} x2={W - right} y1={y(goal)} y2={y(goal)} className="goal-line" />
    <text x={left + 6} y={y(goal) - 8} textAnchor="start" className="goal-label">Meta: {goal} {goal === 1 ? 'día' : 'días'}</text>
  </svg>;
}

function DowChart({ s }) {
  const max = Math.max(1, ...s.dow);
  return <div className="dow">{s.dow.map((v, i) => <div key={i} className="dow-row"><span>{DOW[i]}</span><div className="dow-track"><i style={{ '--w': `${(v / max) * 100}%` }} className={v === max && v > 0 ? 'top' : undefined}></i></div><b>{v}</b></div>)}</div>;
}

function Heatmap({ s, today }) {
  const weeks = 20;
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const months = Array.from({ length: weeks }, (_, w) => { const day = addDays(start, w * 7); return day.slice(8) <= '07' ? new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : ''; });
  return <>
    <div className="heat-wrap">
      <div className="heat-days">{DOW.map((d, i) => <span key={d}>{i % 2 === 0 ? d : ''}</span>)}</div>
      <div>
        <div className="heat-months">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
        <div className="heat">{Array.from({ length: weeks }, (_, w) => <div key={w} className="heat-col">{Array.from({ length: 7 }, (_, d) => {
          const day = addDays(start, w * 7 + d);
          const on = s.daySet.has(day);
          const cls = `${day > today ? 'future' : on ? 'on' : ''}${day === today ? ' today' : ''}`.trim();
          return <i key={d} className={cls || undefined} title={`${weekday(day)}${on ? ' · entrenaste' : ''}`}></i>;
        })}</div>)}</div>
      </div>
    </div>
    <div className="heat-legend"><span>Sin entrenar</span><i></i><i className="on"></i><span>Entrenaste</span></div>
  </>;
}

function WeightChart({ points }) {
  const W = 520, H = 200, pad = 30;
  const values = points.map(p => p.weight);
  const min = Math.min(...values) - 1, max = Math.max(...values) + 1;
  const x = i => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Evolución del peso">
    <defs><linearGradient id="wfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ef6b50" stopOpacity=".35" /><stop offset="1" stopColor="#ef6b50" stopOpacity="0" /></linearGradient></defs>
    <path d={area} fill="url(#wfill)" /><path d={path} className="line" />
    {points.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.weight)} r="5" className="dot"><title>{`${shortDate(p.date)}: ${p.weight} kg`}</title></circle><text x={x(i)} y={H - 8} textAnchor="middle" className="axis">{shortDate(p.date)}</text></g>)}
  </svg>;
}

function StatusCard({ m }) {
  const tone = m.status === 'activo' ? (m.days_left <= 5 ? 'warn' : 'ok') : 'bad';
  const ratio = m.status === 'activo' ? Math.min(1, Math.max(0.04, m.days_left / 30)) : 0;
  const circumference = 2 * Math.PI * 44;
  const label = m.status === 'activo' ? (m.days_left === 0 ? 'Vence hoy' : `Vence en ${plural(m.days_left, 'día', 'días')}`) : m.status === 'suspendido' ? 'Cuota suspendida' : 'Cuota vencida';
  return <section className={`p-card status ${tone}`}>
    <div className="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" className="ring-bg" /><circle cx="50" cy="50" r="44" className="ring-fg" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - ratio) }} /></svg><div><strong>{m.status === 'activo' ? Math.max(0, m.days_left) : '!'}</strong><small>{m.status === 'activo' ? 'días' : ''}</small></div></div>
    <div className="status-copy">
      <span className="kicker">Tu membresía</span>
      <h2>{m.plan_name}</h2>
      <p className="status-label">{label}</p>
      <p className="muted">{m.expires_at ? `${m.status === 'activo' ? 'Vigente hasta el' : 'Venció el'} ${longDate(m.expires_at)}` : 'Todavía no registramos un pago.'}{m.start_time ? ` · Horario ${m.start_time} a ${m.end_time}` : ''}{m.access_limit ? ` · ${m.access_limit} ingresos por período` : ''}</p>
      {(m.status !== 'activo' || m.days_left <= 5) && <p className="status-hint">Renová en recepción y conservás los días que te queden.</p>}
    </div>
  </section>;
}

function motivation(s, goal) {
  if (!s.days.length) return 'Todavía no registramos entrenamientos. ¡Tu primera visita empieza la cuenta!';
  if (s.thisWeek >= goal) return `¡Cumpliste tu meta de la semana! Llevás ${plural(s.thisWeek, 'día', 'días')}.`;
  const left = goal - s.thisWeek;
  if (s.streak >= 3) return `Racha de ${s.streak} semanas seguidas. Te ${left === 1 ? 'falta 1 día' : `faltan ${left} días`} para tu meta semanal.`;
  return `Esta semana llevás ${plural(s.thisWeek, 'día', 'días')}. Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para llegar a tu meta.`;
}

const measureLabels = { weight: ['Peso', 'kg'], height: ['Altura', 'cm'], body_fat: ['Grasa', '%'], waist: ['Cintura', 'cm'], chest: ['Pecho', 'cm'], arm: ['Brazo', 'cm'], leg: ['Pierna', 'cm'] };

export function Dashboard({ data, onLogout }) {
  const [goal, setGoal] = useState(() => Math.min(7, Math.max(1, Number(storage.get('anversol-goal')) || 3)));
  const m = data.member;
  const s = computeStats(data);
  const first = m.name.split(' ')[0];
  const trend = s.thisWeek - s.lastWeek;
  const weights = data.measurements.filter(x => typeof x.weight === 'number');
  const lastMeasure = data.measurements.at(-1);
  useEffect(() => { document.title = `${first} · Portal de socios`; }, [first]);
  const chooseGoal = n => { setGoal(n); storage.set('anversol-goal', String(n)); };

  return <>
    <header className="p-top">
      <a className="site-brand" href="/"><Logo /><span><b>{data.gym_name || 'Anversol'}</b><small>SOCIOS</small></span></a>
      <div className="p-top-actions"><a className="pill pill-ghost" href="/">Sitio</a><button className="pill pill-ghost" type="button" onClick={onLogout}>Salir</button></div>
    </header>
    <main className="p-main">
      <section className="p-hello">
        <div className="p-avatar">{m.photo?.startsWith('data:image/') ? <img src={m.photo} alt="" /> : initials(m.name)}</div>
        <div>
          <span className="kicker">Socio #{m.number}</span>
          <h1>Hola, <em>{first}.</em></h1>
          <p>{motivation(s, goal)}</p>
        </div>
      </section>

      <div className="p-grid-top">
        <StatusCard m={m} />
        <section className="kpis">
          <article className="kpi hot"><span>Esta semana</span><strong>{s.thisWeek}<small>/{goal}</small></strong><em className={`trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}`}>{trend > 0 ? `+${trend}` : trend} vs. semana pasada</em></article>
          <article className="kpi"><span>Promedio semanal</span><strong>{s.average.toFixed(1).replace('.', ',')}</strong><em>días · últimas semanas</em></article>
          <article className="kpi"><span>Racha</span><strong>{s.streak}</strong><em>{s.streak === 1 ? 'semana seguida' : 'semanas seguidas'}</em></article>
          <article className="kpi"><span>Este mes</span><strong>{s.month}</strong><em>{plural(s.year, 'día', 'días')} en el año</em></article>
        </section>
      </div>

      <section className="p-card">
        <div className="p-card-head">
          <div><h2>Días por semana</h2><p className="muted">Cuántos días distintos entrenaste en cada una de las últimas 12 semanas.</p></div>
          <div className="goal-picker" role="group" aria-label="Meta semanal"><span>Mi meta</span>{[2, 3, 4, 5, 6].map(n => <button key={n} type="button" className={n === goal ? 'active' : undefined} aria-pressed={n === goal} onClick={() => chooseGoal(n)}>{n}</button>)}</div>
        </div>
        <WeeklyChart s={s} goal={goal} />
        <div className="chart-foot"><span><i className="sw current"></i>Semana actual</span><span><i className="sw hit"></i>Meta cumplida</span><span><i className="sw"></i>Por debajo de la meta</span>{s.best > 0 && <span>Mejor semana: <b>{plural(s.best, 'día', 'días')}</b></span>}</div>
      </section>

      <div className="p-grid-2">
        <section className="p-card">
          <div className="p-card-head"><div><h2>Tus días favoritos</h2><p className="muted">{s.favoriteDay ? <>Venís más los <b>{s.favoriteDay}</b>, sobre todo <b>{s.favoriteTime}</b>.</> : 'Acá vas a ver qué días entrenás más.'}</p></div></div>
          <DowChart s={s} />
        </section>
        <section className="p-card">
          <div className="p-card-head"><div><h2>Calendario de asistencia</h2><p className="muted">Últimas 20 semanas.</p></div></div>
          <Heatmap s={s} today={data.today} />
        </section>
      </div>

      {data.reservations.length > 0 && <section className="p-card"><div className="p-card-head"><div><h2>Tus próximas clases</h2></div></div><div className="p-list">{data.reservations.map((r, i) => <div key={i} className="p-list-item"><time>{r.time}</time><div><strong>{r.name}</strong><small>{weekday(r.date)}{r.teacher ? ` · ${r.teacher}` : ''}</small></div></div>)}</div></section>}

      {data.routines.length > 0 && <section className="p-card"><div className="p-card-head"><div><h2>Tu rutina</h2><p className="muted">Armada por tu profesor.</p></div></div><div className="routines">{data.routines.map((r, i) => <details key={r.id} className="routine" open={i === 0}><summary><div><strong>{r.name}</strong><small>{[r.goal, r.teacher].filter(Boolean).join(' · ') || 'Rutina personalizada'}</small></div><span aria-hidden="true">+</span></summary><pre>{r.days}</pre>{r.notes && <p className="routine-notes">{r.notes}</p>}</details>)}</div></section>}

      {lastMeasure && <section className="p-card">
        <div className="p-card-head"><div><h2>Tus medidas</h2><p className="muted">Última medición: {longDate(lastMeasure.date)}</p></div></div>
        <div className="measures">{Object.entries(measureLabels).filter(([k]) => typeof lastMeasure[k] === 'number').map(([k, [label, unit]]) => {
          const prev = [...data.measurements].reverse().slice(1).find(x => typeof x[k] === 'number');
          const diff = prev ? Math.round((lastMeasure[k] - prev[k]) * 10) / 10 : null;
          return <div key={k} className="measure"><span>{label}</span><strong>{String(lastMeasure[k]).replace('.', ',')}<small>{unit}</small></strong>{diff ? <em>{diff > 0 ? '+' : ''}{String(diff).replace('.', ',')} {unit}</em> : null}</div>;
        })}</div>
        {weights.length >= 2 && <><h3 className="sub-title">Evolución del peso</h3><WeightChart points={weights.slice(-12)} /></>}
      </section>}

      <section className="p-card">
        <div className="p-card-head"><div><h2>Últimos ingresos</h2><p className="muted">{m.last_checkin ? `Tu última visita fue el ${visitTime(m.last_checkin)}.` : 'Todavía no hay ingresos registrados.'}</p></div></div>
        {data.visits.length > 0 && <div className="visits">{[...data.visits].reverse().slice(0, 12).map(v => <span key={v}>{visitTime(v)}</span>)}</div>}
      </section>

      <p className="p-foot">Socio desde {longDate(m.joined_at)} · Los datos se actualizan con cada ingreso en recepción.</p>
    </main>
  </>;
}

export default function PortalApp() {
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    const token = storage.get(TOKEN_KEY);
    if (!token) { setState({ phase: 'login' }); return; }
    rpc('member_portal', { p_token: token })
      .then(result => {
        if (result.error) { storage.remove(TOKEN_KEY); setState({ phase: 'login' }); }
        else setState({ phase: 'dashboard', data: result });
      })
      .catch(error => setState({ phase: 'login', message: error.message }));
  }, []);

  // Tiempo real: un ingreso en recepción, una rutina nueva o una renovación se ven al instante.
  const signedIn = state.phase === 'dashboard';
  useEffect(() => {
    if (!signedIn) return;
    return subscribeChanges(async () => {
      const token = storage.get(TOKEN_KEY);
      if (!token) return;
      const result = await rpc('member_portal', { p_token: token }).catch(() => null);
      if (result && !result.error) setState({ phase: 'dashboard', data: result });
    }, { tables: ['members', 'plans', 'checkins', 'reservations', 'classes', 'teachers', 'routines', 'measurements', 'settings'], delay: 800 });
  }, [signedIn]);

  async function logout() {
    const token = storage.get(TOKEN_KEY);
    storage.remove(TOKEN_KEY);
    if (token) await rpc('member_logout', { p_token: token }).catch(() => {});
    setState({ phase: 'login' });
  }

  if (state.phase === 'loading') return <div className="portal-loading"><span className="portal-spinner"></span></div>;
  if (state.phase === 'dashboard') return <Dashboard data={state.data} onLogout={logout} />;
  return <Login message={state.message} onLogin={data => { setState({ phase: 'dashboard', data }); scrollTo(0, 0); }} />;
}
