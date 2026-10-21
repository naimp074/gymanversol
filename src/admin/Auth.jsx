import { useEffect, useState } from 'react';
import { Field, Icon, Logo } from './ui.jsx';
import { supabase, rpc, staffEmail, friendlyError } from '../lib/supabase.js';

// Pantalla de inicio de sesión y configuración inicial (primer dueño).
export default function Auth({ setup, message, onDone }) {
  const [error, setError] = useState(message || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Bienvenido · Anversol'; document.body.classList.remove('kiosk-mode', 'nav-open'); }, []);

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    setError('');
    setBusy(true);
    try {
      if (setup) {
        if (!/^[a-z0-9_.-]{3,60}$/.test(username)) throw new Error('El usuario requiere 3 a 60 letras, números, puntos o guiones');
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const { data, error: signError } = await supabase.auth.signUp({ email: staffEmail(username), password, options: { data: { name: String(fd.get('name') || '').trim(), username } } });
        if (signError) throw new Error(friendlyError(signError));
        if (!data.session) throw new Error('Supabase pide confirmar el email. Desactivá «Confirm email» en Authentication → Sign In / Providers → Email, borrá el usuario creado en Authentication → Users y volvé a intentar.');
        await rpc('setup_finish', { p_demo: fd.get('demo') === 'on' });
      } else {
        const { error: signError } = await supabase.auth.signInWithPassword({ email: staffEmail(username), password });
        if (signError) throw new Error(/invalid login credentials/i.test(signError.message) ? 'Usuario o contraseña incorrectos' : /not confirmed/i.test(signError.message) ? 'La cuenta no está confirmada. Revisá la configuración de email en Supabase.' : friendlyError(signError));
        await rpc('log_action', { p_action: 'Inicio de sesión' }).catch(async err => {
          if (err.code === '28000') { await supabase.auth.signOut(); throw new Error('Tu usuario no está habilitado. Consultá con el dueño del gimnasio.'); }
        });
      }
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return <div className="auth-layout">
    <section className="auth-story">
      <a className="brand" href="/"><Logo /></a>
      <div className="auth-story-content">
        <span className="eyebrow">MÁS QUE UN GIMNASIO. UNA COMUNIDAD.</span>
        <h1>Cada día,<br />un poco<br /><em>más fuertes.</em></h1>
        <p>Vos acompañás sus objetivos.<br />Anversol se ocupa del resto.</p>
        <div className="auth-art"><div className="art-orbit"></div><div className="art-orbit orbit-two"></div><div className="art-tile"><Icon name="dumbbell" size={75} /></div><span className="art-pill"><Icon name="heart" size={18} /> El progreso se comparte.</span></div>
      </div>
      <div className="auth-story-footer">ANVERSOL GYM <span>Tu gimnasio, conectado.</span></div>
    </section>
    <section className="auth-form-area">
      <a className="auth-back" href="/">← Volver al sitio</a>
      <span className="auth-local"><Icon name="shield" size={16} /> Gestión segura en la nube</span>
      <div className="auth-form-box">
        <div className="auth-mobile-brand"><Logo /></div>
        <span className="soft-icon peach"><Icon name={setup ? 'sparkles' : 'sun'} size={27} /></span>
        <h2>{setup ? 'Hagamos lugar para crecer.' : 'Qué bueno verte de nuevo.'}</h2>
        <p>{setup ? 'Configurá tu cuenta de dueño para comenzar.' : 'Ingresá a tu espacio de trabajo.'}</p>
        <form onSubmit={submit}>
          {setup && <Field label="Tu nombre" name="name" required autoComplete="name" />}
          <Field label="Usuario" name="username" required autoComplete="username" maxLength={250} />
          <Field label="Contraseña" name="password" type="password" required minLength={8} autoComplete={setup ? 'new-password' : 'current-password'} />
          {setup && <label className="checkbox-field"><input type="checkbox" name="demo" /><span>Cargar datos de demostración<small>Socios y movimientos ficticios para recorrer el sistema. Dejalo desactivado para cargar socios reales.</small></span></label>}
          <div className="form-error" role="alert" hidden={!error}>{error}</div>
          <button className="btn btn-primary full" type="submit" disabled={busy}>{setup ? 'Crear mi gimnasio' : 'Iniciar sesión'}<Icon name="arrow" size={18} /></button>
        </form>
        <div className="auth-note"><Icon name="wifi" size={18} /><span>Disponible desde cualquier dispositivo<br />con conexión a Internet.</span></div>
      </div>
      <span className="auth-copyright">Diseñado para moverte hacia adelante.</span>
    </section>
  </div>;
}
