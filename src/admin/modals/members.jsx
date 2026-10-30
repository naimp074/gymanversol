import { useEffect, useState } from 'react';
import { useApp, permissions, methods } from '../context.js';
import { Modal, Field, SelectField, TextArea, Avatar, Badge, Empty, Icon, StatusBadge, Logo } from '../ui.jsx';
import { useActions } from '../actions.jsx';
import { messageFor, messageTemplates, openWhatsApp } from '../messages.js';
import { rpc } from '../../lib/supabase.js';
import { money, date, time, addDays } from '../../lib/format.js';
import { readAttachment } from '../../lib/image.js';
import { qrSvg } from '../../lib/qr.js';
import { ColumnChart, SERIES, INK, compactMoney } from '../charts.jsx';
import { attendanceStats, paymentTimeline, monthlyPayments } from '../memberStats.js';

const byDate = list => [...list].sort((a, b) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));
const days = n => `${n} ${n === 1 ? 'día' : 'días'}`;

function MemberAttendance({ checkins, today }) {
  const s = attendanceStats(checkins, today);
  return <>
    <div className="card-head"><h3 className="section-title">Asistencia</h3><Badge tone={s.frequency.tone}>{s.frequency.label}</Badge></div>
    <div className="member-progress-stats">
      <div><span>Últimos 30 días</span><strong>{s.last30}</strong><small>días entrenados</small></div>
      <div><span>Promedio semanal</span><strong>{s.average.toFixed(1).replace('.', ',')}</strong><small>días por semana</small></div>
      <div><span>Racha</span><strong>{s.streak}</strong><small>{s.streak === 1 ? 'semana seguida' : 'semanas seguidas'}</small></div>
      <div><span>Última visita</span><strong>{s.last ? (s.daysSinceLast === 0 ? 'Hoy' : `Hace ${days(s.daysSinceLast)}`) : '—'}</strong><small>{s.last ? date(s.last) : 'Sin visitas'}</small></div>
    </div>
    <p className="muted small">Días distintos que vino en cada una de las últimas 12 semanas.</p>
    <ColumnChart label="Días entrenados por semana" table={false} height={170}
      data={s.weeks.map(w => ({ key: w.start, label: w.current ? 'Esta' : new Date(`${w.start}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' }), long: `Semana del ${date(w.start)}`, values: { dias: w.count } }))}
      series={[{ key: 'dias', label: 'Días', color: SERIES.cuotas }]} format={days} axisFormat={v => String(v)} />
  </>;
}

function MemberPayments({ payments, plans, today }) {
  const t = paymentTimeline(payments);
  const planName = id => plans.find(x => x.id === id)?.name || 'Membresía';
  return <>
    <h3 className="section-title">Pagos</h3>
    <div className="member-progress-stats">
      <div><span>Total pagado</span><strong>{money(t.total)}</strong><small>{payments.length} {payments.length === 1 ? 'pago' : 'pagos'}</small></div>
      <div><span>Renovó a tiempo</span><strong>{t.renewals ? `${t.onTime} de ${t.renewals}` : '—'}</strong><small>{t.renewals ? `${Math.round(t.onTime / t.renewals * 100)}% de las renovaciones` : 'Todavía sin renovaciones'}</small></div>
      <div><span>Atraso promedio</span><strong>{t.renewals - t.onTime ? days(t.averageLate) : '—'}</strong><small>cuando pagó tarde</small></div>
      <div><span>Último pago</span><strong>{t.rows[0] ? money(t.rows[0].amount) : '—'}</strong><small>{t.rows[0] ? date(t.rows[0].date) : 'Sin pagos'}</small></div>
    </div>
    {payments.length ? <>
      <ColumnChart label="Pagos por mes" table={false} height={170} data={monthlyPayments(payments, today)} series={[{ key: 'pagos', label: 'Pagado', color: INK }]} format={money} axisFormat={compactMoney} />
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Plan</th><th>Método</th><th>Importe</th><th>Puntualidad</th></tr></thead>
        <tbody>{t.rows.map(p => <tr key={p.id}><td>{date(p.date)}</td><td>{planName(p.plan_id)}</td><td>{p.method}</td><td>{money(p.amount)}</td>
          <td>{p.onTime === null ? <Badge>Primer pago</Badge> : p.onTime ? <Badge tone="green">A tiempo</Badge> : <Badge tone={p.late > 7 ? 'red' : 'amber'}>{`${days(p.late)} tarde`}</Badge>}</td></tr>)}</tbody></table></div>
    </> : <Empty message="Todavía no hay pagos registrados." />}
  </>;
}

export function MemberForm({ id }) {
  const { data, user, toast } = useApp();
  const m = data.members.find(x => x.id === id) || {};
  async function save(fd) {
    const body = Object.fromEntries([...fd].filter(([key]) => !key.endsWith('_upload')));
    const photo = await readAttachment(fd.get('photo_upload'), { maxMb: 0.35, maxSize: 640 });
    const medicalUpload = fd.get('medical_upload');
    const medical = await readAttachment(medicalUpload, { pdf: true, maxMb: 4 });
    if (photo) body.photo = photo;
    if (medical) { body.medical_file = medical; body.medical_file_name = medicalUpload.name; }
    await rpc('save_member', { p_id: id || null, p: body });
    toast(id ? 'Ficha actualizada.' : 'Socio registrado. Ya podés activar su membresía.');
  }
  return <Modal title={id ? 'Editar ficha del socio' : 'Un nuevo comienzo'} wide onSubmit={save}>
    <div className="form-intro"><span className="soft-icon peach"><Icon name="users" size={25} /></span><p>{id ? 'Mantené la información del socio actualizada.' : 'Completá la ficha. Después podrás registrar el pago de su primera membresía.'}</p></div>
    <div className="form-grid">
      <Field label="Nombre y apellido *" name="name" defaultValue={m.name} required maxLength={120} autoComplete="name" />
      <Field label="DNI *" name="dni" defaultValue={m.dni} required inputMode="numeric" pattern="[0-9]{5,12}" maxLength={12} />
      <Field label="Fecha de nacimiento" name="birth_date" type="date" defaultValue={m.birth_date} max={data.today} />
      <Field label="Teléfono" name="phone" type="tel" defaultValue={m.phone} />
      <Field label="WhatsApp (código de país incluido)" name="whatsapp" type="tel" defaultValue={m.whatsapp} placeholder="54911…" />
      <Field label="Email" name="email" type="email" defaultValue={m.email} />
      <div className="full"><Field label="Dirección" name="address" defaultValue={m.address} /></div>
      <Field label="Contacto de emergencia" name="emergency_name" defaultValue={m.emergency_name} />
      <Field label="Teléfono de emergencia" name="emergency_phone" type="tel" defaultValue={m.emergency_phone} />
      <Field label="Fecha de alta" name="joined_at" type="date" defaultValue={m.joined_at || data.today} required />
      <SelectField label="Estado del socio" name="state" defaultValue={m.state || 'activo'} options={[{ value: 'activo', label: 'Activo (según su cuota)' }, { value: 'suspendido', label: 'Suspendido' }, { value: 'baja', label: 'Baja' }]} />
      {permissions(user).admin && <SelectField label="Tipo de socio" name="becado" defaultValue={m.becado ? 'true' : 'false'} options={[{ value: 'false', label: 'Paga cuota' }, { value: 'true', label: 'Becado (no paga ni vence)' }]} />}
      <Field label="Vencimiento del apto físico" name="medical_expires_at" type="date" defaultValue={m.medical_expires_at} />
      <label className="field"><span>Foto del socio · cámara o galería</span><input name="photo_upload" type="file" accept="image/*" capture="environment" /></label>
      <label className="field full"><span>Certificado médico · foto, galería o PDF</span><input name="medical_upload" type="file" accept="image/*,application/pdf" /></label>
      <TextArea label="Observaciones" name="notes" className="full" rows={3} maxLength={3000} defaultValue={m.notes} />
    </div>
    <p className="muted small">La membresía se activa al registrar un pago, salvo en los socios becados. La huella se podrá asociar cuando se integre un lector compatible.</p>
  </Modal>;
}

export function MemberDetail({ id }) {
  const { data, user, toast } = useApp();
  const actions = useActions();
  const can = permissions(user);
  const m = data.members.find(x => x.id === id);
  if (!m) return null;
  const payments = byDate(data.payments.filter(p => p.member_id === id));
  const checkins = byDate(data.checkins.filter(c => c.member_id === id));
  const routines = data.routines.filter(r => r.member_id === id);
  const measurements = byDate(data.measurements.filter(r => r.member_id === id));
  async function downloadMedical() {
    try {
      const file = await rpc('member_medical_file', { p_member: id });
      if (!file?.file) throw new Error('No hay certificado cargado.');
      const link = document.createElement('a');
      link.href = file.file;
      link.download = file.name || 'certificado';
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) { toast(error.message, 'error'); }
  }
  const details = [['DNI', m.dni], ['Fecha de nacimiento', date(m.birth_date)], ['Teléfono', m.phone], ['WhatsApp', m.whatsapp], ['Email', m.email], ['Dirección', m.address], ['Fecha de alta', date(m.joined_at)], ['Vencimiento', m.becado ? 'Sin vencimiento · socio becado' : m.paused_at ? `En pausa desde el ${date(m.paused_at)} · le quedan ${days(m.days_left)}` : date(m.expires_at)], ['Último pago', date(m.last_payment)], ['Contacto de emergencia', m.emergency_name !== undefined ? `${m.emergency_name || '—'} ${m.emergency_phone || ''}` : null], ['Apto físico', m.medical_expires_at !== undefined ? date(m.medical_expires_at) : null], ['Último ingreso', date(m.last_checkin)]];
  return <Modal title="Ficha del socio" wide>
    <div className="member-detail-hero"><Avatar person={m} /><div><span className="eyebrow">SOCIO #{m.number}</span><h2>{m.name}</h2><p>{m.plan_name || 'Sin membresía'}</p><StatusBadge member={m} /></div>
      {can.desk && <button type="button" className="btn btn-secondary" onClick={() => actions.memberForm(m.id)}><Icon name="edit" size={16} />Editar ficha</button>}</div>
    <div className="detail-grid">{details.map(([t, v]) => <div key={t}><span>{t}</span><strong>{v || '—'}</strong></div>)}</div>
    {m.has_medical_file && <button type="button" className="btn btn-secondary" onClick={downloadMedical}><Icon name="download" size={16} />Descargar certificado</button>}
    {m.notes && <div className="info-box"><p>{m.notes}</p></div>}
    <div className="row-actions member-detail-actions">
      {can.pay && !m.paused_at && !m.becado && <button type="button" className="btn btn-primary" onClick={() => actions.payment(m.id)}><Icon name="wallet" size={17} />Registrar pago</button>}
      {can.desk && m.status === 'activo' && <button type="button" className="btn btn-secondary" onClick={() => actions.confirm('Pausar membresía', `A ${m.name} le quedan ${days(m.days_left)}. Quedan congelados hasta que reanudes la membresía, y mientras tanto no podrá ingresar ni reservar clases.`, async () => { await rpc('pause_member', { p_member: m.id }); toast('Membresía en pausa.'); }, 'Pausar')}><Icon name="lock" size={17} />Pausar membresía</button>}
      {can.desk && m.paused_at && <button type="button" className="btn btn-primary" onClick={() => actions.confirm('Reanudar membresía', `A ${m.name} le quedan ${days(m.days_left)}. El nuevo vencimiento será el ${date(addDays(data.today, m.days_left))}.`, async () => { await rpc('resume_member', { p_member: m.id }); toast('Membresía reanudada.'); }, 'Reanudar')}><Icon name="unlock" size={17} />Reanudar membresía</button>}
      {can.desk && <button type="button" className="btn btn-secondary" onClick={() => actions.whatsapp(m.id)}><Icon name="message" size={17} />WhatsApp</button>}
      <button type="button" className="btn btn-secondary" onClick={() => actions.credential(m.id)}><Icon name="qr" size={17} />Credencial</button>
    </div>
    <MemberAttendance checkins={checkins} today={data.today} />
    {can.finance && <MemberPayments payments={payments} plans={data.plans} today={data.today} />}
    <h3 className="section-title">Últimos ingresos</h3>
    {checkins.length ? <div className="mini-history">{checkins.slice(0, 8).map(c => <div key={c.id}><span>{date(c.date)} · {time(c.date)}</span><Badge tone={c.allowed ? 'green' : 'red'}>{c.allowed ? 'Habilitado' : 'Denegado'}</Badge></div>)}</div> : <Empty message="Todavía no hay ingresos registrados." />}
    <h3 className="section-title">Rutinas</h3>
    {routines.length ? routines.map(r => <div key={r.id} className="routine-preview"><strong>{r.name}</strong><p className="muted">{r.goal}</p><pre>{r.days}</pre></div>) : <p className="muted">Sin rutina asignada.</p>}
    {measurements.length > 0 && <><h3 className="section-title">Progreso físico</h3><div className="mini-history">{measurements.slice(0, 8).map(x => <div key={x.id}><span>{date(x.date)}</span><strong>{x.weight ? `${x.weight} kg` : ''} {x.height ? `· ${x.height} cm` : ''}</strong></div>)}</div></>}
  </Modal>;
}

function CashClosed() {
  const { closeModal, navigate } = useApp();
  return <Modal title="Primero, abrí la caja">
    <div className="empty"><Icon name="wallet" size={40} /><h3>La caja está cerrada</h3><p>Registrá el efectivo inicial antes de cobrar cuotas o hacer ventas.</p><button type="button" className="btn btn-primary" onClick={() => { closeModal(); navigate('caja'); }}>Ir a caja</button></div>
  </Modal>;
}

export function PaymentForm({ id }) {
  const { data, user, toast, closeModal } = useApp();
  const plans = data.plans.filter(p => p.active !== false);
  const members = data.members.filter(m => !m.becado);
  const fallback = members.find(m => m.id === id) || members[0];
  const [memberId, setMemberId] = useState(fallback?.id || '');
  const [planId, setPlanId] = useState(fallback?.plan_id && plans.some(p => p.id === fallback.plan_id) ? fallback.plan_id : plans[0]?.id || '');
  const [discount, setDiscount] = useState(0);
  const cashOpen = data.cash_sessions.some(s => !s.closed_at);
  const ready = members.length > 0 && plans.length > 0;
  useEffect(() => { if (cashOpen && !ready) { toast('Primero creá un socio y un plan activo.', 'error'); closeModal(); } }, [cashOpen, ready]);
  if (!cashOpen) return <CashClosed />;
  if (!ready) return null;

  const isAdmin = permissions(user).admin;
  const m = members.find(x => x.id === memberId);
  const p = plans.find(x => x.id === planId);
  const total = p ? Math.round(p.price * (1 - (Number(p.discount) || 0) / 100) * (1 - (Number(discount) || 0) / 100)) : 0;
  const expires = m && p ? addDays(m.expires_at && m.expires_at > data.today ? m.expires_at : data.today, p.duration) : null;

  async function save(fd) {
    const result = await rpc('register_payment', { p_member: fd.get('member_id'), p_plan: fd.get('plan_id'), p_method: fd.get('method'), p_discount: Number(fd.get('discount')) || 0 });
    toast(`Pago registrado. Vencimiento: ${date(result.member.expires_at)}.`);
  }
  return <Modal title="Registrar un pago" onSubmit={save} submitLabel="Confirmar pago">
    <div className="form-grid">
      <SelectField label="Socio" name="member_id" value={memberId} onChange={e => setMemberId(e.target.value)} options={members.map(x => ({ value: x.id, label: `${x.name} · #${x.number}` }))} />
      <SelectField label="Membresía" name="plan_id" value={planId} onChange={e => setPlanId(e.target.value)} options={plans.map(x => ({ value: x.id, label: `${x.name} · ${money(x.price)}` }))} />
      <SelectField label="Medio de pago" name="method" options={methods.map(v => ({ value: v, label: v }))} />
      {isAdmin ? <label className="field"><span>Descuento adicional (%)</span><input name="discount" type="number" min="0" max="100" step="1" value={discount} onChange={e => setDiscount(e.target.value)} /></label> : <input type="hidden" name="discount" value="0" />}
    </div>
    <div className="payment-preview"><span>Total a cobrar<strong>{money(total)}</strong></span><span>Nuevo vencimiento<strong>{date(expires)}</strong></span></div>
    <p className="muted small">La renovación se suma al vencimiento vigente si todavía está activo; si ya venció, comienza hoy.</p>
  </Modal>;
}

export function WhatsappDraft({ id, type }) {
  const { data } = useApp();
  const m = data.members.find(x => x.id === id);
  if (!m) return null;
  return <Modal title={messageTemplates[type] || 'Mensaje de WhatsApp'} submitLabel="Abrir WhatsApp" onSubmit={fd => { openWhatsApp(fd.get('phone'), fd.get('message')); }}>
    <div className="member-inline"><Avatar person={m} /><strong>{m.name}</strong></div>
    <Field label="WhatsApp (código de país incluido)" name="phone" type="tel" defaultValue={m.whatsapp || m.phone} required placeholder="54911…" />
    <TextArea label="Mensaje" name="message" rows={7} required defaultValue={messageFor(m, type, data.settings.gym_name)} />
    <p className="muted small">Se abrirá WhatsApp para que revises y envíes el mensaje.</p>
  </Modal>;
}

export function Credential({ id }) {
  const { data } = useApp();
  const m = data.members.find(x => x.id === id);
  if (!m) return null;
  return <Modal title="Credencial del socio">
    <div className="credential">
      <div className="brand"><Logo /></div>
      <Avatar person={m} />
      <h2>{m.name}</h2>
      <span>SOCIO #{m.number}</span>
      {m.qr_token && <div className="credential-code" dangerouslySetInnerHTML={{ __html: qrSvg(m.qr_token) }} />}
      <p>DNI {m.dni}</p>
      <p className="muted small">Presentá tu DNI o número de socio en recepción.</p>
    </div>
    <details><summary>Código para lector QR</summary><p className="muted small">Token personal. El lector debe transmitir este texto en el campo de ingreso QR.</p><code className="token-code">{m.qr_token || 'No disponible'}</code></details>
    <button type="button" className="btn btn-secondary" onClick={() => window.print()}><Icon name="download" size={16} />Imprimir credencial / PDF</button>
  </Modal>;
}
