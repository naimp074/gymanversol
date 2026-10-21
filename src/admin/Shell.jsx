import { useApp, pages, navGroups, roleLabels, permissions, financeRoles } from './context.js';
import { Avatar, Field, Icon, Logo, Modal } from './ui.jsx';
import { useActions } from './actions.jsx';
import { dueSoon, isBirthday } from './pages/shared.jsx';
import { supabase, rpc, staffEmail } from '../lib/supabase.js';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import Access from './pages/Access.jsx';
import Expiry from './pages/Expiry.jsx';
import Attendance from './pages/Attendance.jsx';
import Communications from './pages/Communications.jsx';
import Plans from './pages/Plans.jsx';
import Cash from './pages/Cash.jsx';
import Products from './pages/Products.jsx';
import Sales from './pages/Sales.jsx';
import Teachers from './pages/Teachers.jsx';
import Classes from './pages/Classes.jsx';
import Routines from './pages/Routines.jsx';
import Progress from './pages/Progress.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import Audit from './pages/Audit.jsx';
import Finance from './pages/Finance.jsx';

const views = { inicio: Dashboard, socios: Members, accesos: Access, vencimientos: Expiry, asistencia: Attendance, comunicaciones: Communications, planes: Plans, caja: Cash, productos: Products, ventas: Sales, profesores: Teachers, clases: Classes, rutinas: Routines, progreso: Progress, reportes: Reports, configuracion: Settings, auditoria: Audit, finanzas: Finance };

function ChangePassword() {
  const { user, toast } = useApp();
  async function save(fd) {
    const current = fd.get('current'), next = fd.get('next');
    if (next.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    if (next !== fd.get('confirm')) throw new Error('Las contraseñas nuevas no coinciden.');
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email || staffEmail(user.username), password: current });
    if (checkError) throw new Error('La contraseña actual es incorrecta');
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw new Error(error.message);
    await rpc('log_action', { p_action: 'Cambiar contraseña' }).catch(() => {});
    toast('Contraseña actualizada.');
  }
  return <Modal title="Cambiar contraseña" onSubmit={save} submitLabel="Actualizar">
    <Field label="Contraseña actual" name="current" type="password" required minLength={8} autoComplete="current-password" />
    <Field label="Nueva contraseña" name="next" type="password" required minLength={8} autoComplete="new-password" />
    <Field label="Repetir nueva contraseña" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
  </Modal>;
}

function Profile() {
  const { user, openModal, logout } = useApp();
  return <Modal title="Tu sesión">
    <div className="member-inline"><Avatar person={user} /><div><h3>{user.name}</h3><p className="muted">{roleLabels[user.role]} · {user.username}</p></div></div>
    <p className="muted">Tu usuario queda registrado en las operaciones que realizás.</p>
    <div className="stack">
      {permissions(user.role).desk && <p className="muted small">Atajo: F2 abre el control de acceso.</p>}
      <button type="button" className="btn btn-secondary" onClick={() => openModal(<ChangePassword />)}><Icon name="lock" size={18} />Cambiar contraseña</button>
      <button type="button" className="btn btn-secondary" onClick={logout}><Icon name="logout" size={18} />Cerrar sesión</button>
    </div>
  </Modal>;
}

