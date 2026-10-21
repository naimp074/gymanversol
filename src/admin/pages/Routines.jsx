import { useApp, permissions } from '../context.js';
import { Avatar, Badge, Button, Confirm, Empty, Field, Heading, Modal, SelectField, TextArea } from '../ui.jsx';
import { teacherOptions, teacherName, memberName } from './Classes.jsx';
import { rpc } from '../../lib/supabase.js';

export const memberOptions = data => data.members.filter(m => m.state !== 'baja').map(m => ({ value: m.id, label: `${m.name} · #${m.number || m.dni}` }));

function RoutineModal({ routine: r }) {
  const { data, toast } = useApp();
  async function save(fd) {
    if (!String(fd.get('days') || '').trim()) throw new Error('Agregá los ejercicios de la rutina.');
    await rpc('save_routine', { p_id: r?.id || null, p: Object.fromEntries(fd) });
    toast('Rutina guardada.');
  }
  return <Modal title={r ? 'Editar rutina' : 'Nueva rutina'} wide onSubmit={save}>
    <div className="form-grid">
      <SelectField label="Socio" name="member_id" defaultValue={r?.member_id || ''} options={memberOptions(data)} />
      <SelectField label="Profesor" name="teacher_id" defaultValue={r?.teacher_id || ''} options={teacherOptions(data)} />
      <Field label="Nombre de la rutina" name="name" defaultValue={r?.name} required placeholder="Fuerza · Ciclo 1" maxLength={120} />
      <Field label="Objetivo" name="goal" defaultValue={r?.goal} placeholder="Ganar fuerza y mejorar técnica" />
      <TextArea label="Días, ejercicios, series y repeticiones" name="days" className="full" defaultValue={r?.days} />
      <TextArea label="Indicaciones y observaciones" name="notes" className="full" defaultValue={r?.notes} />
    </div>
    <p className="muted">Ejemplo: Lunes · Piernas — Sentadilla: 4 × 10 · Descanso: 90 segundos.</p>
  </Modal>;
}

function RoutineView({ id }) {
  const { data, user, openModal, toast } = useApp();
  const r = data.routines.find(item => item.id === id);
  if (!r) return null;
  const trainer = permissions(user).trainer;
  const remove = () => openModal(<Confirm title="Eliminar rutina" message="La rutina se eliminará. Esta operación quedará registrada en la auditoría." onConfirm={async () => { await rpc('delete_routine', { p_id: id }); toast('Rutina eliminada.'); }} />);
  return <Modal title={r.name} wide>
    <div className="report-document"><h3>{memberName(data, r.member_id)}</h3><p className="muted">{teacherName(data, r.teacher_id)} · {r.goal || 'Rutina personalizada'}</p><div className="routine-days">{r.days}</div>{r.notes && <p>{r.notes}</p>}</div>
    <div className="toolbar-actions no-print"><Button icon="printer" onClick={() => window.print()}>Imprimir / guardar PDF</Button>{trainer && <Button className="btn-danger" onClick={remove}>Eliminar rutina</Button>}</div>
  </Modal>;
}

export default function Routines() {
  const { data, user, openModal, toast } = useApp();
  const trainer = permissions(user).trainer;
  const create = () => memberOptions(data).length ? openModal(<RoutineModal />) : toast('Registrá un socio antes de crear su rutina.', 'error');
  return <>
    <Heading title="Entrenamiento con dirección" sub="Rutinas personalizadas para acompañar a tus socios." actions={trainer && <Button className="btn-primary" icon="plus" onClick={create}>Crear rutina</Button>} />
    {data.routines.length ? <div className="grid-2">{data.routines.map(r => <article key={r.id} className="card routine-card">
      <div className="card-head"><div className="member-inline"><Avatar person={data.members.find(m => m.id === r.member_id) || { name: memberName(data, r.member_id) }} /><div><strong>{memberName(data, r.member_id)}</strong><small className="muted">{teacherName(data, r.teacher_id)}</small></div></div><Badge>Entrenamiento</Badge></div>
      <h3>{r.name}</h3>
      <p className="muted">{r.goal || 'Acompañar el progreso del socio'}</p>
      <div className="routine-preview">{(r.days || '').slice(0, 240)}{(r.days || '').length > 240 ? '…' : ''}</div>
      <div className="toolbar-actions"><Button className="btn-secondary btn-sm" onClick={() => openModal(<RoutineView id={r.id} />)}>Ver rutina</Button>{trainer && <Button className="btn-secondary btn-sm" icon="edit" onClick={() => openModal(<RoutineModal routine={r} />)}>Editar</Button>}</div>
    </article>)}</div> : <div className="card"><Empty message="Creá una rutina y asignala a un socio para comenzar." /></div>}
  </>;
}
