export const zone = 'America/Argentina/Buenos_Aires';
export const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
export const date = value => !value ? '—' : new Date(String(value).length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('es-AR', { timeZone: zone });
export const time = value => !value ? '—' : new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: zone });
export const fullDate = value => value ? `${date(value)} · ${time(value)}` : '—';
export const localDay = value => !value ? '' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(new Date(value));
export const addDays = (value, n) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const normalize = value => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');
export const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
