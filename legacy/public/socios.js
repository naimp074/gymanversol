const root = document.getElementById('portal');
const zone = 'America/Argentina/Buenos_Aires';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDay = value => new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date(value));
const localHour = value => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(value)));
const longDate = value => !value ? '—' : new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const weekday = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
const visitTime = value => new Date(value).toLocaleString('es-AR', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const addDays = (day, amount) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); };
const weekStart = day => { const d = new Date(`${day}T12:00:00Z`); return addDays(day, -((d.getUTCDay() + 6) % 7)); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const logo = '<svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#ef6b50"/><path d="M14 47 28 17h9l14 30H40l-7-17-8 17z" fill="#fff"/><path d="m29 41 5-9 8 15H26z" fill="#ffd7c8"/></svg>';
let data = null;
let goal = Math.min(7, Math.max(1, Number(localStorage.getItem('anversol-goal')) || 3));

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, credentials: 'same-origin', headers: options.body ? { 'Content-Type': 'application/json' } : undefined, body: options.body ? JSON.stringify(options.body) : undefined });
  } catch { throw new Error('No pudimos conectar con el gimnasio. Revisá tu conexión.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(value.error || 'No se pudo completar la operación.'); error.status = response.status; throw error; }
  return value;
}

function renderLogin(message = '') {
  document.title = 'Portal de socios · Anversol Gym';
  root.innerHTML = `<div class="login">
    <section class="login-story">
      <a class="site-brand" href="/">${logo}<span><b>Anversol</b><small>GYM</small></span></a>
      <div>
        <span class="kicker">Portal de socios</span>
        <h1>Mirá cuánto <em>avanzaste.</em></h1>
        <p>Tus días de entrenamiento por semana, tus rachas, tu cuota y tu rutina. Todo en un solo lugar.</p>
      </div>
      <div class="login-bars" aria-hidden="true">${[35, 55, 45, 70, 60, 85, 75, 100].map(h => `<i style="--h:${h}%"></i>`).join('')}</div>
    </section>
    <section class="login-form-area">
      <form class="login-card" novalidate>
        <a class="login-mobile-brand site-brand" href="/">${logo}<span><b>Anversol</b><small>GYM</small></span></a>
        <h2>Hola de nuevo</h2>
        <p class="muted">Ingresá con tu número de documento.</p>
        <label class="dni-field">
          <span>DNI</span>
          <input name="dni" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="12" placeholder="Ej: 30111222" required autofocus>
        </label>
        <p class="login-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
        <button class="btn-xl btn-coral" type="submit">Ver mi progreso <span aria-hidden="true">→</span></button>
        <p class="login-help">Escribí el DNI sin puntos. Si no podés entrar, consultá en recepción.</p>
        <a class="login-back" href="/">← Volver al sitio</a>
      </form>
    </section>
  </div>`;
  const form = root.querySelector('form');
  const input = form.dni;
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.login-error');
    const dni = input.value.trim();
    if (!/^\d{5,12}$/.test(dni)) { error.textContent = 'Revisá el DNI: tiene que tener entre 5 y 12 números.'; error.hidden = false; input.focus(); return; }
    const button = form.querySelector('button');
    button.disabled = true;
    error.hidden = true;
    try { data = await request('/api/member/login', { method: 'POST', body: { dni } }); renderDashboard(); }
    catch (e) { error.textContent = e.message; error.hidden = false; button.disabled = false; input.select(); }
  });
}

function stats() {
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
  const month = today.slice(0, 7);
  const dow = Array(7).fill(0);
  for (const d of days) dow[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]++;
  const buckets = { 'a la mañana': 0, 'a la tarde': 0, 'a la noche': 0 };
  for (const v of data.visits) { const h = localHour(v); buckets[h < 12 ? 'a la mañana' : h < 18 ? 'a la tarde' : 'a la noche']++; }
  const favoriteTime = data.visits.length ? Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0] : '';
  const favoriteDay = days.length ? ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][dow.indexOf(Math.max(...dow))] : '';
  return {
    days, daySet, weeks, average, streak, dow, favoriteTime, favoriteDay,
    thisWeek: weeks.at(-1).count,
    lastWeek: weeks.at(-2).count,
    month: days.filter(d => d.startsWith(month)).length,
    year: days.filter(d => d.startsWith(today.slice(0, 4))).length,
    best: Math.max(0, ...weeks.map(w => w.count))
  };
}

