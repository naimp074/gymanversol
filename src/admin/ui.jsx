import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { useApp } from './context.js';
import { initials } from '../lib/format.js';

export { Icon };

export const Badge = ({ tone = 'neutral', children }) => <span className={`badge badge-${tone}`}><i></i>{children}</span>;

export function Avatar({ person }) {
  const name = person?.name || '?';
  const colors = ['peach', 'blue', 'lavender', 'mint', 'sand'];
  const color = colors[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
  if (person?.photo?.startsWith('data:image/')) return <span className={`avatar ${color}`}><img src={person.photo} alt={name} /></span>;
  return <span className={`avatar ${color}`}>{initials(name)}</span>;
}

export const Empty = ({ message }) => <div className="empty"><Icon name="sparkles" size={28} /><p>{message}</p></div>;

export function Field({ label, name, type = 'text', defaultValue, className = '', ...rest }) {
  const value = type === 'file' ? {} : { defaultValue: defaultValue ?? '' };
  return <label className={`field ${className}`}><span>{label}</span><input name={name} type={type} {...value} {...rest} /></label>;
}

export function SelectField({ label, name, options, defaultValue, value, onChange, className = '', ...rest }) {
  const control = value !== undefined ? { value, onChange } : { defaultValue: defaultValue ?? '', onChange };
  return <label className={`field ${className}`}><span>{label}</span><select name={name} {...control} {...rest}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

export const TextArea = ({ label, name, defaultValue = '', className = '', rows = 4, ...rest }) =>
  <label className={`field ${className}`}><span>{label}</span><textarea name={name} rows={rows} defaultValue={defaultValue ?? ''} {...rest} /></label>;

export const Check = ({ label, name, defaultChecked = false, description = '' }) =>
  <label className="checkbox-field full"><input type="checkbox" name={name} defaultChecked={defaultChecked} /><span>{label}{description && <small className="muted">{description}</small>}</span></label>;

export const Button = ({ children, icon, className = 'btn-secondary', ...rest }) =>
  <button type="button" className={`btn ${className}`} {...rest}>{icon && <Icon name={icon} size={17} />}{children}</button>;

export function Table({ headers, rows, empty = 'Todavía no hay registros.' }) {
  if (!rows?.length) return <Empty message={empty} />;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}

// Encabezado de sección dentro de los módulos.
export const Heading = ({ title, sub, actions }) =>
  <div className="toolbar"><div><h2 className="section-title">{title}</h2>{sub && <p className="muted">{sub}</p>}</div><div className="toolbar-actions">{actions}</div></div>;

export const Stat = ({ title, value, note, icon = 'activity' }) =>
  <div className="stat-card"><div className="stat-label"><Icon name={icon} size={18} /> {title}</div><div className="stat-value">{value}</div>{note && <div className="muted">{note}</div>}</div>;

export const Metric = ({ label, value, detail, icon, tone = 'peach' }) =>
  <article className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={20} /></span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></article>;

export function StatusBadge({ member: m }) {
  if (m.status === 'activo') return <Badge tone={m.days_left <= 5 ? 'amber' : 'green'}>{m.days_left <= 5 ? 'Vence pronto' : 'Activo'}</Badge>;
  if (m.status === 'pausado') return <Badge tone="amber">{`En pausa · ${m.days_left} ${m.days_left === 1 ? 'día' : 'días'}`}</Badge>;
  return <Badge tone={m.status === 'vencido' ? 'red' : 'neutral'}>{{ vencido: 'Vencido', suspendido: 'Suspendido', baja: 'Baja' }[m.status] || m.status}</Badge>;
}

export const Logo = () => <>
  <span className="brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6 31 17 8h7l11 23H26l-6-14-6 14Z" fill="currentColor" /><path d="m17 27 4-7 6 11H15Z" fill="#ffd8c9" /></svg></span>
  <span className="brand-word">ANVERSOL<small>GYM MANAGEMENT</small></span>
</>;

export const KEEP_OPEN = Symbol('keep-open');

// Diálogo con formulario: onSubmit(FormData, form) guarda, cierra y refresca los datos.
export function Modal({ title, wide = false, onSubmit, submitLabel = 'Guardar', children }) {
  const { closeModal, refresh } = useApp();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    document.body.classList.add('modal-open');
    const timer = setTimeout(() => sectionRef.current?.querySelector('input:not([type=hidden]), select, textarea, button')?.focus(), 20);
    return () => { clearTimeout(timer); document.body.classList.remove('modal-open'); previous?.focus?.(); };
  }, []);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeModal(); }
    if (e.key === 'Tab') {
      const els = [...sectionRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href]')].filter(x => x.offsetParent !== null);
      if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0]?.focus(); }
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!onSubmit) { closeModal(); return; }
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(new FormData(formRef.current), formRef.current);
      if (result === KEEP_OPEN) { setBusy(false); return; }
      closeModal();
      await refresh().catch(() => {});
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }} onKeyDown={onKeyDown}>
    <section ref={sectionRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-head"><div><span className="eyebrow">ANVERSOL GYM</span><h2 id="modal-title">{title}</h2></div><button type="button" className="icon-btn" onClick={closeModal} aria-label="Cerrar"><Icon name="close" /></button></header>
      <form ref={formRef} id="modal-form" onSubmit={submit} noValidate={false}>
        <div className="modal-content">{children}</div>
        <div className="form-error" role="alert" hidden={!error}>{error}</div>
        <footer className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={closeModal}>{onSubmit ? 'Cancelar' : 'Cerrar'}</button>
          {onSubmit && <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button>}
        </footer>
      </form>
    </section>
  </div>;
}

export const Confirm = ({ title, message, onConfirm, submitLabel = 'Confirmar' }) =>
  <Modal title={title} onSubmit={onConfirm} submitLabel={submitLabel}><p>{message}</p></Modal>;
