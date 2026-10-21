import { useState } from 'react';
import { useApp, permissions, roleLabels } from '../context.js';
import { Avatar, Badge, Button, Check, Empty, Field, KEEP_OPEN, Modal, SelectField, Table, TextArea } from '../ui.jsx';
import { rpc, signupClient, staffEmail, friendlyError } from '../../lib/supabase.js';
import { downloadBlob } from '../../lib/csv.js';

function SettingsModal({ access }) {
  const { data, toast } = useApp();
  const s = data.settings;
  async function save(fd) {
    const values = access
      ? { allow_expired_entry: fd.has('allow_expired_entry'), allow_expired_override: fd.has('allow_expired_override'), require_medical: fd.has('require_medical') }
      : Object.fromEntries(fd);
    await rpc('update_settings', { p: values });
    toast('Configuración guardada.');
  }
  if (access) return <Modal title="Reglas de ingreso" onSubmit={save}>
    <div className="stack">
      <Check label="Permitir ingresos con cuota vencida" name="allow_expired_entry" defaultChecked={s.allow_expired_entry} description="El sistema registrará el ingreso y mostrará el estado de la membresía." />
      <Check label="Permitir autorización de recepción para vencidos" name="allow_expired_override" defaultChecked={s.allow_expired_override} description="Recepción podrá autorizar expresamente una cuota vencida." />
      <Check label="Exigir apto físico vigente" name="require_medical" defaultChecked={s.require_medical} description="El socio deberá tener fecha de vencimiento del apto físico vigente." />
    </div>
  </Modal>;
  return <Modal title="Datos del gimnasio" wide onSubmit={save}>
    <div className="form-grid">
      <Field label="Nombre del gimnasio" name="gym_name" defaultValue={s.gym_name || 'Anversol Gym'} required maxLength={100} />
      <Field label="Teléfono" name="phone" type="tel" defaultValue={s.phone} />
      <div className="full"><Field label="Dirección" name="address" defaultValue={s.address} /></div>
      <p className="muted full"><strong>Sitio web público.</strong> Estos datos aparecen en la página principal del gimnasio.</p>
      <div className="full"><Field label="Frase principal" name="tagline" defaultValue={s.tagline} maxLength={160} placeholder="Entrená fuerte. Viví mejor." /></div>
      <TextArea label="Quiénes somos" name="about" className="full" defaultValue={s.about} />
      <div className="full"><Field label="Horarios de atención" name="hours" defaultValue={s.hours} maxLength={300} placeholder="Lunes a viernes 7 a 23 · Sábados 9 a 14" /></div>
      <Field label="WhatsApp (código de país incluido)" name="whatsapp" type="tel" defaultValue={s.whatsapp} placeholder="54911…" />
      <Field label="Instagram" name="instagram" defaultValue={s.instagram} placeholder="@anversolgym" />
      <Field label="Email de contacto" name="email" type="email" defaultValue={s.email} />
    </div>
  </Modal>;
}

