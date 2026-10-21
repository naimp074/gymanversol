const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
const zone = 'America/Argentina/Buenos_Aires';
const nowTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const dayLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const durationLabel = days => days % 30 === 0 ? `${days / 30} ${days === 30 ? 'mes' : 'meses'}` : days % 7 === 0 ? `${days / 7} ${days === 7 ? 'semana' : 'semanas'}` : `${days} días`;
const digits = value => String(value || '').replace(/\D/g, '');
const whatsappLink = (number, text) => digits(number) ? `https://wa.me/${digits(number)}?text=${encodeURIComponent(text)}` : '';
const set = (selector, html) => document.querySelectorAll(selector).forEach(el => { el.innerHTML = html; });
const setText = (selector, text) => document.querySelectorAll(selector).forEach(el => { el.textContent = text; });

function animateCount(el, target) {
  if (!Number.isFinite(target)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target.toLocaleString('es-AR'); return; }
  const start = performance.now();
  const step = t => {
    const progress = Math.min(1, (t - start) / 1200);
    el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))).toLocaleString('es-AR');
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function openChip(info) {
  const chip = document.querySelector('[data-open-chip]');
  if (!info.opening) { chip.querySelector('span').textContent = info.hours || 'Consultá nuestros horarios'; return; }
  const time = nowTime();
  const open = time >= info.opening.start && time < info.opening.end;
  chip.classList.toggle('closed', !open);
  chip.querySelector('span').textContent = open ? `Abierto ahora · hasta las ${info.opening.end}` : `Cerrado ahora · abrimos a las ${info.opening.start}`;
}

function renderPlans(info) {
  const container = document.querySelector('[data-plans]');
  if (!info.plans.length) { container.innerHTML = '<p class="empty-note">Estamos actualizando los planes. Consultá en recepción.</p>'; return; }
  const featured = info.plans.length >= 3 ? 1 : -1;
  container.innerHTML = info.plans.map((p, index) => {
    const link = whatsappLink(info.whatsapp, `Hola! Quiero info del plan ${p.name} de ${info.gymName}.`);
    return `<article class="plan reveal ${index === featured ? 'featured' : ''}">
      ${index === featured ? '<span class="plan-tag">Más elegido</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <p class="plan-desc">${esc(p.description || 'Entrená a tu ritmo y cumplí tus metas.')}</p>
      <div class="plan-price">${p.discount ? `<s>${money(p.fullPrice)}</s>` : ''}<strong>${money(p.price)}</strong><span>/ ${durationLabel(p.duration)}</span></div>
      <ul>
        <li>${p.accessLimit ? `${p.accessLimit} ingresos en el período` : 'Ingresos ilimitados'}</li>
        <li>De ${esc(p.startTime)} a ${esc(p.endTime)} hs</li>
        <li>Rutina y seguimiento en el portal</li>
        ${p.discount ? `<li>${p.discount}% de descuento incluido</li>` : ''}
      </ul>
      ${link ? `<a class="btn-plan" href="${esc(link)}" target="_blank" rel="noopener">Lo quiero</a>` : '<span class="btn-plan muted">Consultá en recepción</span>'}
    </article>`;
  }).join('');
}

function renderClasses(info) {
  const container = document.querySelector('[data-classes]');
  if (!info.classes.length) { container.innerHTML = '<p class="empty-note">Todavía no hay clases programadas para los próximos días. Consultá la grilla en recepción.</p>'; return; }
  const groups = new Map();
  for (const c of info.classes) { if (!groups.has(c.date)) groups.set(c.date, []); groups.get(c.date).push(c); }
  container.innerHTML = [...groups].map(([day, list]) => `<div class="class-day reveal">
    <h3>${esc(day === info.today ? 'Hoy' : dayLabel(day))}</h3>
    ${list.map(c => {
      const ratio = c.capacity ? c.spots / c.capacity : 0;
      return `<article class="class-card">
        <time>${esc(c.time)}</time>
        <div><strong>${esc(c.name)}</strong><small>${esc([c.teacher, `${c.duration} min`].filter(Boolean).join(' · '))}</small></div>
        <span class="spots ${c.spots === 0 ? 'full' : ratio <= .25 ? 'few' : ''}">${c.spots === 0 ? 'Completa' : `${c.spots} ${c.spots === 1 ? 'lugar' : 'lugares'}`}</span>
      </article>`;
    }).join('')}
  </div>`).join('');
}