function weeklyChart(s) {
  const W = 680, H = 260, left = 34, right = 10, top = 26, bottom = 34;
  const max = Math.max(goal, s.best, 4);
  const innerW = W - left - right, innerH = H - top - bottom;
  const slot = innerW / s.weeks.length, barW = Math.min(34, slot * .62);
  const y = v => top + innerH - (v / max) * innerH;
  const grid = Array.from({ length: max + 1 }, (_, v) => v).filter(v => max <= 7 || v % 2 === 0)
    .map(v => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/><text x="${left - 10}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`).join('');
  const bars = s.weeks.map((w, i) => {
    const x = left + slot * i + (slot - barW) / 2;
    const h = Math.max(w.count ? 6 : 2, (w.count / max) * innerH);
    const cls = w.current ? 'bar current' : w.count >= goal ? 'bar hit' : 'bar';
    return `<g class="bar-group" style="--i:${i}"><rect x="${x}" y="${top + innerH - h}" width="${barW}" height="${h}" rx="8" class="${cls}"><title>Semana del ${shortDate(w.start)}: ${plural(w.count, 'día', 'días')}</title></rect>
      ${w.count ? `<text x="${x + barW / 2}" y="${top + innerH - h - 8}" text-anchor="middle" class="bar-value">${w.count}</text>` : ''}
      <text x="${x + barW / 2}" y="${H - 10}" text-anchor="middle" class="axis ${w.current ? 'axis-strong' : ''}">${w.current ? 'Esta' : shortDate(w.start)}</text></g>`;
  }).join('');
  const goalLine = `<line x1="${left}" x2="${W - right}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/><text x="${left + 6}" y="${y(goal) - 8}" text-anchor="start" class="goal-label">Meta: ${goal} ${goal === 1 ? 'día' : 'días'}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Días de entrenamiento por semana en las últimas 12 semanas">${grid}${bars}${goalLine}</svg>`;
}

function dowChart(s) {
  const max = Math.max(1, ...s.dow);
  return `<div class="dow">${s.dow.map((v, i) => `<div class="dow-row"><span>${DOW[i]}</span><div class="dow-track"><i style="--w:${(v / max) * 100}%" class="${v === max && v > 0 ? 'top' : ''}"></i></div><b>${v}</b></div>`).join('')}</div>`;
}

function heatmap(s) {
  const weeks = 20;
  const start = addDays(weekStart(data.today), -7 * (weeks - 1));
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = addDays(start, w * 7 + d);
    const future = day > data.today;
    const on = s.daySet.has(day);
    return `<i class="${future ? 'future' : on ? 'on' : ''}${day === data.today ? ' today' : ''}" title="${esc(weekday(day))}${on ? ' · entrenaste' : ''}"></i>`;
  }).join('')).map(col => `<div class="heat-col">${col}</div>`).join('');
  const months = Array.from({ length: weeks }, (_, w) => { const day = addDays(start, w * 7); return day.slice(8) <= '07' ? new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : ''; });
  return `<div class="heat-wrap"><div class="heat-days">${DOW.map((d, i) => `<span>${i % 2 === 0 ? d : ''}</span>`).join('')}</div><div><div class="heat-months">${months.map(m => `<span>${esc(m)}</span>`).join('')}</div><div class="heat">${cols}</div></div></div><div class="heat-legend"><span>Sin entrenar</span><i></i><i class="on"></i><span>Entrenaste</span></div>`;
}

