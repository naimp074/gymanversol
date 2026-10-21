import { addDays, localDay } from '../lib/format.js';

const weekStart = day => { const d = new Date(`${day}T12:00:00Z`); return addDays(day, -((d.getUTCDay() + 6) % 7)); };
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// Constancia del socio: días distintos entrenados por semana en las últimas 12 semanas.
export function attendanceStats(checkins, today) {
  const days = [...new Set(checkins.filter(c => c.allowed).map(c => localDay(c.date)))].sort();
  const set = new Set(days);
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(thisWeek, -7 * (11 - i));
    let count = 0;
    for (let d = 0; d < 7; d++) if (set.has(addDays(start, d))) count++;
    return { start, count, current: start === thisWeek };
  });
  const firstWeek = days.length ? weekStart(days[0]) : thisWeek;
  const complete = weeks.filter(w => !w.current && w.start >= firstWeek);
  const average = complete.length ? complete.reduce((s, w) => s + w.count, 0) / complete.length : 0;
  let streak = 0;
  let cursor = weeks.at(-1).count ? thisWeek : addDays(thisWeek, -7);
  while (cursor >= firstWeek) {
    let has = false;
    for (let d = 0; d < 7 && !has; d++) has = set.has(addDays(cursor, d));
    if (!has) break;
    streak++;
    cursor = addDays(cursor, -7);
  }
  const last30 = days.filter(d => d >= addDays(today, -29)).length;
  const last = days.at(-1) || null;
  const frequency = !days.length ? { label: 'Sin asistencia', tone: 'neutral' }
    : last && daysBetween(last, today) > 14 ? { label: 'Dejó de venir', tone: 'red' }
    : average >= 3 ? { label: 'Viene seguido', tone: 'green' }
    : average >= 1 ? { label: 'Regular', tone: 'amber' }
    : { label: 'Poco frecuente', tone: 'red' };
  return { weeks, average, streak, last30, last, daysSinceLast: last ? daysBetween(last, today) : null, frequency };
}

// Cada pago comparado con el vencimiento anterior: a tiempo si renovó antes de vencer.
export function paymentTimeline(payments) {
  const sorted = [...payments].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = sorted.map((p, i) => {
    const previous = sorted[i - 1];
    const late = previous ? daysBetween(previous.expires_at, localDay(p.date)) : null;
    return { ...p, late, onTime: late === null ? null : late <= 0 };
  });
  const renewals = rows.filter(r => r.onTime !== null);
  return {
    rows: rows.reverse(),
    total: sorted.reduce((s, p) => s + Number(p.amount || 0), 0),
    renewals: renewals.length,
    onTime: renewals.filter(r => r.onTime).length,
    averageLate: renewals.filter(r => !r.onTime).length ? Math.round(renewals.filter(r => !r.onTime).reduce((s, r) => s + r.late, 0) / renewals.filter(r => !r.onTime).length) : 0
  };
}

export function monthlyPayments(payments, today, months = 12) {
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (months - 1 - i));
    const key = d.toISOString().slice(0, 7);
    const label = new Date(`${key}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
    const long = new Date(`${key}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return { key, label, long, values: { pagos: payments.filter(p => localDay(p.date).slice(0, 7) === key).reduce((s, p) => s + Number(p.amount || 0), 0) } };
  });
}