function renderTeam(info) {
  const container = document.querySelector('[data-team]');
  if (!info.teachers.length) { container.innerHTML = '<p class="empty-note">Pronto vas a conocer a nuestro equipo.</p>'; return; }
  container.innerHTML = info.teachers.map((t, index) => `<article class="coach reveal">
    <span class="coach-avatar tone-${index % 4}">${esc(t.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase())}</span>
    <h3>${esc(t.name)}</h3>
    <p class="coach-role">${esc(t.specialty || 'Entrenamiento general')}</p>
    ${t.schedule ? `<p class="coach-schedule">${esc(t.schedule)}</p>` : ''}
  </article>`).join('');
}

function renderContact(info) {
  const wa = whatsappLink(info.whatsapp, `Hola! Quiero información sobre ${info.gymName}.`);
  const insta = info.instagram ? info.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') : '';
  const hours = info.hours || (info.opening ? `Todos los días de ${info.opening.start} a ${info.opening.end} hs` : 'Consultá en recepción');
  const items = [
    ['Dirección', info.address ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}" target="_blank" rel="noopener">${esc(info.address)}</a>` : 'Consultá por WhatsApp'],
    ['Horarios', esc(hours)],
    info.phone && ['Teléfono', `<a href="tel:${esc(digits(info.phone))}">${esc(info.phone)}</a>`],
    wa && ['WhatsApp', `<a href="${esc(wa)}" target="_blank" rel="noopener">Escribinos</a>`],
    insta && ['Instagram', `<a href="https://instagram.com/${esc(insta)}" target="_blank" rel="noopener">@${esc(insta)}</a>`],
    info.email && ['Email', `<a href="mailto:${esc(info.email)}">${esc(info.email)}</a>`]
  ].filter(Boolean);
  document.querySelector('[data-contact]').innerHTML = items.map(([label, value]) => `<div class="contact-item reveal"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const cta = document.querySelector('[data-cta-whatsapp]');
  if (wa) { cta.href = wa; cta.target = '_blank'; cta.rel = 'noopener'; }
}

function apply(info) {
  setText('[data-gym-name]', info.gymName || 'Anversol');
  document.title = `${info.gymName || 'Anversol'} Gym · Cada día, un poco más fuertes`;
  if (info.tagline) setText('[data-tagline]', info.tagline);
  if (info.about) setText('[data-about]', info.about);
  if (info.address) setText('[data-footer-address]', info.address);
  for (const el of document.querySelectorAll('[data-count]')) {
    const value = info.stats[el.dataset.count];
    if (value > 0) animateCount(el, value); else el.closest('li').hidden = true;
  }
  if (document.querySelectorAll('[data-stats] li:not([hidden])').length === 0) document.querySelector('[data-stats]').hidden = true;
  const next = info.classes[0];
  if (next) { setText('[data-next-class]', `${next.name} · ${next.date === info.today ? 'hoy' : dayLabel(next.date).split(',')[0]} ${next.time}`); setText('[data-next-class-sub]', next.spots ? `Quedan ${next.spots} lugares` : 'Clase completa'); }
  openChip(info);
  renderPlans(info);
  renderClasses(info);
  renderTeam(info);
  renderContact(info);
  observeReveal();
}

let observer;
function observeReveal() {
  const items = document.querySelectorAll('.reveal:not(.visible)');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { items.forEach(el => el.classList.add('visible')); return; }
  observer ??= new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(el => observer.observe(el));
}

const menu = document.querySelector('[data-menu]');
menu.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); menu.setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('.site-links a').forEach(a => a.addEventListener('click', () => { document.body.classList.remove('menu-open'); menu.setAttribute('aria-expanded', 'false'); }));
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 24), { passive: true });

observeReveal();
fetch('/api/public', { credentials: 'same-origin' })
  .then(response => response.ok ? response.json() : Promise.reject(new Error()))
  .then(apply)
  .catch(() => {
    set('[data-plans]', '<p class="empty-note">No pudimos cargar los planes. Consultá en recepción.</p>');
    document.querySelector('[data-stats]').hidden = true;
  });