function UserModal({ account: u }) {
  const { user, data, toast, refresh } = useApp();
  const allowedRoles = Object.entries(roleLabels).filter(([value]) => user.role === 'dueno' || value !== 'dueno' || u?.role === 'dueno').map(([value, label]) => ({ value, label }));
  async function save(fd) {
    const password = fd.get('password') || '';
    if (password && password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    if (u) {
      await rpc('save_user', { p_id: u.id, p: { name: fd.get('name'), role: fd.get('role'), active: fd.has('active') } });
      if (password) await rpc('admin_set_password', { p_user: u.id, p_password: password });
      toast('Usuario guardado.');
      return;
    }
    if (!password) throw new Error('La contraseña es obligatoria.');
    const username = String(fd.get('username') || '').trim().toLowerCase();
    const email = staffEmail(username);
    await rpc('create_staff_invite', { p: { name: fd.get('name'), username: username.split('@')[0], email, role: fd.get('role') } });
    const { data: signed, error } = await signupClient().auth.signUp({ email, password, options: { data: { name: fd.get('name'), username } } });
    if (error) throw new Error(/already registered/i.test(error.message) ? 'Ya existe una cuenta con ese usuario.' : friendlyError(error));
    if (!signed.session) toast('Supabase tiene activada la confirmación por email: el usuario no podrá entrar hasta desactivarla (Authentication → Sign In / Providers → Email → Confirm email).', 'error');
    const fresh = await refresh();
    if (!fresh?.users?.some(item => item.email === email)) {
      toast('La cuenta se creó, pero no quedó habilitada. Revisá que la confirmación por email esté desactivada en Supabase.', 'error');
      return KEEP_OPEN;
    }
    if (!fd.has('active')) {
      const created = fresh.users.find(item => item.email === email);
      await rpc('save_user', { p_id: created.id, p: { active: false } });
    }
    toast('Usuario creado. Compartí las credenciales de manera privada.');
  }
  return <Modal title={u ? 'Editar usuario' : 'Crear usuario'} wide onSubmit={save}>
    <div className="form-grid">
      <Field label="Nombre y apellido" name="name" defaultValue={u?.name} required maxLength={100} />
      <Field label="Nombre de usuario" name="username" defaultValue={u?.username} required autoComplete="off" maxLength={60} disabled={Boolean(u)} />
      <SelectField label="Rol de acceso" name="role" defaultValue={u?.role || 'recepcionista'} options={allowedRoles} />
      <Field label={u ? 'Nueva contraseña (opcional)' : 'Contraseña'} name="password" type="password" required={!u} minLength={8} autoComplete="new-password" />
      <Check label="Cuenta activa" name="active" defaultChecked={u?.active !== false} />
      <p className="muted full">Usá al menos 8 caracteres. Compartí las credenciales de manera privada. No se puede desactivar al último dueño.{u ? ' El nombre de usuario no se puede cambiar.' : ''}</p>
    </div>
  </Modal>;
}

export default function Settings() {
  const { data, user, openModal, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!permissions(user.role).admin) return <Empty message="Tu perfil no tiene acceso a esta sección." />;
  const s = data.settings;
  const origin = location.origin;

  async function backup() {
    setBusy(true);
    try {
      const value = await rpc('export_backup');
      downloadBlob(`anversol-respaldo-${data.today}.json`, new Blob([JSON.stringify(value)], { type: 'application/json' }));
      toast('Copia de seguridad descargada.');
    } catch (error) { toast(error.message, 'error'); }
    setBusy(false);
  }

  return <>
    <div className="grid-2">
      <section className="card">
        <div className="card-head"><div><h3 className="card-title">Datos del gimnasio</h3><p className="muted">La información que identifica tu espacio.</p></div><Button className="btn-secondary btn-sm" icon="edit" onClick={() => openModal(<SettingsModal />)}>Editar</Button></div>
        <div className="detail-grid">
          <div><span className="muted">Nombre</span><strong>{s.gym_name || 'Anversol Gym'}</strong></div>
          <div><span className="muted">Teléfono</span><strong>{s.phone || 'Sin completar'}</strong></div>
          <div className="full"><span className="muted">Dirección</span><strong>{s.address || 'Sin completar'}</strong></div>
          <div className="full"><span className="muted">Horarios</span><strong>{s.hours || 'Se calculan desde los planes'}</strong></div>
          <div><span className="muted">WhatsApp</span><strong>{s.whatsapp || 'Sin completar'}</strong></div>
          <div><span className="muted">Instagram</span><strong>{s.instagram || 'Sin completar'}</strong></div>
        </div>
        <p className="muted">Se muestran en el <a href="/" target="_blank" rel="noopener">sitio web</a>. Socios: <a href="/socios" target="_blank" rel="noopener">portal de socios</a>.</p>
      </section>
      <section className="card">
        <div className="card-head"><h3 className="card-title">Control de acceso</h3><Button className="btn-secondary btn-sm" icon="settings" onClick={() => openModal(<SettingsModal access />)}>Configurar</Button></div>
        <div className="settings-row"><span>Permitir ingreso con cuota vencida</span><Badge tone={s.allow_expired_entry ? 'amber' : 'neutral'}>{s.allow_expired_entry ? 'Activado' : 'Desactivado'}</Badge></div>
        <div className="settings-row"><span>Recepción puede autorizar vencidos</span><Badge tone={s.allow_expired_override ? 'green' : 'neutral'}>{s.allow_expired_override ? 'Activado' : 'Desactivado'}</Badge></div>
        <div className="settings-row"><span>Exigir apto físico vigente</span><Badge tone={s.require_medical ? 'green' : 'neutral'}>{s.require_medical ? 'Activado' : 'Desactivado'}</Badge></div>
      </section>
    </div>
    <section className="card">
      <div className="card-head"><div><h3 className="card-title">Usuarios y permisos</h3><p className="muted">Cada persona accede con su propia cuenta.</p></div><Button className="btn-primary btn-sm" icon="plus" onClick={() => openModal(<UserModal />)}>Crear usuario</Button></div>
      <Table headers={['Usuario', 'Acceso', 'Rol', 'Estado', '']} rows={data.users.map(u => <tr key={u.id}>
        <td><div className="member-inline"><Avatar person={u} /><strong>{u.name}</strong></div></td><td>{u.username}</td><td>{roleLabels[u.role] || u.role}</td>
        <td><Badge tone={u.active === false ? 'neutral' : 'green'}>{u.active === false ? 'Inactivo' : 'Activo'}</Badge></td>
        <td>{user.role === 'dueno' || u.role !== 'dueno' ? <Button className="btn-secondary btn-sm" onClick={() => openModal(<UserModal account={u} />)}>Editar</Button> : <Badge>Solo el dueño</Badge>}</td>
      </tr>)} />
      <div className="role-description"><p className="muted"><strong>Dueño / administrador:</strong> gestión completa. <strong>Recepción:</strong> socios, ingresos, cobros, ventas y reservas. <strong>Profesor:</strong> socios, asistencia y entrenamiento. <strong>Contador:</strong> caja y reportes.</p></div>
    </section>
    <section className="card">
      <div className="card-head"><div><h3 className="card-title">Copias de seguridad</h3><p className="muted">Los datos se guardan en Supabase. Descargá una copia completa (incluye fotos y certificados) para guardarla aparte.</p></div><Button className="btn-primary btn-sm" icon="download" disabled={busy} onClick={backup}>Descargar copia</Button></div>
      <div className="notice">La copia incluye datos personales de los socios: guardala en un lugar privado, por ejemplo un disco externo.</div>
    </section>
    <section className="card">
      <div className="card-head"><h3 className="card-title">Acceso desde cualquier dispositivo</h3><Badge tone="green">En la nube</Badge></div>
      <p>Desde cualquier PC, celular o tablet con Internet, abrí <strong>{origin}/admin</strong>. Los socios entran en <strong>{origin}/socios</strong>.</p>
    </section>
    <section className="card">
      <div className="card-head"><h3 className="card-title">Lector de huellas</h3><Badge tone="amber">Sin configurar</Badge></div>
      <p className="muted">Todavía no hay un lector conectado. El ingreso por DNI y QR está disponible. La integración de huellas requiere elegir el lector y conectar su SDK; no se guardan ni simulan huellas.</p>
    </section>
  </>;
}