function weightChart(points) {
  const W = 520, H = 200, pad = 30;
  const values = points.map(p => p.weight);
  const min = Math.min(...values) - 1, max = Math.max(...values) + 1;
  const x = i => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolución del peso">
    <defs><linearGradient id="wfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ef6b50" stop-opacity=".35"/><stop offset="1" stop-color="#ef6b50" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#wfill)"/><path d="${path}" class="line"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.weight)}" r="5" class="dot"><title>${shortDate(p.date)}: ${p.weight} kg</title></circle><text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="axis">${shortDate(p.date)}</text>`).join('')}
  </svg>`;
}

function statusCard(m) {
  const tone = m.status === 'activo' ? (m.daysLeft <= 5 ? 'warn' : 'ok') : 'bad';
  const ratio = m.status === 'activo' ? Math.min(1, Math.max(0.04, m.daysLeft / 30)) : 0;
  const circumference = 2 * Math.PI * 44;
  const label = m.status === 'activo' ? (m.daysLeft === 0 ? 'Vence hoy' : `Vence en ${plural(m.daysLeft, 'día', 'días')}`) : m.status === 'suspendido' ? 'Cuota suspendida' : 'Cuota vencida';
  return `<section class="p-card status ${tone}">
    <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="ring-bg"/><circle cx="50" cy="50" r="44" class="ring-fg" style="stroke-dasharray:${circumference};stroke-dashoffset:${circumference * (1 - ratio)}"/></svg><div><strong>${m.status === 'activo' ? Math.max(0, m.daysLeft) : '!'}</strong><small>${m.status === 'activo' ? 'días' : ''}</small></div></div>
    <div class="status-copy">
      <span class="kicker">Tu membresía</span>
      <h2>${esc(m.planName)}</h2>
      <p class="status-label">${label}</p>
      <p class="muted">${m.expiresAt ? `${m.status === 'activo' ? 'Vigente hasta el' : 'Venció el'} ${longDate(m.expiresAt)}` : 'Todavía no registramos un pago.'}${m.startTime ? ` · Horario ${esc(m.startTime)} a ${esc(m.endTime)}` : ''}${m.accessLimit ? ` · ${m.accessLimit} ingresos por período` : ''}</p>
      ${m.status !== 'activo' || m.daysLeft <= 5 ? '<p class="status-hint">Renová en recepción y conservás los días que te queden.</p>' : ''}
    </div>
  </section>`;
}

function motivation(s) {
  if (!s.days.length) return 'Todavía no registramos entrenamientos. ¡Tu primera visita empieza la cuenta!';
  if (s.thisWeek >= goal) return `¡Cumpliste tu meta de la semana! Llevás ${plural(s.thisWeek, 'día', 'días')}.`;
  const left = goal - s.thisWeek;
  if (s.streak >= 3) return `Racha de ${s.streak} semanas seguidas. Te ${left === 1 ? 'falta 1 día' : `faltan ${left} días`} para tu meta semanal.`;
  return `Esta semana llevás ${plural(s.thisWeek, 'día', 'días')}. Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para llegar a tu meta.`;
}

function renderDashboard() {
  const m = data.member;
  const s = stats();
  const first = m.name.split(' ')[0];
  const trend = s.thisWeek - s.lastWeek;
  const weights = data.measurements.filter(x => typeof x.weight === 'number');
  const lastMeasure = data.measurements.at(-1);
  const measureLabels = { weight: ['Peso', 'kg'], height: ['Altura', 'cm'], bodyFat: ['Grasa', '%'], waist: ['Cintura', 'cm'], chest: ['Pecho', 'cm'], arm: ['Brazo', 'cm'], leg: ['Pierna', 'cm'] };
  const initials = m.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  document.title = `${first} · Portal de socios`;
  root.innerHTML = `<header class="p-top">
    <a class="site-brand" href="/">${logo}<span><b>${esc(data.gymName || 'Anversol')}</b><small>SOCIOS</small></span></a>
    <div class="p-top-actions"><a class="pill pill-ghost" href="/">Sitio</a><button class="pill pill-ghost" type="button" data-logout>Salir</button></div>
  </header>
  <main class="p-main">
    <section class="p-hello">
      <div class="p-avatar">${m.photo?.startsWith('data:image/') ? `<img src="${esc(m.photo)}" alt="">` : esc(initials)}</div>
      <div>
        <span class="kicker">Socio #${esc(m.number)}</span>
        <h1>Hola, <em>${esc(first)}.</em></h1>
        <p>${esc(motivation(s))}</p>
      </div>
    </section>

    <div class="p-grid-top">
      ${statusCard(m)}
      <section class="kpis">
        <article class="kpi hot"><span>Esta semana</span><strong>${s.thisWeek}<small>/${goal}</small></strong><em class="trend ${trend > 0 ? 'up' : trend < 0 ? 'down' : ''}">${trend > 0 ? `+${trend}` : trend} vs. semana pasada</em></article>
        <article class="kpi"><span>Promedio semanal</span><strong>${s.average.toFixed(1).replace('.', ',')}</strong><em>días · últimas semanas</em></article>
        <article class="kpi"><span>Racha</span><strong>${s.streak}</strong><em>${s.streak === 1 ? 'semana seguida' : 'semanas seguidas'}</em></article>
        <article class="kpi"><span>Este mes</span><strong>${s.month}</strong><em>${plural(s.year, 'día', 'días')} en el año</em></article>
      </section>
    </div>

    <section class="p-card">
      <div class="p-card-head">
        <div><h2>Días por semana</h2><p class="muted">Cuántos días distintos entrenaste en cada una de las últimas 12 semanas.</p></div>
        <div class="goal-picker" role="group" aria-label="Meta semanal"><span>Mi meta</span>${[2, 3, 4, 5, 6].map(n => `<button type="button" data-goal="${n}" class="${n === goal ? 'active' : ''}" aria-pressed="${n === goal}">${n}</button>`).join('')}</div>
      </div>
      ${weeklyChart(s)}
      <div class="chart-foot"><span><i class="sw current"></i>Semana actual</span><span><i class="sw hit"></i>Meta cumplida</span><span><i class="sw"></i>Por debajo de la meta</span>${s.best ? `<span>Mejor semana: <b>${plural(s.best, 'día', 'días')}</b></span>` : ''}</div>
    </section>

    <div class="p-grid-2">
      <section class="p-card">
        <div class="p-card-head"><div><h2>Tus días favoritos</h2><p class="muted">${s.favoriteDay ? `Venís más los <b>${esc(s.favoriteDay)}</b>, sobre todo <b>${esc(s.favoriteTime)}</b>.` : 'Acá vas a ver qué días entrenás más.'}</p></div></div>
        ${dowChart(s)}
      </section>
      <section class="p-card">
        <div class="p-card-head"><div><h2>Calendario de asistencia</h2><p class="muted">Últimas 20 semanas.</p></div></div>
        ${heatmap(s)}
      </section>
    </div>

    ${data.reservations.length ? `<section class="p-card"><div class="p-card-head"><div><h2>Tus próximas clases</h2></div></div><div class="p-list">${data.reservations.map(r => `<div class="p-list-item"><time>${esc(r.time)}</time><div><strong>${esc(r.name)}</strong><small>${esc(weekday(r.date))}${r.teacher ? ` · ${esc(r.teacher)}` : ''}</small></div></div>`).join('')}</div></section>` : ''}

    ${data.routines.length ? `<section class="p-card"><div class="p-card-head"><div><h2>Tu rutina</h2><p class="muted">Armada por tu profesor.</p></div></div><div class="routines">${data.routines.map((r, i) => `<details class="routine" ${i === 0 ? 'open' : ''}><summary><div><strong>${esc(r.name)}</strong><small>${esc([r.goal, r.teacher].filter(Boolean).join(' · ') || 'Rutina personalizada')}</small></div><span aria-hidden="true">+</span></summary><pre>${esc(r.days)}</pre>${r.notes ? `<p class="routine-notes">${esc(r.notes)}</p>` : ''}</details>`).join('')}</div></section>` : ''}

    ${data.measurements.length ? `<section class="p-card"><div class="p-card-head"><div><h2>Tus medidas</h2><p class="muted">Última medición: ${longDate(lastMeasure.date)}</p></div></div>
      <div class="measures">${Object.entries(measureLabels).filter(([k]) => typeof lastMeasure[k] === 'number').map(([k, [label, unit]]) => { const prev = [...data.measurements].reverse().slice(1).find(x => typeof x[k] === 'number'); const diff = prev ? Math.round((lastMeasure[k] - prev[k]) * 10) / 10 : null; return `<div class="measure"><span>${label}</span><strong>${String(lastMeasure[k]).replace('.', ',')}<small>${unit}</small></strong>${diff ? `<em>${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} ${unit}</em>` : ''}</div>`; }).join('')}</div>
      ${weights.length >= 2 ? `<h3 class="sub-title">Evolución del peso</h3>${weightChart(weights.slice(-12))}` : ''}
    </section>` : ''}

    <section class="p-card">
      <div class="p-card-head"><div><h2>Últimos ingresos</h2><p class="muted">${m.lastCheckin ? `Tu última visita fue el ${esc(visitTime(m.lastCheckin))}.` : 'Todavía no hay ingresos registrados.'}</p></div></div>
      ${data.visits.length ? `<div class="visits">${[...data.visits].reverse().slice(0, 12).map(v => `<span>${esc(visitTime(v))}</span>`).join('')}</div>` : ''}
    </section>

    <p class="p-foot">Socio desde ${longDate(m.joinedAt)} · Los datos se actualizan con cada ingreso en recepción.</p>
  </main>`;
  root.querySelector('[data-logout]').addEventListener('click', async () => { await request('/api/member/logout', { method: 'POST', body: {} }).catch(() => {}); data = null; renderLogin(); });
  root.querySelectorAll('[data-goal]').forEach(button => button.addEventListener('click', () => { goal = Number(button.dataset.goal); localStorage.setItem('anversol-goal', String(goal)); const y = scrollY; renderDashboard(); scrollTo(0, y); }));
}

async function init() {
  try { data = await request('/api/member'); renderDashboard(); }
  catch (e) { renderLogin(e.status === 401 ? '' : e.message); }
}
init();
