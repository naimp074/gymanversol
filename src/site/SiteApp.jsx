import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/supabase.js';
import { subscribeChanges } from '../lib/realtime.js';
import { money, zone, initials } from '../lib/format.js';

const nowTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const dayLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const durationLabel = days => days % 30 === 0 ? `${days / 30} ${days === 30 ? 'mes' : 'meses'}` : days % 7 === 0 ? `${days / 7} ${days === 7 ? 'semana' : 'semanas'}` : `${days} días`;
const digits = value => String(value || '').replace(/\D/g, '');
const whatsappLink = (number, text) => digits(number) ? `https://wa.me/${digits(number)}?text=${encodeURIComponent(text)}` : '';

const Glyph = ({ d, size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
const DUMBBELL = '<path d="m6.5 6.5 11 11M4 3 3 4l4 4 1-1M16 16l-1 1 5 5 2-2-5-5-1 1ZM3 8l5-5 4 4-5 5-4-4Z"/>';

const features = [
  [DUMBBELL, 'Sala de musculación', 'Equipamiento para fuerza, hipertrofia y acondicionamiento. Entrená a tu ritmo, en el horario de tu plan.'],
  ['<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>', 'Clases grupales', 'Sesiones con cupo y profesor a cargo. Energía de grupo para no aflojar.'],
  ['<path d="m16 3 5 5L9 20l-6 1 1-6L16 3Zm-3 3 5 5"/>', 'Rutinas a medida', 'Tu profesor arma tu plan de entrenamiento y lo podés consultar desde el celular cuando quieras.'],
  ['<path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-7"/>', 'Seguimiento real', 'Mirá cuántos días por semana venís, tus rachas, tus medidas y tu evolución con gráficos.'],
  ['<path d="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h3v3h4v4h-7v-7Z"/>', 'Ingreso ágil', 'Entrás con tu DNI o con tu credencial QR. Sin filas, sin vueltas.'],
  ['<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>', 'Acompañamiento', 'Profesores presentes en sala para corregir técnica y ajustar tu entrenamiento.']
];

function Brand({ name }) {
  return <a className="site-brand" href="/" aria-label="Inicio">
    <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true"><rect width="64" height="64" rx="18" fill="#ef6b50" /><path d="M14 47 28 17h9l14 30H40l-7-17-8 17z" fill="#fff" /><path d="m29 41 5-9 8 15H26z" fill="#ffd7c8" /></svg>
    <span><b>{name}</b><small>GYM</small></span>
  </a>;
}

function Counter({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(value)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = value.toLocaleString('es-AR'); return; }
    let frame;
    const start = performance.now();
    const step = t => {
      const progress = Math.min(1, (t - start) / 1200);
      el.textContent = Math.round(value * (1 - Math.pow(1 - progress, 3))).toLocaleString('es-AR');
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <strong ref={ref}>—</strong>;
}

function useReveal(deps) {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { items.forEach(el => el.classList.add('visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, deps);
}

function OpenChip({ info }) {
  if (!info) return <span className="open-chip"><i></i><span>Consultando horario…</span></span>;
  if (!info.opening) return <span className="open-chip"><i></i><span>{info.hours || 'Consultá nuestros horarios'}</span></span>;
  const now = nowTime();
  const open = now >= info.opening.start && now < info.opening.end;
  return <span className={`open-chip ${open ? '' : 'closed'}`}><i></i><span>{open ? `Abierto ahora · hasta las ${info.opening.end}` : `Cerrado ahora · abrimos a las ${info.opening.start}`}</span></span>;
}

export function Plans({ info, failed }) {
  if (failed) return <div className="plans"><p className="empty-note">No pudimos cargar los planes. Consultá en recepción.</p></div>;
  if (!info) return <div className="plans"><div className="skeleton"></div><div className="skeleton"></div><div className="skeleton"></div></div>;
  if (!info.plans.length) return <div className="plans"><p className="empty-note">Estamos actualizando los planes. Consultá en recepción.</p></div>;
  const featured = info.plans.length >= 3 ? 1 : -1;
  return <div className="plans">{info.plans.map((p, index) => {
    const link = whatsappLink(info.whatsapp, `Hola! Quiero info del plan ${p.name} de ${info.gym_name}.`);
    const discount = Number(p.discount);
    return <article key={p.id} className={`plan reveal ${index === featured ? 'featured' : ''}`}>
      {index === featured && <span className="plan-tag">Más elegido</span>}
      <h3>{p.name}</h3>
      <p className="plan-desc">{p.description || 'Entrená a tu ritmo y cumplí tus metas.'}</p>
      <div className="plan-price">{discount > 0 && <s>{money(p.full_price)}</s>}<strong>{money(p.price)}</strong><span>/ {durationLabel(p.duration)}</span></div>
      <ul>
        <li>{p.access_limit ? `${p.access_limit} ingresos en el período` : 'Ingresos ilimitados'}</li>
        <li>De {p.start_time} a {p.end_time} hs</li>
        <li>Rutina y seguimiento en el portal</li>
        {discount > 0 && <li>{discount}% de descuento incluido</li>}
      </ul>
      {link ? <a className="btn-plan" href={link} target="_blank" rel="noopener">Lo quiero</a> : <span className="btn-plan muted">Consultá en recepción</span>}
    </article>;
  })}</div>;
}

export function Classes({ info }) {
  if (!info) return <div className="classes"></div>;
  if (!info.classes.length) return <div className="classes"><p className="empty-note">Todavía no hay clases programadas para los próximos días. Consultá la grilla en recepción.</p></div>;
  const groups = new Map();
  for (const c of info.classes) { if (!groups.has(c.date)) groups.set(c.date, []); groups.get(c.date).push(c); }
  return <div className="classes">{[...groups].map(([day, list]) => <div key={day} className="class-day reveal">
    <h3>{day === info.today ? 'Hoy' : dayLabel(day)}</h3>
    {list.map(c => {
      const ratio = c.capacity ? c.spots / c.capacity : 0;
      return <article key={c.id} className="class-card">
        <time>{c.time}</time>
        <div><strong>{c.name}</strong><small>{[c.teacher, `${c.duration} min`].filter(Boolean).join(' · ')}</small></div>
        <span className={`spots ${c.spots === 0 ? 'full' : ratio <= 0.25 ? 'few' : ''}`}>{c.spots === 0 ? 'Completa' : `${c.spots} ${c.spots === 1 ? 'lugar' : 'lugares'}`}</span>
      </article>;
    })}
  </div>)}</div>;
}

export function Team({ info }) {
  if (!info) return <div className="team"></div>;
  if (!info.teachers.length) return <div className="team"><p className="empty-note">Pronto vas a conocer a nuestro equipo.</p></div>;
  return <div className="team">{info.teachers.map((t, index) => <article key={t.id} className="coach reveal">
    <span className={`coach-avatar tone-${index % 4}`}>{initials(t.name)}</span>
    <h3>{t.name}</h3>
    <p className="coach-role">{t.specialty || 'Entrenamiento general'}</p>
    {t.schedule && <p className="coach-schedule">{t.schedule}</p>}
  </article>)}</div>;
}

export function Contact({ info }) {
  if (!info) return <div className="contact"></div>;
  const wa = whatsappLink(info.whatsapp, `Hola! Quiero información sobre ${info.gym_name}.`);
  const insta = info.instagram ? info.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') : '';
  const hours = info.hours || (info.opening ? `Todos los días de ${info.opening.start} a ${info.opening.end} hs` : 'Consultá en recepción');
  const items = [
    ['Dirección', info.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`} target="_blank" rel="noopener">{info.address}</a> : 'Consultá por WhatsApp'],
    ['Horarios', hours],
    info.phone && ['Teléfono', <a href={`tel:${digits(info.phone)}`}>{info.phone}</a>],
    wa && ['WhatsApp', <a href={wa} target="_blank" rel="noopener">Escribinos</a>],
    insta && ['Instagram', <a href={`https://instagram.com/${insta}`} target="_blank" rel="noopener">@{insta}</a>],
    info.email && ['Email', <a href={`mailto:${info.email}`}>{info.email}</a>]
  ].filter(Boolean);
  return <div className="contact">{items.map(([label, value]) => <div key={label} className="contact-item reveal"><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export default function SiteApp() {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { rpc('public_info').then(setInfo).catch(() => setFailed(true)); }, []);
  // Tiempo real: planes, clases, cupos y datos del gimnasio se actualizan sin recargar.
  useEffect(() => subscribeChanges(() => {
    rpc('public_info').then(value => { setInfo(value); setFailed(false); }).catch(() => {});
  }, { tables: ['plans', 'classes', 'reservations', 'teachers', 'settings'], delay: 1000 }), []);
  useEffect(() => { document.body.classList.toggle('menu-open', menuOpen); }, [menuOpen]);
  useEffect(() => {
    const onScroll = () => document.body.classList.toggle('scrolled', scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { document.title = `${info?.gym_name || 'Anversol'} Gym · Cada día, un poco más fuertes`; }, [info]);
  useReveal([info, failed]);

  const name = info?.gym_name || 'Anversol';
  const stats = info?.stats;
  const statItems = [['active_members', 'socios entrenando'], ['visits_month', 'entrenamientos este mes'], ['teachers', 'profesores']];
  const visibleStats = stats ? statItems.filter(([key]) => stats[key] > 0) : statItems;
  const next = info?.classes[0];
  const wa = info ? whatsappLink(info.whatsapp, `Hola! Quiero información sobre ${info.gym_name}.`) : '';
  const closeMenu = () => setMenuOpen(false);

  return <>
    <header className="site-nav" id="top">
      <Brand name={name} />
      <nav className="site-links" aria-label="Secciones">
        {[['nosotros', 'Nosotros'], ['planes', 'Planes'], ['clases', 'Clases'], ['equipo', 'Equipo'], ['contacto', 'Contacto']].map(([id, label]) => <a key={id} href={`#${id}`} onClick={closeMenu}>{label}</a>)}
      </nav>
      <div className="site-nav-actions">
        <a className="pill pill-ghost" href="/admin">Administración</a>
        <a className="pill pill-coral" href="/socios">Soy socio</a>
        <button className="site-menu" type="button" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><span></span><span></span></button>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true"></div>
        <div className="hero-grid" aria-hidden="true"></div>
        <div className="hero-inner">
          <div className="hero-copy">
            <OpenChip info={info} />
            <h1 className="hero-title"><span>Cada día,</span> <span>un poco</span> <em>más fuertes.</em></h1>
            <p className="hero-sub">{info?.tagline || 'Musculación, clases grupales y profesores que siguen tu progreso. Vení a entrenar a tu ritmo, en una comunidad que empuja.'}</p>
            <div className="hero-cta">
              <a className="btn-xl btn-coral" href="#planes">Ver planes <span aria-hidden="true">→</span></a>
              <a className="btn-xl btn-line" href="/socios">Seguí tu progreso</a>
            </div>
            {!failed && visibleStats.length > 0 && <ul className="hero-stats">
              {visibleStats.map(([key, label]) => <li key={key}>{stats ? <Counter value={stats[key]} /> : <strong>—</strong>}<span>{label}</span></li>)}
            </ul>}
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-ring"><div className="hero-ring-core"><svg viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: DUMBBELL }} /></div></div>
            <div className="float-card fc-1"><span className="fc-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg></span><div><b>Racha de 6 semanas</b><small>Seguí sumando días</small></div></div>
            <div className="float-card fc-2">
              <small>Días por semana</small>
              <div className="mini-bars">{[40, 60, 50, 80, 70, 100].map((h, i) => <i key={i} style={{ '--h': `${h}%` }}></i>)}</div>
            </div>
            <div className="float-card fc-3"><span className="fc-dot"></span><div>
              <b>{next ? `${next.name} · ${next.date === info.today ? 'hoy' : dayLabel(next.date).split(',')[0]} ${next.time}` : 'Clases todas las semanas'}</b>
              <small>{next ? (next.spots ? `Quedan ${next.spots} lugares` : 'Clase completa') : 'Reservá tu lugar en recepción'}</small>
            </div></div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].flatMap(n => ['Musculación', 'Funcional', 'Clases grupales', 'Rutinas a medida', 'Seguimiento', 'Comunidad'].map(text => <span key={`${n}-${text}`}>{text}</span>))}
        </div>
      </div>

      <section className="section" id="nosotros">
        <div className="section-head reveal">
          <span className="kicker">01 · Nosotros</span>
          <h2>Más que un gimnasio. <em>Una comunidad.</em></h2>
          <p className="lead">{info?.about || 'Somos un espacio pensado para que entrenes con constancia, con profesores que conocen tu objetivo y con herramientas para ver cómo avanzás semana a semana.'}</p>
        </div>
        <div className="features">
          {features.map(([d, title, text]) => <article key={title} className="feature reveal"><span className="feature-icon"><Glyph d={d} /></span><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>

      <section className="section section-dark" id="planes">
        <div className="section-head reveal">
          <span className="kicker">02 · Planes</span>
          <h2>Elegí cómo querés <em>entrenar.</em></h2>
          <p className="lead">Precios claros. Renovás en recepción y los días que te quedan se conservan.</p>
        </div>
        <Plans info={info} failed={failed} />
      </section>

      <section className="section" id="clases">
        <div className="section-head reveal">
          <span className="kicker">03 · Clases</span>
          <h2>Próximas <em>clases.</em></h2>
          <p className="lead">Las próximas dos semanas de actividades. Reservá tu lugar en recepción.</p>
        </div>
        <Classes info={info} />
      </section>

      <section className="section section-sand" id="equipo">
        <div className="section-head reveal">
          <span className="kicker">04 · Equipo</span>
          <h2>Quienes te <em>acompañan.</em></h2>
        </div>
        <Team info={info} />
      </section>

      <section className="section portal-promo" id="socios">
        <div className="portal-inner reveal">
          <div>
            <span className="kicker">05 · Portal de socios</span>
            <h2>Tu progreso, <em>en tu celular.</em></h2>
            <p className="lead">Entrás con tu DNI y ves cuántos días por semana venís, tus rachas, tu cuota, tu rutina y tus medidas.</p>
            <ul className="check-list">
              <li>Gráfico de días por semana</li>
              <li>Calendario de asistencia</li>
              <li>Estado de tu cuota y vencimiento</li>
              <li>Rutina y clases reservadas</li>
            </ul>
            <a className="btn-xl btn-coral" href="/socios">Entrar con mi DNI <span aria-hidden="true">→</span></a>
          </div>
          <div className="phone" aria-hidden="true">
            <div className="phone-screen">
              <small>Esta semana</small>
              <strong>4 días</strong>
              <div className="phone-bars">{[30, 55, 45, 75, 60, 90, 70, 100].map((h, i) => <i key={i} style={{ '--h': `${h}%` }} className={i === 7 ? 'hot' : undefined}></i>)}</div>
              <div className="phone-row"><span>Cuota</span><b className="ok">Activa</b></div>
              <div className="phone-row"><span>Racha</span><b>6 semanas</b></div>
              <div className="phone-heat">{['', 'l2', '', 'l3', 'l1', '', 'l2', 'l3', '', 'l1', 'l3', 'l2', '', 'l3'].map((c, i) => <i key={i} className={c || undefined}></i>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-dark" id="contacto">
        <div className="section-head reveal">
          <span className="kicker">06 · Contacto</span>
          <h2>Vení a <em>conocernos.</em></h2>
        </div>
        <Contact info={info} />
      </section>

      <section className="final-cta reveal">
        <h2>El mejor momento para empezar <em>es hoy.</em></h2>
        <div className="hero-cta">
          <a className="btn-xl btn-coral" href={wa || '#contacto'} {...(wa ? { target: '_blank', rel: 'noopener' } : {})}>Quiero empezar</a>
          <a className="btn-xl btn-line-dark" href="/socios">Ya soy socio</a>
        </div>
      </section>
    </main>

    <footer className="site-footer">
      <div><b>{name}</b> GYM · <span>{info?.address || 'Cada día, un poco más fuertes.'}</span></div>
      <div className="footer-links"><a href="/socios">Portal de socios</a><a href="/admin">Administración</a><a href="#top">Volver arriba ↑</a></div>
    </footer>
  </>;
}
