import { useApp, permissions } from '../context.js';
import { Avatar, Badge, Button, Empty, Field, Heading, Icon, Modal, SelectField } from '../ui.jsx';
import { rpc } from '../../lib/supabase.js';
import { money } from '../../lib/format.js';

function TeacherModal({ teacher: t }) {
  const { toast } = useApp();
  return <Modal title={t ? 'Editar profesor' : 'Nuevo profesor'} wide onSubmit={async fd => { await rpc('save_teacher', { p_id: t?.id || null, p: Object.fromEntries(fd) }); toast('Ficha del profesor guardada.'); }}>
    <div className="form-grid">
      <Field label="Nombre y apellido" name="name" defaultValue={t?.name} required maxLength={120} />
      <Field label="Teléfono" name="phone" type="tel" defaultValue={t?.phone} />
      <Field label="Especialidad" name="specialty" defaultValue={t?.specialty} />
      <Field label="Horarios de trabajo" name="schedule" defaultValue={t?.schedule} placeholder="Lunes a viernes, de 16:00 a 22:00" />
      <Field label="Sueldo (ARS)" name="salary" type="number" defaultValue={t?.salary || 0} min="0" step="1" />
      <SelectField label="Estado" name="state" defaultValue={t?.state || 'activo'} options={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }]} />
    </div>
  </Modal>;
}

export default function Teachers() {
  const { data, user, openModal } = useApp();
  const admin = permissions(user.role).admin;
  const teachers = data.teachers;
  return <>
    <Heading title="El equipo que acompaña cada meta" sub="Profesores, especialidades y horarios de trabajo." actions={admin && <Button className="btn-primary" icon="plus" onClick={() => openModal(<TeacherModal />)}>Agregar profesor</Button>} />
    {teachers.length ? <div className="grid-3">{teachers.map(t => {
      const sessions = data.classes.filter(c => c.teacher_id === t.id && c.date >= data.today);
      const students = new Set(data.routines.filter(r => r.teacher_id === t.id).map(r => r.member_id)).size;
      return <article key={t.id} className="card teacher-card">
        <div className="card-head"><Avatar person={t} /><Badge tone={t.state === 'inactivo' ? 'neutral' : 'green'}>{t.state === 'inactivo' ? 'Inactivo' : 'Activo'}</Badge></div>
        <h3>{t.name}</h3>
        <p className="muted">{t.specialty || 'Entrenamiento general'}</p>
        <div className="stack"><div><Icon name="clock" size={16} /> {t.schedule || 'Horario a confirmar'}</div><div><Icon name="phone" size={16} /> {t.phone || 'Sin teléfono registrado'}</div></div>
        <div className="teacher-metrics"><span><strong>{sessions.length}</strong> próximas clases</span><span><strong>{students}</strong> alumnos con rutina</span></div>
        {t.salary !== undefined && <p className="muted">Sueldo: <strong>{money(t.salary || 0)}</strong></p>}
        {admin && <Button className="btn-secondary full-width" onClick={() => openModal(<TeacherModal teacher={t} />)}>Editar ficha</Button>}
      </article>;
    })}</div> : <div className="card"><Empty message="Todavía no hay profesores registrados." /></div>}
  </>;
}
