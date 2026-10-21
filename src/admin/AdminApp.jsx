import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, pages, permissions, canSee } from './context.js';
import { Icon } from './ui.jsx';
import Auth from './Auth.jsx';
import Shell from './Shell.jsx';
import { configured, notConfiguredMessage, supabase, rpc } from '../lib/supabase.js';
import { subscribeChanges } from '../lib/realtime.js';

const initialUi = () => ({
  chartDays: 7, dashboardAlert: 'due', memberSearch: '', memberFilter: 'todos', memberPage: 0, accessFilter: 'todos', accessResult: null,
  communicationType: 'recordatorio', financeMonths: 6, cart: {}, productSearch: '', saleSearch: '', saleMethod: 'Efectivo', cashPeriod: 'today',
  classDate: '', progressMember: '', reportRange: null, reportType: 'movements', auditSearch: ''
});

export default function AdminApp() {
  const [phase, setPhase] = useState(configured ? 'loading' : 'error');
  const [error, setError] = useState(configured ? '' : notConfiguredMessage);
  const [authMessage, setAuthMessage] = useState('');
  const [data, setData] = useState(null);
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'inicio');
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [kiosk, setKiosk] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const ui = useRef(initialUi()).current;
  const modalCount = useRef(0);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list, { id, message, type }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 5000);
  }, []);

  const toAuth = useCallback(async (message = '') => {
    setModal(null);
    setData(null);
    const needsSetup = await rpc('needs_setup').catch(() => false);
    setAuthMessage(message);
    setPhase(needsSetup ? 'setup' : 'auth');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const value = await rpc('app_bootstrap');
      setData(value);
      return value;
    } catch (err) {
      if (err.code === '28000') {
        await supabase.auth.signOut();
        await toAuth('Tu sesión terminó o tu usuario fue desactivado. Iniciá sesión nuevamente.');
      }
      throw err;
    }
  }, [toAuth]);

  const init = useCallback(async () => {
    if (!configured) return;
    setPhase('loading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { await toAuth(); return; }
      await refresh();
      setRoute(location.hash.slice(1) || 'inicio');
      setPhase('app');
    } catch (err) {
      if (err.code === '28000') return;
      setError(err.message);
      setPhase('error');
    }
  }, [refresh, toAuth]);

  useEffect(() => { init(); }, [init]);

  const navigate = useCallback(next => {
    history.replaceState(null, '', `#${next}`);
    setRoute(next);
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, []);

  const logout = useCallback(async () => {
    await rpc('log_action', { p_action: 'Cierre de sesión' }).catch(() => {});
    await supabase.auth.signOut();
    Object.assign(ui, initialUi());
    await toAuth();
  }, [toAuth, ui]);

  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || 'inicio');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // Tiempo real: cualquier cambio en Supabase (otra PC, el panel de Supabase) refresca los datos.
  // Los formularios abiertos no se pierden: sus campos no dependen de los datos refrescados.
  useEffect(() => {
    if (phase !== 'app') return;
    const update = async () => {
      try { await refresh(); document.body.classList.remove('offline'); }
      catch { document.body.classList.add('offline'); }
    };
    const unsubscribe = subscribeChanges(update);
    // Respaldo por si se corta la conexión en tiempo real.
    const timer = setInterval(() => { if (!document.hidden) update(); }, 120000);
    const onVisible = () => { if (!document.hidden) update(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsubscribe(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [phase, refresh]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'F2' && data && permissions(data.user).checkin && !modal) { e.preventDefault(); navigate('accesos'); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [data, modal, navigate]);

  useEffect(() => { document.body.classList.toggle('kiosk-mode', kiosk && phase === 'app'); }, [kiosk, phase]);
  useEffect(() => { document.body.classList.toggle('nav-open', navOpen); }, [navOpen]);

  const user = data?.user;
  const safeRoute = user && pages[route] && canSee(user, route) ? route : 'inicio';
  useEffect(() => { if (phase === 'app') document.title = `${pages[safeRoute].title} · Anversol`; }, [phase, safeRoute]);

  const context = useMemo(() => ({
    data, user, route: safeRoute, ui, navigate, refresh, toast, logout,
    openModal: element => setModal(<Fragment key={++modalCount.current}>{element}</Fragment>),
    closeModal: () => setModal(null)
  }), [data, user, safeRoute, ui, navigate, refresh, toast, logout]);

  let content;
  if (phase === 'loading') content = <div className="initial-loading"><span className="loading-mark">A</span><p>Preparando tu gimnasio…</p></div>;
  else if (phase === 'error') content = <div className="initial-loading"><span className="soft-icon peach"><Icon name="wifi" size={32} /></span><h2>No pudimos conectar con el gimnasio</h2><p>{error}</p>{configured && <button type="button" className="btn btn-primary" onClick={init}>Volver a intentar</button>}</div>;
  else if (phase === 'auth' || phase === 'setup') content = <Auth key={phase} setup={phase === 'setup'} message={authMessage} onDone={async () => { await refresh(); navigate('inicio'); setPhase('app'); }} />;
  else if (data) content = <Shell kiosk={kiosk} setKiosk={setKiosk} setNavOpen={setNavOpen} />;

  return <AppContext.Provider value={context}>
    {content}
    <div id="modal-root">{modal}</div>
    <div id="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.type}`}><Icon name={t.type === 'error' ? 'alert' : 'check'} /><span>{t.message}</span></div>)}</div>
  </AppContext.Provider>;
}
