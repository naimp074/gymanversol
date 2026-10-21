import { useApp, permissions } from '../context.js';
import { Badge, Button, Check, Empty, Field, Heading, Icon, Modal, TextArea, Confirm } from '../ui.jsx';
import { rpc } from '../../lib/supabase.js';
import { money } from '../../lib/format.js';

function PlanModal({ plan: p }) {
  const { toast } = useApp();
  async function save(fd) {
    const values = Object.fromEntries(fd);
    values.active = fd.has('active');
    if (values.start_time >= values.end_time) throw new Error('El horario de cierre debe ser posterior al de apertura.');
    await rpc('save_plan', { p_id: p?.id || null, p: values });
    toast(p ? 'Plan actualizado.' : 'Plan creado.');
  }
  return <Modal title={p ? 'Editar plan' : 'Nuevo plan'} wide onSubmit={save}>
    <div className="form-grid">
      <Field label="Nombre del plan" name="name" defaultValue={p?.name} required maxLength={100} />
      <Field label="Precio (ARS)" name="price" type="number" defaultValue={p?.price} required min="0" step="1" />
      <Field label="Duración en días" name="duration" type="number" defaultValue={p?.duration || 30} required min="1" max="3650" />
      <Field label="Accesos por período · 0 = ilimitados" name="access_limit" type="number" defaultValue={p?.access_limit || 0} required min="0" step="1" />
      <Field label="Horario desde" name="start_time" type="time" defaultValue={p?.start_time || '06:00'} required />
      <Field label="Horario hasta" name="end_time" type="time" defaultValue={p?.end_time || '23:00'} required />
      <Field label="Descuento del plan (%)" name="discount" type="number" defaultValue={Number(p?.discount) || 0} min="0" max="100" step="1" />
      <TextArea label="Descripción" name="description" className="full" defaultValue={p?.description} />
      <Check label="Plan disponible para nuevas membresías" name="active" defaultChecked={p?.active !== false} />
    </div>
  </Modal>;
}

export default function Plans() {
  const { data, user, openModal, toast } = useApp();
  const admin = permissions(user).admin;
  const plans = data.plans;
  const toggle = p => openModal(<Confirm
    title={p.active === false ? 'Activar plan' : 'Desactivar plan'}
    message={p.active === false ? 'El plan volverá a estar disponible para contratar.' : 'El plan dejará de ofrecerse. Las membresías existentes conservarán su fecha de vencimiento.'}
    onConfirm={async () => { await rpc('save_plan', { p_id: p.id, p: { active: p.active === false } }); toast('Estado del plan actualizado.'); }} />);

  return <>
    <Heading title="Una membresía para cada objetivo" sub="Definí precios, duración y condiciones de acceso." actions={admin && <Button className="btn-primary" icon="plus" onClick={() => openModal(<PlanModal />)}>Crear plan</Button>} />
    {plans.length ? <div className="grid-3 plans-grid">{plans.map((p, index) => <article key={p.id} className={`card plan-card ${index === 1 ? 'featured' : ''}`}>
      <div className="card-head"><span className="plan-icon"><Icon name={index % 2 ? 'zap' : 'layers'} size={22} /></span><Badge tone={p.active === false ? 'neutral' : 'green'}>{p.active === false ? 'Inactivo' : 'Disponible'}</Badge></div>
      <h3>{p.name}</h3>
      <p className="muted">{p.description || 'Entrená a tu ritmo, cumplí tus metas.'}</p>
      <div className="plan-price">{money(p.price)}<small> / {p.duration} días</small></div>
      <ul className="plan-features">
        <li><Icon name="check" size={16} /> {p.access_limit ? `${p.access_limit} accesos por membresía` : 'Accesos ilimitados'}</li>
        <li><Icon name="clock" size={16} /> De {p.start_time || '06:00'} a {p.end_time || '23:00'}</li>
        <li><Icon name="users" size={16} /> {data.members.filter(m => m.plan_id === p.id && m.status === 'activo').length} socios activos</li>
        {Number(p.discount) > 0 && <li><Icon name="tag" size={16} /> {Number(p.discount)}% de descuento aplicado al cobrar</li>}
      </ul>
      {admin && <div className="toolbar-actions"><Button onClick={() => openModal(<PlanModal plan={p} />)}>Editar plan</Button><Button className="btn-sm btn-secondary" onClick={() => toggle(p)}>{p.active === false ? 'Activar' : 'Desactivar'}</Button></div>}
    </article>)}</div> : <div className="card"><Empty message="Creá tu primer plan para comenzar a cobrar membresías." /></div>}
  </>;
}
