import { useApp, useUi, permissions } from '../context.js';
import { Badge, Button, Confirm, Empty, Field, Heading, Icon, Modal, SelectField, Table, TextArea } from '../ui.jsx';
import { rpc } from '../../lib/supabase.js';
import { date } from '../../lib/format.js';

export const teacherOptions = data => [{ value: '', label: 'Sin profesor asignado' }, ...data.teachers.filter(t => t.state !== 'inactivo').map(t => ({ value: t.id, label: t.name }))];
export const teacherName = (data, id) => data.teachers.find(t => t.id === id)?.name || 'Sin asignar';
export const memberName = (data, id) => data.members.find(m => m.id === id)?.name || 'Socio';

function ClassModal({ cls: c }) {
  const { data, toast } = useApp();
  return <Modal title={c ? 'Editar clase' : 'Programar clase'} wide onSubmit={async fd => { await rpc('save_class', { p_id: c?.id || null, p: Object.fromEntries(fd) }); toast('Clase guardada.'); }}>
    <div className="form-grid">
      <Field label="Nombre de la clase" name="name" defaultValue={c?.name} required maxLength={100} />
      <SelectField label="Profesor" name="teacher_id" defaultValue={c?.teacher_id || ''} options={teacherOptions(data)} />
      <Field label="Fecha" name="date" type="date" defaultValue={c?.date || data.today} required />
      <Field label="Hora de inicio" name="time" type="time" defaultValue={c?.time || '18:00'} required />
      <Field label="Duración (minutos)" name="duration" type="number" defaultValue={c?.duration || 60} required min="5" max="480" step="1" />
      <Field label="Cupo de personas" name="capacity" type="number" defaultValue={c?.capacity || 20} required min="1" max="500" step="1" />
      <TextArea label="Descripción" name="description" className="full" defaultValue={c?.description} />
    </div>
  </Modal>;
}

function Reservations({ classId }) {
  const { data, user, toast, refresh } = useApp();
  const can = permissions(user);
  const c = data.classes.find(item => item.id === classId);
  if (!c) return null;
  const reservations = data.reservations.filter(r => r.class_id === classId);
  const canBook = can.reserve && c.date >= data.today && reservations.length < c.capacity;
  const available = data.members.filter(m => m.status === 'activo' && (!m.expires_at || m.expires_at >= c.date) && !reservations.some(r => r.member_id === m.id));
  async function cancel(id) {
    try { await rpc('delete_reservation', { p_id: id }); await refresh(); toast('Reserva cancelada.'); }
    catch (error) { toast(error.message, 'error'); }
  }
  const book = canBook && available.length > 0;
  return <Modal title={`Reservas · ${c.name}`} wide submitLabel="Reservar" onSubmit={book ? async fd => { await rpc('create_reservation', { p_class: c.id, p_member: fd.get('member_id') }); toast('Lugar reservado.'); } : null}>
    <div className="notice">{date(c.date)} · {c.time} · {reservations.length} de {c.capacity} lugares reservados</div>
    <Table headers={['Socio', 'Reserva', '']} empty="Todavía no hay reservas para esta clase." rows={reservations.map(r => <tr key={r.id}><td>{memberName(data, r.member_id)}</td><td>{date(r.created_at || c.date)}</td><td>{can.reserve && <Button className="btn-danger btn-sm" onClick={() => cancel(r.id)}>Cancelar</Button>}</td></tr>)} />
    {book ? <div className="stack"><SelectField label="Agregar socio con membresía activa" name="member_id" options={available.map(m => ({ value: m.id, label: m.name }))} /><p className="muted">Reservar agrega una reserva a esta clase.</p></div>
      : <p className="muted">{c.date < data.today ? 'Esta clase ya finalizó.' : reservations.length >= c.capacity ? 'La clase está completa.' : 'No hay otros socios activos disponibles para reservar.'}</p>}
  </Modal>;
}

export default function Classes() {
  const { data, user, openModal, toast } = useApp();
  const can = permissions(user);
  const [classDate, setClassDate] = useUi('classDate');
  const classes = data.classes.filter(c => !classDate || c.date === classDate).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const upcoming = classes.filter(c => c.date >= data.today);
  const show = [...upcoming, ...classes.filter(c => c.date < data.today).reverse()];
  const remove = c => openModal(<Confirm title="Eliminar clase" message="Se cancelarán las reservas de esta clase. Esta operación queda en la auditoría." onConfirm={async () => { await rpc('delete_class', { p_id: c.id }); toast('Clase eliminada.'); }} />);
  return <>
    <Heading title="Encontrá tu próxima clase" sub="Organizá las sesiones y administrá sus reservas." actions={can.schedule && <Button className="btn-primary" icon="plus" onClick={() => openModal(<ClassModal />)}>Programar clase</Button>} />
    <div className="toolbar"><div className="toolbar-actions">
      <label className="field"><span>Filtrar por fecha</span><input type="date" value={classDate} onChange={e => setClassDate(e.target.value)} /></label>
      {classDate && <Button className="btn-secondary btn-sm" onClick={() => setClassDate('')}>Ver todas</Button>}
    </div><span className="muted">{upcoming.length} sesiones próximas</span></div>
    {show.length ? <div className="grid-3">{show.map(c => {
      const reserved = data.reservations.filter(r => r.class_id === c.id).length;
      const complete = reserved >= Number(c.capacity);
      const finished = c.date < data.today;
      return <article key={c.id} className="card class-card">
        <div className="card-head"><span className="class-date">{date(c.date)}</span><Badge tone={finished ? 'neutral' : complete ? 'amber' : 'green'}>{finished ? 'Finalizada' : complete ? 'Completa' : 'Con lugares'}</Badge></div>
        <h3>{c.name}</h3>
        <p className="muted">{c.description || 'Movete, conectá y entrená en equipo.'}</p>
        <div className="stack"><span><Icon name="clock" size={17} /> {c.time} · {c.duration} min</span><span><Icon name="user" size={17} /> {teacherName(data, c.teacher_id)}</span></div>
        <div className="capacity-label"><span>{reserved} / {c.capacity} reservas</span><span>{Math.max(0, c.capacity - reserved)} libres</span></div>
        <div className="progress-track"><span className="progress-fill" style={{ width: `${Math.min(100, reserved / Math.max(1, Number(c.capacity)) * 100)}%` }}></span></div>
        <div className="toolbar-actions">
          <Button className="btn-secondary btn-sm" onClick={() => openModal(<Reservations classId={c.id} />)}>Ver reservas</Button>
          {can.schedule && <><Button className="btn-secondary btn-sm" onClick={() => openModal(<ClassModal cls={c} />)}>Editar</Button><Button className="btn-danger btn-sm" onClick={() => remove(c)}>Eliminar</Button></>}
        </div>
      </article>;
    })}</div> : <div className="card"><Empty message="No hay clases programadas para esta fecha." /></div>}
  </>;
}
