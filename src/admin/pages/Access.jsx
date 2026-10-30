import { useEffect, useRef, useState } from 'react';
import { useApp, useUi, permissions } from '../context.js';
import { Avatar, Badge, Icon, Confirm, StatusBadge } from '../ui.jsx';
import { useActions } from '../actions.jsx';
import { AccessTable, byDate, todayCheckins, isBirthday } from './shared.jsx';
import { rpc } from '../../lib/supabase.js';
import { date, normalize, zone } from '../../lib/format.js';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <p className="access-clock">{now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: zone })}</p>;
}

export default function Access() {
  const { data, user, ui, toast, refresh, openModal } = useApp();
  const actions = useActions();
  const can = permissions(user);
  const [filter, setFilter] = useUi('accessFilter');
  const [result, setResult] = useState(ui.accessResult);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('manual');
  const inputRef = useRef(null);
  // Con letras busca por nombre; con números sigue siendo DNI o número de socio. Los códigos QR nunca se buscan.
  const query = normalize(search).trim();
  const byName = method === 'manual' && /\p{L}/u.test(query);
  const matches = byName ? data.members.filter(x => query.split(/\s+/).every(word => normalize(x.name).includes(word))).sort((a, b) => a.name.localeCompare(b.name, 'es')) : [];
  const today = todayCheckins(data);
  const list = byDate(today).filter(c => filter === 'todos' || (filter === 'dentro' ? c.allowed && !c.checkout_at : !c.allowed));
  const insideCount = today.filter(c => c.allowed && !c.checkout_at).length;

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => { ui.accessResult = null; setResult(null); }, 15000);
    return () => clearTimeout(timer);
  }, [result]);

  async function checkin(identifier, method = 'manual', override = false) {
    const value = await rpc('register_checkin', { p_identifier: identifier, p_method: method, p_override: override });
    ui.accessResult = value;
    setResult(value);
    await refresh();
  }

  async function enter(identifier, how = 'manual') {
    setBusy(true);
    try {
      await checkin(identifier, how);
      setSearch('');
    } catch (error) { toast(error.message, 'error'); }
    setBusy(false);
    inputRef.current?.focus();
  }

  function submit(e) {
    e.preventDefault();
    if (!byName) return enter(search, method);
    if (matches.length === 1) return enter(matches[0].id);
    toast(matches.length ? 'Hay varios socios con ese nombre. Elegí uno de la lista.' : 'No se encontró un socio con ese nombre.', 'error');
  }

  const m = result?.member;
  return <>
    <div className="access-layout">
      <section className="card access-entry">
        <div className="access-entry-head">
          <span className="access-symbol"><Icon name="fingerprint" size={38} /></span>
          <Clock />
          <h2>Una nueva visita.<br />Un nuevo objetivo.</h2>
          <p>Identificá al socio para registrar su ingreso.</p>
          <span className="inside-chip">{insideCount} personas dentro ahora</span>
        </div>
        <form onSubmit={submit}>
          <label className="field"><span>Nombre, DNI o número de socio</span><input ref={inputRef} name="identifier" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ej. Juan Pérez o 35123456" autoComplete="off" required autoFocus /></label>
          {byName && <div className="access-matches">{matches.length ? matches.slice(0, 6).map(x => <button key={x.id} type="button" className="access-match" disabled={busy} onClick={() => enter(x.id)}>
            <Avatar person={x} /><span><strong>{x.name}</strong><small className="muted">Socio #{x.number}</small></span><StatusBadge member={x} />
          </button>) : <p className="muted small">No hay socios con ese nombre.</p>}{matches.length > 6 && <p className="muted small">Hay {matches.length} coincidencias. Seguí escribiendo para acotar.</p>}</div>}
          <label className="field"><span>Identificación</span><select name="method" value={method} onChange={e => setMethod(e.target.value)}><option value="manual">Nombre / DNI / número de socio</option><option value="qr">Código de lector QR</option></select></label>
          <button className="btn btn-primary full" type="submit" disabled={busy}><Icon name="door" size={18} />Registrar ingreso</button>
        </form>
        <div className="reader-note"><Icon name="fingerprint" size={18} /><span>Lector de huellas pendiente de instalación.<br />El ingreso manual está disponible.</span></div>
      </section>
      <section className="card access-result">
        {!result ? <>
          <div className="waiting-pulse"><Icon name="door" size={40} /></div>
          <span className="eyebrow">RECEPCIÓN ANVERSOL</span>
          <h2>Listos para recibirte.</h2>
          <p className="muted">Ingresá un nombre o DNI, o escaneá el código del socio.<br />Su estado de acceso aparecerá acá.</p>
          <Badge tone="green">Control de acceso disponible</Badge>
        </> : <div className={`checkin-result ${result.allowed ? 'allowed' : 'denied'}`}>
          <Avatar person={m} />
          <span className="eyebrow">{result.allowed ? '¡BIENVENIDO!' : 'REVISAR ACCESO'}</span>
          <h2>{m.name}</h2>
          <Badge tone={result.allowed ? 'green' : 'red'}>{result.allowed ? 'ACCESO HABILITADO' : 'ACCESO DENEGADO'}</Badge>
          <p>{result.reason || 'Que tengas un gran entrenamiento.'}</p>
          <div className="access-meta"><span>Plan<strong>{m.plan_name || 'Sin plan'}</strong></span><span>Vencimiento<strong>{m.becado ? 'Sin vencimiento' : m.paused_at ? `En pausa · ${m.days_left} días` : date(m.expires_at)}</strong></span></div>
          {isBirthday(m, data.today) && <p>🎂 ¡Hoy es tu cumpleaños!</p>}
          {m.medical_expires_at && m.medical_expires_at < data.today && <p className="amber-text">Apto físico vencido</p>}
          {!result.allowed && m.status === 'vencido' && data.settings.allow_expired_override && <button type="button" className="btn btn-secondary" onClick={() => openModal(<Confirm title="Autorizar ingreso excepcional" message="Se registrará quién autorizó el ingreso con cuota vencida." onConfirm={() => checkin(m.id, 'manual', true)} />)}>Autorizar ingreso excepcional</button>}
          {!result.allowed && can.pay && (m.status === 'vencido' || m.state === 'baja') && <button type="button" className="btn btn-primary" onClick={() => actions.payment(m.id)}>Renovar cuota</button>}
          {!result.allowed && can.desk && m.paused_at && <button type="button" className="btn btn-primary" onClick={() => openModal(<Confirm title="Reanudar membresía" message={`Le quedan ${m.days_left} días. Se reanudará y se registrará el ingreso.`} onConfirm={async () => { await rpc('resume_member', { p_member: m.id }); await checkin(m.id); }} />)}>Reanudar e ingresar</button>}
        </div>}
      </section>
    </div>
    <section className="card">
      <div className="card-head"><div><h2>Movimiento de hoy</h2><p className="muted">{today.filter(c => c.allowed).length} ingresos · {insideCount} personas dentro</p></div>
        <select aria-label="Filtrar ingresos" value={filter} onChange={e => setFilter(e.target.value)}>{[['todos', 'Todos los registros'], ['dentro', 'Dentro del gimnasio'], ['denegados', 'Accesos denegados']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
      <AccessTable list={list} />
    </section>
  </>;
}