export default function Shell({ kiosk, setKiosk, setNavOpen }) {
  const app = useApp();
  const { data, user, route, navigate, openModal } = app;
  const actions = useActions();
  const can = permissions(user.role);
  const page = pages[route];
  const View = views[route];
  const due = dueSoon(data);
  const alerts = due.length + data.members.filter(m => isBirthday(m, data.today)).length;
  const fullDate = new Date(`${data.today}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const go = r => e => { e.preventDefault(); navigate(r); };

  return <>
    <a className="skip-link" href="#main">Saltar al contenido</a>
    <div className="nav-overlay" onClick={() => setNavOpen(false)}></div>
    <aside className="sidebar">
      <a href="#inicio" className="brand" onClick={go('inicio')} aria-label="Anversol inicio"><Logo /></a>
      <div className="gym-selector"><span className="gym-tile"><Icon name="dumbbell" size={19} /></span><span><strong>{data.settings.gym_name || 'Anversol Gym'}</strong><small>Sede principal</small></span><Icon name="down" size={15} /></div>
      <nav aria-label="Navegación principal">{navGroups.map(([title, routes]) => {
        const available = routes.filter(r => pages[r].roles.includes(user.role));
        if (!available.length) return null;
        return <div key={title} className="nav-group"><div className="nav-label">{title}</div>{available.map(r => <a key={r} className={`nav-item ${route === r ? 'active' : ''}`} href={`#${r}`} onClick={go(r)} aria-current={route === r ? 'page' : undefined}>
          <Icon name={pages[r].icon} size={19} /><span>{pages[r].nav || pages[r].title}</span>{r === 'vencimientos' && due.length > 0 && <b className="nav-count">{due.length}</b>}
        </a>)}</div>;
      })}</nav>
      <div className="sidebar-bottom">
        {pages.configuracion.roles.includes(user.role) && <a href="#configuracion" onClick={go('configuracion')} className={`nav-item ${route === 'configuracion' ? 'active' : ''}`}><Icon name="settings" size={18} />Configuración</a>}
        {pages.auditoria.roles.includes(user.role) && <a href="#auditoria" onClick={go('auditoria')} className={`nav-item ${route === 'auditoria' ? 'active' : ''}`}><Icon name="shield" size={18} />Actividad del sistema</a>}
        <div className="local-status"><i className="status-dot"></i><span>Conectado a la nube<small>Datos sincronizados con Supabase</small></span></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button type="button" className="icon-btn mobile-menu" onClick={() => setNavOpen(open => !open)} aria-label="Abrir menú"><Icon name="menu" /></button>
        <div className="breadcrumb">Tu gimnasio <span>/</span> <strong>{page.title}</strong></div>
        <div className="topbar-right">
          {data.settings.demo && <span className="demo-label">Datos de demostración</span>}
          <button type="button" className={`icon-btn notification-btn ${alerts ? 'has-alerts' : ''}`} onClick={() => navigate(financeRoles.includes(user.role) ? 'vencimientos' : 'asistencia')} aria-label="Ver alertas"><Icon name="bell" /><i></i></button>
          <div className="topbar-divider"></div>
          <button type="button" className="profile-button" onClick={() => openModal(<Profile />)}><Avatar person={user} /><span><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span><Icon name="down" size={14} /></button>
        </div>
      </header>
      <main id="main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">{route === 'inicio' ? <><Icon name="sun" size={14} /> UN NUEVO DÍA PARA CRECER</> : 'ANVERSOL · SEDE PRINCIPAL'}</div>
            <h1>{route === 'inicio' ? 'Tu gimnasio, en movimiento.' : page.title}</h1>
            <p>{page.sub}</p>
          </div>
          <div className="page-actions">
            {route === 'inicio' && <span className="date-display"><Icon name="calendar" size={16} />{fullDate}</span>}
            {route === 'socios' && can.desk && <button type="button" className="btn btn-primary" onClick={() => actions.memberForm()}><Icon name="plus" size={18} />Nuevo socio</button>}
            {route === 'accesos' && <button type="button" className="btn btn-secondary" onClick={() => setKiosk(!kiosk)}><Icon name="fingerprint" size={18} />{kiosk ? 'Volver al panel' : 'Pantalla de recepción'}</button>}
          </div>
        </div>
        <div id="page-content"><View key={route} /></div>
        <footer className="page-footer"><span>ANVERSOL <b>GYM</b></span><span>Más tiempo para tu comunidad.</span><span><Icon name="lock" size={12} /> Tus datos, protegidos</span></footer>
      </main>
    </div>
  </>;
}
