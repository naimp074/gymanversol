import { state, api, esc, money, date, time, icon, badge, avatar, toast, modal, closeModal, refresh, navigate, memberName, empty, field, selectField, confirmAction, imageDataUrl } from './core.js';

// Administrative and training modules share the same authenticated, local API.
const methods = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito'];
const roles = { dueno: 'Dueño', administrador: 'Administrador', recepcionista: 'Recepcionista', profesor: 'Profesor', contador: 'Contador' };
const ui = { cart: {}, productSearch: '', saleSearch: '', saleMethod: 'Efectivo', cashPeriod: 'today', classDate: '', progressMember: '', reportFrom: '', reportTo: '', reportType: 'movements', auditSearch: '' };
const data = () => state.data || {};
const rows = key => data()[key] || [];
const today = () => data().today || new Date().toLocaleDateString('en-CA');
const admin = () => ['dueno', 'administrador'].includes(state.user?.role);
const trainer = () => admin() || state.user?.role === 'profesor';
const cashier = () => admin() || ['recepcionista', 'contador'].includes(state.user?.role);
const canSchedule = () => admin() || state.user?.role === 'profesor';
const canReserve = () => canSchedule() || state.user?.role === 'recepcionista';
const canStock = () => admin() || state.user?.role === 'contador';
const canAudit = () => admin() || state.user?.role === 'contador';
const fullDate = value => value ? `${date(value)} · ${time(value)}` : '—';
const localDay = value => !value ? '' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const total = list => list.reduce((sum, item) => sum + Number(item.amount || 0), 0);
const signed = item => item.type === 'ingreso' ? Number(item.amount) : -Number(item.amount);
const byNewest = list => [...list].sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
const button = (label, action, id = '', cls = 'btn-secondary', glyph = '') => `<button type="button" class="btn ${cls}" data-action="${action}" data-id="${esc(id)}">${glyph ? icon(glyph, 17) : ''}${label}</button>`;
const heading = (title, sub = '', actions = '') => `<div class="toolbar"><div><h2 class="section-title">${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="toolbar-actions">${actions}</div></div>`;
const stat = (title, value, note = '', glyph = 'activity') => `<div class="stat-card"><div class="stat-label">${icon(glyph, 18)} ${title}</div><div class="stat-value">${value}</div>${note ? `<div class="muted">${note}</div>` : ''}</div>`;
const table = (headers, body, message = 'Todavía no hay registros.') => body ? `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>` : empty(message);
const textarea = (label, name, value = '', extra = '') => `<label class="field ${extra}"><span>${label}</span><textarea name="${name}" rows="4">${esc(value)}</textarea></label>`;
const check = (label, name, checked = false, description = '') => `<label class="checkbox-field full"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${label}${description ? `<small class="muted">${description}</small>` : ''}</span></label>`;
const options = list => list.map(value => ({ value, label: value }));
const memberOptions = () => rows('members').filter(m => m.state !== 'baja').map(m => ({ value: m.id, label: `${m.name} · #${m.number || m.dni}` }));
const teacherOptions = () => [{ value: '', label: 'Sin profesor asignado' }, ...rows('teachers').filter(t => t.state !== 'inactivo').map(t => ({ value: t.id, label: t.name }))];
const teacherName = id => rows('teachers').find(t => t.id === id)?.name || 'Sin asignar';
const payload = fd => Object.fromEntries(fd.entries());
const denied = () => empty('Tu perfil no tiene acceso a esta sección.');
const save = (collection, entity, body) => api(`/api/${collection}${entity?.id ? `/${entity.id}` : ''}`, { method: entity?.id ? 'PUT' : 'POST', body });
const activeCash = () => rows('cashSessions').find(s => !s.closedAt);
const cashExpected = session => Number(session?.openingAmount || 0) + rows('movements').filter(m => m.sessionId === session?.id && m.method === 'Efectivo').reduce((sum, m) => sum + signed(m), 0);

function renderPlans() {
  const plans = rows('plans');
  return heading('Una membresía para cada objetivo', 'Definí precios, duración y condiciones de acceso.', admin() ? button('Crear plan', 'plan-new', '', 'btn-primary', 'plus') : '') +
    (plans.length ? `<div class="grid-3 plans-grid">${plans.map((p, index) => `<article class="card plan-card ${index === 1 ? 'featured' : ''}"><div class="card-head"><span class="plan-icon">${icon(index % 2 ? 'zap' : 'layers', 22)}</span>${badge(p.active === false ? 'Inactivo' : 'Disponible', p.active === false ? 'neutral' : 'green')}</div><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description || 'Entrená a tu ritmo, cumplí tus metas.')}</p><div class="plan-price">${money(p.price)}<small> / ${p.duration} días</small></div><ul class="plan-features"><li>${icon('check', 16)} ${p.accessLimit ? `${p.accessLimit} accesos por membresía` : 'Accesos ilimitados'}</li><li>${icon('clock', 16)} De ${esc(p.startTime || '06:00')} a ${esc(p.endTime || '23:00')}</li><li>${icon('users', 16)} ${rows('members').filter(m => m.planId === p.id && m.status === 'activo').length} socios activos</li>${Number(p.discount) ? `<li>${icon('tag', 16)} ${p.discount}% de descuento aplicado al cobrar</li>` : ''}</ul>${admin() ? `<div class="toolbar-actions">${button('Editar plan', 'plan-edit', p.id, 'btn-secondary')}${button(p.active === false ? 'Activar' : 'Desactivar', 'plan-toggle', p.id, 'btn-sm btn-secondary')}</div>` : ''}</article>`).join('')}</div>` : `<div class="card">${empty('Creá tu primer plan para comenzar a cobrar membresías.')}</div>`);
}

function planModal(id) {
  const p = rows('plans').find(item => item.id === id);
  modal(p ? 'Editar plan' : 'Nuevo plan', `<div class="form-grid">${field('Nombre del plan', 'name', 'text', p?.name || '', 'required maxlength="100"')}${field('Precio (ARS)', 'price', 'number', p?.price ?? '', 'required min="0" step="1"')}${field('Duración en días', 'duration', 'number', p?.duration || 30, 'required min="1" max="3650"')}${field('Accesos por período · 0 = ilimitados', 'accessLimit', 'number', p?.accessLimit || 0, 'required min="0" step="1"')}${field('Horario desde', 'startTime', 'time', p?.startTime || '06:00', 'required')}${field('Horario hasta', 'endTime', 'time', p?.endTime || '23:00', 'required')}${field('Descuento del plan (%)', 'discount', 'number', p?.discount || 0, 'min="0" max="100" step="1"')}${textarea('Descripción', 'description', p?.description || '', 'full')}${check('Plan disponible para nuevas membresías', 'active', p?.active !== false)}</div>`, async fd => {
    const values = payload(fd);
    for (const key of ['price', 'duration', 'accessLimit', 'discount']) values[key] = Number(values[key]);
    values.active = fd.has('active');
    if (values.startTime >= values.endTime) throw new Error('El horario de cierre debe ser posterior al de apertura.');
    await save('plans', p, values);
    toast(p ? 'Plan actualizado.' : 'Plan creado.');
  }, true);
}

function cashFiltered() {
  return rows('movements').filter(m => ui.cashPeriod === 'all' || (ui.cashPeriod === 'month' ? localDay(m.date).slice(0, 7) === today().slice(0, 7) : localDay(m.date) === today()));
}

function renderCash() {
  if (!cashier()) return denied();
  const session = activeCash();
  const movements = cashFiltered();
  const income = total(movements.filter(m => m.type === 'ingreso'));
  const expenses = total(movements.filter(m => m.type === 'gasto'));
  const withdrawals = total(movements.filter(m => m.type === 'retiro'));
  return `<div class="card cash-status"><div><div class="card-head"><h2 class="section-title">${session ? 'La caja está abierta' : 'Caja cerrada'}</h2>${badge(session ? 'Operativa' : 'Sin turno abierto', session ? 'green' : 'neutral')}</div><p class="muted">${session ? `Apertura: ${fullDate(session.openedAt)} · Fondo inicial ${money(session.openingAmount)}` : 'Abrí un turno para registrar cobros, ventas y movimientos.'}</p></div><div class="toolbar-actions">${session ? `${button('Registrar ingreso', 'cash-income', '', 'btn-secondary', 'plus')}${button('Gasto / retiro', 'cash-expense', '', 'btn-secondary', 'minus')}${button('Cerrar caja', 'cash-close', '', 'btn-primary', 'lock')}` : button('Abrir caja', 'cash-open', '', 'btn-primary', 'unlock')}</div></div>
    <div class="toolbar"><h2 class="section-title">Resumen de caja</h2><select class="filter-select" id="cash-period" aria-label="Período de caja"><option value="today" ${ui.cashPeriod === 'today' ? 'selected' : ''}>Hoy</option><option value="month" ${ui.cashPeriod === 'month' ? 'selected' : ''}>Este mes</option><option value="all" ${ui.cashPeriod === 'all' ? 'selected' : ''}>Todo el historial</option></select></div>
    <div class="stats-grid">${stat('Ingresos', money(income), 'Cuotas, ventas y otros ingresos', 'trending-up')}${stat('Gastos', money(expenses), `Retiros: ${money(withdrawals)}`, 'trending-down')}${stat('Balance del período', money(income - expenses - withdrawals), 'Ingresos menos gastos y retiros', 'wallet')}${stat('Efectivo esperado', money(session ? cashExpected(session) : 0), session ? 'Incluye fondo inicial del turno' : 'Abrí la caja para comenzar', 'banknote')}</div>
    <div class="card"><div class="card-head"><h3 class="card-title">Ingresos por medio de pago</h3><span class="muted">${movements.filter(m => m.type === 'ingreso').length} operaciones</span></div><div class="method-grid">${methods.map(method => `<div class="metric-mini"><span class="muted">${method}</span><strong>${money(total(movements.filter(m => m.type === 'ingreso' && m.method === method)))}</strong></div>`).join('')}</div></div>
    <div class="card"><div class="card-head"><h3 class="card-title">Movimientos</h3>${button('Exportar CSV', 'export', 'movements', 'btn-secondary btn-sm', 'download')}</div>${table(['Detalle', 'Categoría', 'Fecha', 'Medio', 'Importe'], byNewest(movements).map(m => `<tr><td><strong>${esc(m.description || m.type)}</strong><small class="muted">${badge(m.type === 'ingreso' ? 'Ingreso' : m.type === 'gasto' ? 'Gasto' : 'Retiro', m.type === 'ingreso' ? 'green' : 'amber')}</small></td><td>${esc(m.category || 'General')}</td><td>${fullDate(m.date)}</td><td>${esc(m.method)}</td><td class="amount ${m.type === 'ingreso' ? 'text-green' : 'text-red'}">${m.type === 'ingreso' ? '+' : '−'} ${money(m.amount)}</td></tr>`).join(''), 'No hay movimientos en este período.')}</div>
    <div class="card"><div class="card-head"><h3 class="card-title">Historial de turnos</h3></div>${table(['Apertura', 'Cierre', 'Inicial', 'Esperado', 'Contado', 'Diferencia'], [...rows('cashSessions')].sort((a, b) => b.openedAt.localeCompare(a.openedAt)).map(s => `<tr><td>${fullDate(s.openedAt)}</td><td>${s.closedAt ? fullDate(s.closedAt) : badge('Abierta', 'green')}</td><td>${money(s.openingAmount)}</td><td>${money(s.closedAt ? s.expectedAmount : cashExpected(s))}</td><td>${s.closedAt ? money(s.countedAmount) : '—'}</td><td>${s.closedAt ? badge(money(s.difference), Number(s.difference) === 0 ? 'green' : 'red') : '—'}</td></tr>`).join(''))}</div>`;
}

function openCash() {
  modal('Abrir caja', `<p class="muted">Ingresá el efectivo disponible al comenzar el turno.</p>${field('Fondo inicial (ARS)', 'openingAmount', 'number', 0, 'required min="0" step="1"')}`, async fd => {
    await api('/api/cash/open', { method: 'POST', body: { openingAmount: Number(fd.get('openingAmount')) } });
    toast('Caja abierta. Ya podés registrar operaciones.');
  });
}

function closeCash() {
  const session = activeCash();
  if (!session) return toast('La caja ya está cerrada.', 'error');
  modal('Cerrar caja', `<div class="notice">Efectivo esperado: <strong>${money(cashExpected(session))}</strong></div><p class="muted">Contá el efectivo físico. La diferencia quedará registrada en el cierre.</p>${field('Efectivo contado (ARS)', 'countedAmount', 'number', '', 'required min="0" step="1"')}${textarea('Notas del cierre', 'notes')}`, async fd => {
    await api('/api/cash/close', { method: 'POST', body: { countedAmount: Number(fd.get('countedAmount')), notes: fd.get('notes') } });
    toast('Caja cerrada y arqueo registrado.');
  });
}

function movementModal(kind) {
  if (!activeCash()) return toast('Primero abrí la caja.', 'error');
  const expense = kind === 'gasto';
  const categories = expense ? ['Luz', 'Agua', 'Internet', 'Alquiler', 'Sueldos', 'Limpieza', 'Mantenimiento', 'Máquinas', 'Mercadería', 'Otros'] : ['Inscripción', 'Servicios', 'Otros ingresos'];
  modal(expense ? 'Registrar gasto o retiro' : 'Registrar ingreso', `<div class="form-grid">${expense ? selectField('Tipo de movimiento', 'type', [{ value: 'gasto', label: 'Gasto del gimnasio' }, { value: 'retiro', label: 'Retiro de dinero' }], 'gasto') : '<input type="hidden" name="type" value="ingreso">'}${selectField('Categoría', 'category', options(categories))}${field('Importe (ARS)', 'amount', 'number', '', 'required min="1" step="1"')}${selectField('Medio de pago', 'method', options(methods), 'Efectivo')}${field('Descripción', 'description', 'text', '', 'required maxlength="250"')}</div>`, async fd => {
    await api('/api/movements', { method: 'POST', body: { ...payload(fd), amount: Number(fd.get('amount')) } });
    toast('Movimiento registrado.');
  }, true);
}

function productMatches(p, search) { return `${p.name} ${p.category || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')); }
function renderProducts() {
  if (!cashier()) return denied();
  const products = rows('products');
  const visible = products.filter(p => productMatches(p, ui.productSearch));
  const low = products.filter(p => p.active !== false && Number(p.stock) <= Number(p.minStock));
  return heading('Tu tienda, bajo control', 'Productos, precios y existencias del gimnasio.', canStock() ? button('Nuevo producto', 'product-new', '', 'btn-primary', 'plus') : '') +
    `<div class="stats-grid">${stat('Productos activos', products.filter(p => p.active !== false).length, 'En el catálogo', 'package')}${stat('Stock bajo', low.length, 'En mínimo o sin existencias', 'alert-triangle')}${stat('Unidades disponibles', products.filter(p => p.active !== false).reduce((s, p) => s + Number(p.stock), 0), 'Stock actual', 'boxes')}${canStock() ? stat('Valor del stock', money(products.filter(p => p.active !== false).reduce((s, p) => s + Number(p.stock) * Number(p.cost || 0), 0)), 'Calculado al costo', 'wallet') : ''}</div>
    <div class="card"><div class="toolbar"><label class="search-field">${icon('search', 18)}<input id="product-search" type="search" placeholder="Buscar producto o categoría…" value="${esc(ui.productSearch)}" aria-label="Buscar productos"></label>${button('Exportar CSV', 'export', 'products', 'btn-secondary btn-sm', 'download')}</div>${table(['Producto', 'Precio', ...(canStock() ? ['Costo'] : []), 'Stock', 'Estado', ''], visible.map(p => `<tr><td><strong>${esc(p.name)}</strong><small class="muted">${esc(p.category || 'General')}</small></td><td class="amount">${money(p.price)}</td>${canStock() ? `<td>${money(p.cost)}</td>` : ''}<td><strong>${p.stock}</strong><small class="muted">Mínimo: ${p.minStock || 0}</small></td><td>${p.active === false ? badge('Inactivo') : Number(p.stock) === 0 ? badge('Sin stock', 'red') : Number(p.stock) <= Number(p.minStock) ? badge('Stock bajo', 'amber') : badge('Disponible', 'green')}</td><td>${canStock() ? button('Editar', 'product-edit', p.id, 'btn-secondary btn-sm', 'edit') : button('Vender', 'product-sell', p.id, 'btn-secondary btn-sm', 'shopping-cart')}</td></tr>`).join(''), ui.productSearch ? 'No encontramos productos con esa búsqueda.' : 'Agregá productos para comenzar a vender.')}</div>`;
}

function productModal(id) {
  const p = rows('products').find(item => item.id === id);
  modal(p ? 'Editar producto' : 'Nuevo producto', `<div class="form-grid">${field('Nombre', 'name', 'text', p?.name || '', 'required maxlength="120"')}${field('Categoría', 'category', 'text', p?.category || '', 'maxlength="80"')}${field('Precio de venta (ARS)', 'price', 'number', p?.price ?? '', 'required min="0" step="1"')}${field('Costo (ARS)', 'cost', 'number', p?.cost ?? 0, 'required min="0" step="1"')}${field('Unidades en stock', 'stock', 'number', p?.stock ?? 0, 'required min="0" step="1"')}${field('Stock mínimo', 'minStock', 'number', p?.minStock ?? 3, 'required min="0" step="1"')}${check('Disponible para la venta', 'active', p?.active !== false)}${p ? '<p class="muted full">Los ajustes de stock quedan registrados en la auditoría.</p>' : ''}</div>`, async fd => {
    const values = payload(fd);
    for (const key of ['price', 'cost', 'stock', 'minStock']) values[key] = Number(values[key]);
    values.active = fd.has('active');
    await save('products', p, values);
    toast('Producto guardado.');
  }, true);
}

function cartItems() { return Object.entries(ui.cart).map(([id, quantity]) => ({ product: rows('products').find(p => p.id === id), quantity })).filter(item => item.product && item.quantity > 0); }
function renderSales() {
  if (!cashier()) return denied();
  const products = rows('products').filter(p => p.active !== false && productMatches(p, ui.saleSearch));
  const cart = cartItems();
  const sum = cart.reduce((s, item) => s + item.quantity * item.product.price, 0);
  return heading('Punto de venta', 'Sumá productos al carrito y registrá el cobro.', badge(activeCash() ? 'Caja abierta' : 'Caja cerrada', activeCash() ? 'green' : 'amber')) +
    `<div class="pos-layout"><section class="card"><div class="toolbar"><h3 class="card-title">Productos</h3><label class="search-field">${icon('search', 18)}<input id="sale-search" type="search" value="${esc(ui.saleSearch)}" placeholder="Buscar producto…" aria-label="Buscar para vender"></label></div><div class="pos-grid">${products.length ? products.map((p, i) => `<button type="button" class="product-tile" data-action="sale-add" data-id="${esc(p.id)}" ${Number(p.stock) <= Number(ui.cart[p.id] || 0) ? 'disabled' : ''}><span class="product-art product-art-${i % 4}">${icon(/bebida|agua/i.test(p.category + p.name) ? 'droplet' : /ropa/i.test(p.category) ? 'shirt' : 'package', 34)}</span><small class="muted">${esc(p.category || 'Producto')}</small><strong>${esc(p.name)}</strong><div class="product-tile-footer"><b>${money(p.price)}</b><span class="muted">${p.stock} un.</span></div></button>`).join('') : empty('No hay productos disponibles.')}</div></section>
    <aside class="card cart-card"><div class="card-head"><h3 class="card-title">Venta actual</h3>${badge(`${cart.reduce((s, i) => s + i.quantity, 0)} productos`)}</div><div class="cart-items">${cart.length ? cart.map(({ product: p, quantity }) => `<div class="cart-line"><div><strong>${esc(p.name)}</strong><small class="muted">${money(p.price)} por unidad</small></div><div class="cart-quantity">${button('−', 'sale-minus', p.id, 'btn-secondary btn-sm')}<span>${quantity}</span>${button('+', 'sale-add', p.id, 'btn-secondary btn-sm')}</div><strong>${money(p.price * quantity)}</strong></div>`).join('') : empty('Seleccioná productos para comenzar una venta.')}</div><div class="cart-total"><span>Total</span><strong>${money(sum)}</strong></div>${selectField('Medio de pago', 'saleMethod', options(methods), ui.saleMethod)}<button type="button" class="btn btn-primary full-width" data-action="sale-checkout" ${!cart.length || !activeCash() ? 'disabled' : ''}>${icon('check', 18)} Cobrar ${money(sum)}</button>${cart.length ? button('Vaciar carrito', 'sale-clear', '', 'btn-secondary full-width') : ''}${!activeCash() ? `<p class="muted">Abrí la caja para cobrar esta venta.</p>${button('Ir a caja', 'module-nav', 'caja', 'btn-secondary full-width')}` : ''}</aside></div>
    <div class="card"><div class="card-head"><h3 class="card-title">Últimas ventas</h3>${button('Exportar CSV', 'export', 'sales', 'btn-secondary btn-sm', 'download')}</div>${table(['Fecha', 'Productos', 'Medio', 'Total', 'Estado', ''], byNewest(rows('sales')).slice(0, 40).map(s => `<tr><td>${fullDate(s.date)}</td><td>${esc((s.items || []).map(i => `${i.quantity} × ${i.name || rows('products').find(p => p.id === i.productId)?.name || 'Producto'}`).join(', '))}</td><td>${esc(s.method)}</td><td class="amount">${money(s.total)}</td><td>${badge(s.voided ? 'Anulada' : 'Cobrada', s.voided ? 'red' : 'green')}</td><td>${admin() && !s.voided ? button('Anular', 'sale-void', s.id, 'btn-danger btn-sm') : ''}</td></tr>`).join(''), 'Las ventas cobradas aparecerán acá.')}</div>`;
}

function addCart(id) {
  const p = rows('products').find(item => item.id === id);
  if (!p || p.active === false || Number(p.stock) <= Number(ui.cart[id] || 0)) return toast('No queda más stock disponible de este producto.', 'error');
  ui.cart[id] = (ui.cart[id] || 0) + 1;
  navigate('ventas');
}

async function checkoutSale(element) {
  const items = cartItems().map(({ product, quantity }) => ({ productId: product.id, quantity }));
  if (!items.length) return;
  const method = document.querySelector('[name="saleMethod"]')?.value || 'Efectivo';
  element.disabled = true;
  try {
    await api('/api/sales', { method: 'POST', body: { items, method } });
    ui.cart = {};
    toast('Venta registrada. El stock y la caja están actualizados.');
    await refresh();
  } catch (error) { element.disabled = false; throw error; }
}

function voidSale(id) {
  modal('Anular venta', `<div class="notice">Se devolverán los productos al stock y se registrará la devolución en caja. La venta original permanecerá en el historial.</div>${field('Motivo de la anulación', 'reason', 'text', '', 'required minlength="3" maxlength="250"')}`, async fd => {
    await api(`/api/sales/${id}/void`, { method: 'POST', body: { reason: fd.get('reason') } });
    toast('Venta anulada y stock restituido.');
  });
}

function renderTeachers() {
  const teachers = rows('teachers');
  return heading('El equipo que acompaña cada meta', 'Profesores, especialidades y horarios de trabajo.', admin() ? button('Agregar profesor', 'teacher-new', '', 'btn-primary', 'plus') : '') +
    (teachers.length ? `<div class="grid-3">${teachers.map(t => {
      const sessions = rows('classes').filter(c => c.teacherId === t.id && c.date >= today());
      const students = new Set(rows('routines').filter(r => r.teacherId === t.id).map(r => r.memberId)).size;
      return `<article class="card teacher-card"><div class="card-head">${avatar(t)}${badge(t.state === 'inactivo' ? 'Inactivo' : 'Activo', t.state === 'inactivo' ? 'neutral' : 'green')}</div><h3>${esc(t.name)}</h3><p class="muted">${esc(t.specialty || 'Entrenamiento general')}</p><div class="stack"><div>${icon('clock', 16)} ${esc(t.schedule || 'Horario a confirmar')}</div><div>${icon('phone', 16)} ${esc(t.phone || 'Sin teléfono registrado')}</div></div><div class="teacher-metrics"><span><strong>${sessions.length}</strong> próximas clases</span><span><strong>${students}</strong> alumnos con rutina</span></div>${admin() || state.user?.role === 'contador' ? `<p class="muted">Sueldo: <strong>${money(t.salary || 0)}</strong></p>` : ''}${admin() ? button('Editar ficha', 'teacher-edit', t.id, 'btn-secondary full-width') : ''}</article>`;
    }).join('')}</div>` : `<div class="card">${empty('Todavía no hay profesores registrados.')}</div>`);
}

function teacherModal(id) {
  const t = rows('teachers').find(item => item.id === id);
  modal(t ? 'Editar profesor' : 'Nuevo profesor', `<div class="form-grid">${field('Nombre y apellido', 'name', 'text', t?.name || '', 'required maxlength="120"')}${field('Teléfono', 'phone', 'tel', t?.phone || '')}${field('Especialidad', 'specialty', 'text', t?.specialty || '')}${field('Horarios de trabajo', 'schedule', 'text', t?.schedule || '', 'placeholder="Lunes a viernes, de 16:00 a 22:00"')}${field('Sueldo (ARS)', 'salary', 'number', t?.salary || 0, 'min="0" step="1"')}${selectField('Estado', 'state', [{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }], t?.state || 'activo')}</div>`, async fd => {
    await save('teachers', t, { ...payload(fd), salary: Number(fd.get('salary')) });
    toast('Ficha del profesor guardada.');
  }, true);
}

function renderClasses() {
  const classes = [...rows('classes')].filter(c => !ui.classDate || c.date === ui.classDate).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const upcoming = classes.filter(c => c.date >= today());
  const past = classes.filter(c => c.date < today());
  const show = [...upcoming, ...past.reverse()];
  return heading('Encontrá tu próxima clase', 'Organizá las sesiones y administrá sus reservas.', canSchedule() ? button('Programar clase', 'class-new', '', 'btn-primary', 'plus') : '') +
    `<div class="toolbar"><div class="toolbar-actions">${field('Filtrar por fecha', 'classDate', 'date', ui.classDate, 'id="class-date"')}${ui.classDate ? button('Ver todas', 'class-reset', '', 'btn-secondary btn-sm') : ''}</div><span class="muted">${upcoming.length} sesiones próximas</span></div>
    ${show.length ? `<div class="grid-3">${show.map(c => {
      const reserved = rows('reservations').filter(r => r.classId === c.id).length;
      const complete = reserved >= Number(c.capacity);
      const finished = c.date < today();
      return `<article class="card class-card"><div class="card-head"><span class="class-date">${date(c.date)}</span>${badge(finished ? 'Finalizada' : complete ? 'Completa' : 'Con lugares', finished ? 'neutral' : complete ? 'amber' : 'green')}</div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.description || 'Movete, conectá y entrená en equipo.')}</p><div class="stack"><span>${icon('clock', 17)} ${esc(c.time)} · ${c.duration} min</span><span>${icon('user', 17)} ${esc(teacherName(c.teacherId))}</span></div><div class="capacity-label"><span>${reserved} / ${c.capacity} reservas</span><span>${Math.max(0, c.capacity - reserved)} libres</span></div><div class="progress-track"><span class="progress-fill" style="width:${Math.min(100, reserved / Math.max(1, Number(c.capacity)) * 100)}%"></span></div><div class="toolbar-actions">${button('Ver reservas', 'class-reservations', c.id, 'btn-secondary btn-sm')}${canSchedule() ? `${button('Editar', 'class-edit', c.id, 'btn-secondary btn-sm')}${button('Eliminar', 'class-delete', c.id, 'btn-danger btn-sm')}` : ''}</div></article>`;
    }).join('')}</div>` : `<div class="card">${empty('No hay clases programadas para esta fecha.')}</div>`}`;
}

function classModal(id) {
  const c = rows('classes').find(item => item.id === id);
  modal(c ? 'Editar clase' : 'Programar clase', `<div class="form-grid">${field('Nombre de la clase', 'name', 'text', c?.name || '', 'required maxlength="100"')}${selectField('Profesor', 'teacherId', teacherOptions(), c?.teacherId || '')}${field('Fecha', 'date', 'date', c?.date || today(), 'required')}${field('Hora de inicio', 'time', 'time', c?.time || '18:00', 'required')}${field('Duración (minutos)', 'duration', 'number', c?.duration || 60, 'required min="5" max="480" step="1"')}${field('Cupo de personas', 'capacity', 'number', c?.capacity || 20, 'required min="1" max="500" step="1"')}${textarea('Descripción', 'description', c?.description || '', 'full')}</div>`, async fd => {
    await save('classes', c, { ...payload(fd), duration: Number(fd.get('duration')), capacity: Number(fd.get('capacity')) });
    toast('Clase guardada.');
  }, true);
}

function reservationModal(id) {
  const c = rows('classes').find(item => item.id === id);
  if (!c) return;
  const reservations = rows('reservations').filter(r => r.classId === id);
  const canBook = canReserve() && c.date >= today() && reservations.length < c.capacity;
  const availableMembers = rows('members').filter(m => m.status === 'activo' && (!m.expiresAt || m.expiresAt >= c.date) && !reservations.some(r => r.memberId === m.id));
  modal(`Reservas · ${c.name}`, `<div class="notice">${date(c.date)} · ${esc(c.time)} · ${reservations.length} de ${c.capacity} lugares reservados</div>${table(['Socio', 'Reserva', ''], reservations.map(r => `<tr><td>${esc(memberName(r.memberId))}</td><td>${date(r.createdAt || c.date)}</td><td>${canReserve() ? button('Cancelar', 'reservation-delete', r.id, 'btn-danger btn-sm') : ''}</td></tr>`).join(''), 'Todavía no hay reservas para esta clase.')}${canBook && availableMembers.length ? `<div class="stack">${selectField('Agregar socio con membresía activa', 'memberId', availableMembers.map(m => ({ value: m.id, label: m.name })))}<p class="muted">Guardar agrega una reserva a esta clase.</p></div>` : `<p class="muted">${c.date < today() ? 'Esta clase ya finalizó.' : reservations.length >= c.capacity ? 'La clase está completa.' : 'No hay otros socios activos disponibles para reservar.'}</p>`}`, canBook && availableMembers.length ? async fd => {
    await api('/api/reservations', { method: 'POST', body: { classId: c.id, memberId: fd.get('memberId') } });
    toast('Lugar reservado.');
  } : null, true);
}

function renderRoutines() {
  const routines = byNewest(rows('routines'));
  return heading('Entrenamiento con dirección', 'Rutinas personalizadas para acompañar a tus socios.', trainer() ? button('Crear rutina', 'routine-new', '', 'btn-primary', 'plus') : '') +
    (routines.length ? `<div class="grid-2">${routines.map(r => `<article class="card routine-card"><div class="card-head"><div class="member-inline">${avatar(rows('members').find(m => m.id === r.memberId) || { name: memberName(r.memberId) })}<div><strong>${esc(memberName(r.memberId))}</strong><small class="muted">${esc(teacherName(r.teacherId))}</small></div></div>${badge('Entrenamiento')}</div><h3>${esc(r.name)}</h3><p class="muted">${esc(r.goal || 'Acompañar el progreso del socio')}</p><div class="routine-preview">${esc((r.days || '').slice(0, 240))}${(r.days || '').length > 240 ? '…' : ''}</div><div class="toolbar-actions">${button('Ver rutina', 'routine-view', r.id, 'btn-secondary btn-sm')}${trainer() ? button('Editar', 'routine-edit', r.id, 'btn-secondary btn-sm', 'edit') : ''}</div></article>`).join('')}</div>` : `<div class="card">${empty('Creá una rutina y asignala a un socio para comenzar.')}</div>`);
}

function routineModal(id) {
  const r = rows('routines').find(item => item.id === id);
  if (!memberOptions().length) return toast('Registrá un socio antes de crear su rutina.', 'error');
  modal(r ? 'Editar rutina' : 'Nueva rutina', `<div class="form-grid">${selectField('Socio', 'memberId', memberOptions(), r?.memberId || '')}${selectField('Profesor', 'teacherId', teacherOptions(), r?.teacherId || '')}${field('Nombre de la rutina', 'name', 'text', r?.name || '', 'required placeholder="Fuerza · Ciclo 1" maxlength="120"')}${field('Objetivo', 'goal', 'text', r?.goal || '', 'placeholder="Ganar fuerza y mejorar técnica"')}${textarea('Días, ejercicios, series y repeticiones', 'days', r?.days || '', 'full')}${textarea('Indicaciones y observaciones', 'notes', r?.notes || '', 'full')}</div><p class="muted">Ejemplo: Lunes · Piernas\nSentadilla: 4 × 10 · Descanso: 90 segundos.</p>`, async fd => {
    if (!String(fd.get('days') || '').trim()) throw new Error('Agregá los ejercicios de la rutina.');
    await save('routines', r, payload(fd));
    toast('Rutina guardada.');
  }, true);
}

function routineView(id) {
  const r = rows('routines').find(item => item.id === id);
  if (!r) return;
  modal(r.name, `<div class="report-document"><h3>${esc(memberName(r.memberId))}</h3><p class="muted">${esc(teacherName(r.teacherId))} · ${esc(r.goal || 'Rutina personalizada')}</p><div class="routine-days">${esc(r.days)}</div>${r.notes ? `<p>${esc(r.notes)}</p>` : ''}</div><div class="toolbar-actions no-print">${button('Imprimir / guardar PDF', 'module-print', '', 'btn-secondary', 'printer')}${trainer() ? button('Eliminar rutina', 'routine-delete', r.id, 'btn-danger') : ''}</div>`, null, true);
}

function weightChart(measures) {
  const points = measures.filter(m => Number(m.weight) > 0).slice(-12);
  if (points.length < 2) return empty('Registrá al menos dos mediciones de peso para ver la evolución.');
  const values = points.map(m => Number(m.weight));
  const min = Math.floor(Math.min(...values) - 2);
  const max = Math.ceil(Math.max(...values) + 2);
  const W = 650, H = 210, padX = 40, padY = 24;
  const x = i => padX + i * (W - 2 * padX) / Math.max(1, points.length - 1);
  const y = value => H - padY - (value - min) / (max - min) * (H - 2 * padY);
  const coords = points.map((m, i) => `${x(i)},${y(m.weight)}`).join(' ');
  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de peso en kilogramos"><defs><linearGradient id="weight-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ec7958" stop-opacity="0.2"/><stop offset="100%" stop-color="#ec7958" stop-opacity="0"/></linearGradient></defs>${[min, (min + max) / 2, max].map(v => `<line x1="${padX}" x2="${W - padX}" y1="${y(v)}" y2="${y(v)}" stroke="#ebeae7"/><text x="0" y="${y(v) + 4}" font-size="11" fill="#849094">${v.toFixed(0)} kg</text>`).join('')}<polygon points="${padX},${H - padY} ${coords} ${W - padX},${H - padY}" fill="url(#weight-fill)"/><polyline points="${coords}" fill="none" stroke="#ec7958" stroke-width="3" stroke-linejoin="round"/>${points.map((m, i) => `<circle cx="${x(i)}" cy="${y(m.weight)}" r="4" fill="#ec7958"><title>${date(m.date)}: ${m.weight} kg</title></circle><text x="${x(i)}" y="${H - 3}" text-anchor="middle" font-size="10" fill="#849094">${esc(date(m.date).slice(0, 5))}</text>`).join('')}</svg>`;
}

function renderProgress() {
  const members = memberOptions();
  if (!members.some(m => m.value === ui.progressMember)) ui.progressMember = members[0]?.value || '';
  const measures = rows('measurements').filter(m => m.memberId === ui.progressMember).sort((a, b) => a.date.localeCompare(b.date));
  const last = measures.at(-1);
  const first = measures.find(m => Number(m.weight) > 0);
  const latestWeight = [...measures].reverse().find(m => Number(m.weight) > 0);
  const bmi = last?.weight && last?.height ? (Number(last.weight) / (Number(last.height) / 100) ** 2).toFixed(1) : null;
  const difference = latestWeight && first ? (Number(latestWeight.weight) - Number(first.weight)).toFixed(1) : null;
  return heading('Cada avance cuenta', 'Medidas, fotos y evolución de tus socios.', trainer() ? button('Registrar medición', 'measurement-new', ui.progressMember, 'btn-primary', 'plus') : '') +
    `<div class="toolbar"><div class="progress-member-filter">${selectField('Ver progreso de', 'progressMember', members, ui.progressMember)}</div>${last ? `<span class="muted">Última medición: ${date(last.date)}</span>` : ''}</div>
    <div class="stats-grid">${stat('Peso actual', latestWeight ? `${latestWeight.weight} <small>kg</small>` : '—', latestWeight ? `Medido el ${date(latestWeight.date)}` : 'Sin mediciones', 'activity')}${stat('Cambio registrado', difference !== null ? `${Number(difference) > 0 ? '+' : ''}${difference} <small>kg</small>` : '—', 'Desde la primera medición de peso', 'trending-up')}${stat('Altura', last?.height ? `${last.height} <small>cm</small>` : '—', 'Última medición', 'ruler')}${stat('IMC', bmi || '—', 'Peso / altura² · indicador de referencia', 'heart')}</div>
    <div class="card"><div class="card-head"><h3 class="card-title">Evolución del peso</h3><span class="muted">Últimas 12 mediciones</span></div>${weightChart(measures)}</div>
    <div class="card"><div class="card-head"><h3 class="card-title">Historial de medidas</h3></div>${table(['Fecha', 'Peso', 'Cintura', 'Brazo', 'Pecho', 'Pierna', 'Grasa', ''], [...measures].reverse().map(m => `<tr><td>${date(m.date)}</td><td>${m.weight ? `${m.weight} kg` : '—'}</td><td>${m.waist ? `${m.waist} cm` : '—'}</td><td>${m.arm ? `${m.arm} cm` : '—'}</td><td>${m.chest ? `${m.chest} cm` : '—'}</td><td>${m.leg ? `${m.leg} cm` : '—'}</td><td>${m.bodyFat ? `${m.bodyFat}%` : '—'}</td><td>${button('Ver', 'measurement-view', m.id, 'btn-secondary btn-sm')}${trainer() ? button('Editar', 'measurement-edit', m.id, 'btn-secondary btn-sm') : ''}</td></tr>`).join(''), 'Este socio todavía no tiene mediciones registradas.')}</div>`;
}

async function photoFile(form, previous = '') {
  const file = form.querySelector('[name="photoUpload"]')?.files[0];
  if (!file) return form.querySelector('[name="removePhoto"]')?.checked ? '' : previous;
  return imageDataUrl(file);
}

function measurementModal(id, selectedMember = '') {
  const m = rows('measurements').find(item => item.id === id);
  if (!memberOptions().length) return toast('Registrá un socio antes de cargar medidas.', 'error');
  modal(m ? 'Editar medición' : 'Registrar medición', `<div class="form-grid">${selectField('Socio', 'memberId', memberOptions(), m?.memberId || selectedMember || ui.progressMember)}${field('Fecha de medición', 'date', 'date', m?.date || today(), 'required')}${[['Peso (kg)', 'weight'], ['Altura (cm)', 'height'], ['Cintura (cm)', 'waist'], ['Brazo (cm)', 'arm'], ['Pecho (cm)', 'chest'], ['Pierna (cm)', 'leg'], ['Grasa corporal (%)', 'bodyFat']].map(([label, key]) => field(label, key, 'number', m?.[key] || '', `min="0.1" step="0.1" max="${key === 'bodyFat' ? 100 : 600}"`)).join('')}${field('Foto de progreso · cámara o galería', 'photoUpload', 'file', '', 'accept="image/*" capture="environment"')}${m?.photo ? check('Quitar la foto actual', 'removePhoto') : ''}${textarea('Observaciones', 'notes', m?.notes || '', 'full')}</div>`, async (fd, form) => {
    const values = payload(fd);
    for (const key of ['weight', 'height', 'waist', 'arm', 'chest', 'leg', 'bodyFat']) values[key] = fd.get(key) === '' ? null : Number(fd.get(key));
    if (!['weight', 'height', 'waist', 'arm', 'chest', 'leg', 'bodyFat'].some(key => values[key]) && !form.querySelector('[name="photoUpload"]')?.files.length && !m?.photo) throw new Error('Ingresá al menos una medida o una foto.');
    values.photo = await photoFile(form, m?.photo || '');
    delete values.photoUpload;
    delete values.removePhoto;
    await save('measurements', m, values);
    ui.progressMember = values.memberId;
    toast('Medición guardada.');
  }, true);
}

function measurementView(id) {
  const m = rows('measurements').find(item => item.id === id);
  if (!m) return;
  modal(`Progreso · ${memberName(m.memberId)}`, `<p class="muted">Medición del ${date(m.date)}</p><div class="detail-grid">${[['Peso', 'weight', 'kg'], ['Altura', 'height', 'cm'], ['Cintura', 'waist', 'cm'], ['Brazo', 'arm', 'cm'], ['Pecho', 'chest', 'cm'], ['Pierna', 'leg', 'cm'], ['Grasa corporal', 'bodyFat', '%']].map(([label, key, unit]) => `<div><span class="muted">${label}</span><strong>${m[key] ? `${m[key]} ${unit}` : '—'}</strong></div>`).join('')}</div>${m.photo ? `<img class="progress-photo" src="${esc(m.photo)}" alt="Foto de progreso de ${esc(memberName(m.memberId))}">` : ''}${m.notes ? `<p>${esc(m.notes)}</p>` : ''}`, null, true);
}

function reportRange() {
  return { from: ui.reportFrom || `${today().slice(0, 7)}-01`, to: ui.reportTo || today() };
}
function inRange(value) { const { from, to } = reportRange(); const day = localDay(value); return day >= from && day <= to; }

function renderReports() {
  if (!cashier()) return denied();
  const { from, to } = reportRange();
  const movements = rows('movements').filter(m => inRange(m.date));
  const payments = rows('payments').filter(p => inRange(p.date));
  const sales = rows('sales').filter(s => inRange(s.date) && !s.voided);
  const checkins = rows('checkins').filter(c => c.allowed && inRange(c.date));
  const income = total(movements.filter(m => m.type === 'ingreso'));
  const expenses = total(movements.filter(m => m.type === 'gasto'));
  const newMembers = rows('members').filter(m => inRange(m.joinedAt || m.createdAt));
  const expired = rows('members').filter(m => m.status === 'vencido');
  const reportOptions = [{ value: 'movements', label: 'Caja: ingresos, gastos y retiros' }, { value: 'payments', label: 'Cuotas cobradas' }, { value: 'sales', label: 'Ventas' }, { value: 'checkins', label: 'Asistencia' }, { value: 'members', label: 'Socios · padrón completo' }, { value: 'products', label: 'Productos · stock actual' }];
  let headers, body;
  if (ui.reportType === 'payments') {
    headers = ['Fecha', 'Socio', 'Plan', 'Medio', 'Importe'];
    body = byNewest(payments).map(p => `<tr><td>${date(p.date)}</td><td>${esc(memberName(p.memberId))}</td><td>${esc(rows('plans').find(plan => plan.id === p.planId)?.name || 'Plan')}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td></tr>`).join('');
  } else if (ui.reportType === 'sales') {
    headers = ['Fecha', 'Productos', 'Medio', 'Total'];
    body = byNewest(sales).map(s => `<tr><td>${date(s.date)}</td><td>${esc(s.items.map(i => `${i.quantity} × ${i.name || rows('products').find(p => p.id === i.productId)?.name || 'Producto'}`).join(', '))}</td><td>${esc(s.method)}</td><td>${money(s.total)}</td></tr>`).join('');
  } else if (ui.reportType === 'checkins') {
    headers = ['Fecha', 'Socio', 'Ingreso', 'Salida'];
    body = byNewest(checkins).map(c => `<tr><td>${date(c.date)}</td><td>${esc(memberName(c.memberId))}</td><td>${time(c.date)}</td><td>${c.checkoutAt ? time(c.checkoutAt) : '—'}</td></tr>`).join('');
  } else if (ui.reportType === 'members') {
    headers = ['Socio', 'DNI', 'Plan', 'Vencimiento', 'Estado'];
    body = rows('members').map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dni)}</td><td>${esc(m.planName || 'Sin plan')}</td><td>${date(m.expiresAt)}</td><td>${esc(m.status)}</td></tr>`).join('');
  } else if (ui.reportType === 'products') {
    headers = ['Producto', 'Categoría', 'Precio', 'Stock', 'Mínimo'];
    body = rows('products').map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category || 'General')}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.minStock || 0}</td></tr>`).join('');
  } else {
    headers = ['Fecha', 'Tipo', 'Descripción', 'Medio', 'Importe'];
    body = byNewest(movements).map(m => `<tr><td>${date(m.date)}</td><td>${esc(m.type)}</td><td>${esc(m.description)}</td><td>${esc(m.method)}</td><td>${m.type === 'ingreso' ? '+' : '−'} ${money(m.amount)}</td></tr>`).join('');
  }
  return heading('Los números de tu gimnasio', 'Elegí un período para revisar actividad y resultados.', `${button('CSV para Excel', 'report-export', '', 'btn-secondary', 'download')}${button('Imprimir / guardar PDF', 'module-print', '', 'btn-primary', 'printer')}`) +
    `<div class="card no-print"><div class="report-filters">${field('Desde', 'reportFrom', 'date', from, 'id="report-from"')}${field('Hasta', 'reportTo', 'date', to, 'id="report-to"')}${selectField('Reporte', 'reportType', reportOptions, ui.reportType)}${button('Aplicar', 'report-apply', '', 'btn-primary')}</div><div class="toolbar-actions report-shortcuts">${button('Hoy', 'report-period', 'today', 'btn-secondary btn-sm')}${button('Últimos 7 días', 'report-period', 'week', 'btn-secondary btn-sm')}${button('Este mes', 'report-period', 'month', 'btn-secondary btn-sm')}${button('Este año', 'report-period', 'year', 'btn-secondary btn-sm')}</div></div>
    <div class="print-heading"><h2>${esc(data().settings?.gymName || 'Anversol Gym')} · Reporte</h2><p>Del ${date(from)} al ${date(to)}</p></div>
    <div class="stats-grid">${stat('Recaudación', money(income), `${payments.length} cuotas · ${sales.length} ventas`, 'trending-up')}${stat('Gastos', money(expenses), 'Gastos registrados en el período', 'trending-down')}${stat('Resultado operativo', money(income - expenses), 'Ingresos menos gastos; excluye retiros', 'wallet')}${stat('Ingresos al gimnasio', checkins.length, `${new Set(checkins.map(c => c.memberId)).size} socios distintos`, 'users')}</div>
    <div class="card"><div class="report-summary"><div><strong>${newMembers.length}</strong><span>Nuevos socios en el período</span></div><div><strong>${expired.length}</strong><span>Membresías vencidas al día de hoy</span></div><div><strong>${rows('members').filter(m => m.state === 'baja').length}</strong><span>Socios dados de baja actualmente</span></div><div><strong>${money(total(payments))}</strong><span>Cuotas cobradas en el período</span></div></div></div>
    <div class="card"><div class="card-head"><h3 class="card-title">${esc(reportOptions.find(o => o.value === ui.reportType)?.label || 'Movimientos')}</h3><span class="muted">${['members', 'products'].includes(ui.reportType) ? 'Estado actual' : `${date(from)} — ${date(to)}`}</span></div>${table(headers, body, 'No hay registros en este período.')}</div><p class="muted no-print">El archivo CSV se abre en Excel. Para PDF, elegí «Guardar como PDF» en el diálogo de impresión.</p>`;
}

function exportCSV(type, useRange = false) {
  const params = new URLSearchParams({ type });
  if (useRange && !['members', 'products'].includes(type)) { const range = reportRange(); params.set('from', range.from); params.set('to', range.to); }
  const link = document.createElement('a');
  link.href = `/api/export?${params}`;
  link.download = `${type}-${today()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
}

function renderSettings() {
  if (!admin()) return denied();
  const settings = data().settings || {};
  const users = rows('users');
  return `<div class="grid-2"><section class="card"><div class="card-head"><div><h3 class="card-title">Datos del gimnasio</h3><p class="muted">La información que identifica tu espacio.</p></div>${button('Editar', 'settings-edit', '', 'btn-secondary btn-sm', 'edit')}</div><div class="detail-grid"><div><span class="muted">Nombre</span><strong>${esc(settings.gymName || 'Anversol Gym')}</strong></div><div><span class="muted">Teléfono</span><strong>${esc(settings.phone || 'Sin completar')}</strong></div><div class="full"><span class="muted">Dirección</span><strong>${esc(settings.address || 'Sin completar')}</strong></div><div class="full"><span class="muted">Horarios</span><strong>${esc(settings.hours || 'Se calculan desde los planes')}</strong></div><div><span class="muted">WhatsApp</span><strong>${esc(settings.whatsapp || 'Sin completar')}</strong></div><div><span class="muted">Instagram</span><strong>${esc(settings.instagram || 'Sin completar')}</strong></div></div><p class="muted">Se muestran en el <a href="/" target="_blank" rel="noopener">sitio web</a>. Socios: <a href="/socios" target="_blank" rel="noopener">portal de socios</a>.</p></section>
    <section class="card"><div class="card-head"><h3 class="card-title">Control de acceso</h3>${button('Configurar', 'settings-access', '', 'btn-secondary btn-sm', 'settings')}</div><div class="settings-row"><span>Permitir ingreso con cuota vencida</span>${badge(settings.allowExpiredEntry ? 'Activado' : 'Desactivado', settings.allowExpiredEntry ? 'amber' : 'neutral')}</div><div class="settings-row"><span>Recepción puede autorizar vencidos</span>${badge(settings.allowExpiredOverride ? 'Activado' : 'Desactivado', settings.allowExpiredOverride ? 'green' : 'neutral')}</div><div class="settings-row"><span>Exigir apto físico vigente</span>${badge(settings.requireMedical ? 'Activado' : 'Desactivado', settings.requireMedical ? 'green' : 'neutral')}</div></section></div>
    <section class="card"><div class="card-head"><div><h3 class="card-title">Usuarios y permisos</h3><p class="muted">Cada persona accede con su propia cuenta.</p></div>${button('Crear usuario', 'user-new', '', 'btn-primary btn-sm', 'plus')}</div>${table(['Usuario', 'Acceso', 'Rol', 'Estado', ''], users.map(u => `<tr><td><div class="member-inline">${avatar(u)}<strong>${esc(u.name)}</strong></div></td><td>${esc(u.username)}</td><td>${esc(roles[u.role] || u.role)}</td><td>${badge(u.active === false ? 'Inactivo' : 'Activo', u.active === false ? 'neutral' : 'green')}</td><td>${state.user?.role === 'dueno' || u.role !== 'dueno' ? button('Editar', 'user-edit', u.id, 'btn-secondary btn-sm') : badge('Solo el dueño')}</td></tr>`).join(''))}<div class="role-description"><p class="muted"><strong>Dueño / administrador:</strong> gestión completa. <strong>Recepción:</strong> socios, ingresos, cobros, ventas y reservas. <strong>Profesor:</strong> socios, asistencia y entrenamiento. <strong>Contador:</strong> caja y reportes.</p></div></section>
    <section class="card"><div class="card-head"><div><h3 class="card-title">Copias de seguridad</h3><p class="muted">Copia local diaria y conservación de las últimas 14 copias automáticas.</p></div>${button('Crear copia ahora', 'backup-create', '', 'btn-primary btn-sm', 'download')}</div><div class="notice">Descargá una copia y guardala en un disco externo para proteger los datos ante una falla de la computadora principal.</div>${table(['Archivo', 'Creada', 'Tamaño', ''], [...rows('backups')].sort((a, b) => b.name.localeCompare(a.name)).map(b => `<tr><td>${esc(b.name)}</td><td>${fullDate(b.date)}</td><td>${Number(b.size) > 1024 * 1024 ? `${(Number(b.size) / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(Number(b.size) / 1024)} KB`}</td><td><a class="btn btn-secondary btn-sm" href="/api/backups/${encodeURIComponent(b.name)}" download>${icon('download', 16)} Descargar</a></td></tr>`).join(''), 'Todavía no hay copias disponibles.')}</section>
    <section class="card"><div class="card-head"><h3 class="card-title">Acceso desde el celular</h3>${badge(state.access?.lan ? 'WiFi activo' : 'Solo esta PC', state.access?.lan ? 'green' : 'neutral')}</div>
      ${state.access?.lan ? `<p>En el celular, misma WiFi, abrí <strong>${esc(state.access.url)}</strong> o escaneá el código de la pantalla de inicio de sesión. Si no carga, usá ${esc((state.access.urls || []).join(' o ') || 'la IP de esta PC')}.</p>` : '<p class="muted">Para usar el celular, cerrá el sistema y abrí <strong>iniciar-gym-red.cmd</strong>. Después va a aparecer la dirección http://anversol.local:3000.</p>'}
    </section>
    <section class="card"><div class="card-head"><h3 class="card-title">Lector de huellas</h3>${badge('Sin configurar', 'amber')}</div><p class="muted">Todavía no hay un lector conectado. El ingreso por DNI y QR está disponible. La integración de huellas requiere elegir el lector y conectar su SDK; no se guardan ni simulan huellas.</p></section>`;
}

function settingsModal(access = false) {
  const s = data().settings || {};
  modal(access ? 'Reglas de ingreso' : 'Datos del gimnasio', access ? `<div class="stack">${check('Permitir ingresos con cuota vencida', 'allowExpiredEntry', s.allowExpiredEntry, 'El sistema registrará el ingreso y mostrará el estado de la membresía.')}${check('Permitir autorización de recepción para vencidos', 'allowExpiredOverride', s.allowExpiredOverride, 'Recepción podrá autorizar expresamente una cuota vencida.')}${check('Exigir apto físico vigente', 'requireMedical', s.requireMedical, 'El socio deberá tener fecha de vencimiento del apto físico vigente.')}</div>` : `<div class="form-grid">${field('Nombre del gimnasio', 'gymName', 'text', s.gymName || 'Anversol Gym', 'required maxlength="100"')}${field('Teléfono', 'phone', 'tel', s.phone || '')}<div class="full">${field('Dirección', 'address', 'text', s.address || '')}</div><p class="muted full"><strong>Sitio web público.</strong> Estos datos aparecen en la página principal del gimnasio.</p><div class="full">${field('Frase principal', 'tagline', 'text', s.tagline || '', 'maxlength="160" placeholder="Entrená fuerte. Viví mejor."')}</div>${textarea('Quiénes somos', 'about', s.about || '', 'full')}<div class="full">${field('Horarios de atención', 'hours', 'text', s.hours || '', 'maxlength="300" placeholder="Lunes a viernes 7 a 23 · Sábados 9 a 14"')}</div>${field('WhatsApp (código de país incluido)', 'whatsapp', 'tel', s.whatsapp || '', 'placeholder="54911…"')}${field('Instagram', 'instagram', 'text', s.instagram || '', 'placeholder="@anversolgym"')}${field('Email de contacto', 'email', 'email', s.email || '')}</div>`, async fd => {
    const values = access ? { ...s, allowExpiredEntry: fd.has('allowExpiredEntry'), allowExpiredOverride: fd.has('allowExpiredOverride'), requireMedical: fd.has('requireMedical') } : { ...s, ...payload(fd) };
    await api('/api/settings', { method: 'PUT', body: values });
    toast('Configuración guardada.');
  }, !access);
}

function userModal(id) {
  const u = rows('users').find(item => item.id === id);
  const allowedRoles = Object.entries(roles).filter(([value]) => state.user?.role === 'dueno' || value !== 'dueno' || u?.role === 'dueno').map(([value, label]) => ({ value, label }));
  modal(u ? 'Editar usuario' : 'Crear usuario', `<div class="form-grid">${field('Nombre y apellido', 'name', 'text', u?.name || '', 'required maxlength="100"')}${field('Nombre de usuario', 'username', 'text', u?.username || '', 'required autocomplete="off" maxlength="60"')}${selectField('Rol de acceso', 'role', allowedRoles, u?.role || 'recepcionista')}${field(u ? 'Nueva contraseña (opcional)' : 'Contraseña', 'password', 'password', '', `${u ? '' : 'required'} minlength="8" autocomplete="new-password"`)}${check('Cuenta activa', 'active', u?.active !== false)}<p class="muted full">Usá al menos 8 caracteres. Compartí las credenciales de manera privada. No se puede desactivar al último dueño.</p></div>`, async fd => {
    const values = { ...payload(fd), active: fd.has('active') };
    if (!values.password) delete values.password;
    await save('users', u, values);
    toast('Usuario guardado.');
  }, true);
}

function renderAudit() {
  if (!canAudit()) return denied();
  const logs = byNewest(rows('audit')).filter(a => `${a.userName} ${a.action} ${typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail)}`.toLocaleLowerCase('es').includes(ui.auditSearch.toLocaleLowerCase('es')));
  return heading('Cada cambio deja una huella', 'Registro de operaciones del sistema y de las personas que las realizaron.') +
    `<div class="card"><div class="toolbar"><label class="search-field">${icon('search', 18)}<input id="audit-search" type="search" value="${esc(ui.auditSearch)}" placeholder="Buscar por usuario, acción o detalle…" aria-label="Buscar en auditoría"></label><span class="muted">${logs.length} registros</span></div>${table(['Fecha y hora', 'Usuario', 'Acción', 'Detalle'], logs.map(a => `<tr><td class="nowrap">${fullDate(a.date)}</td><td><strong>${esc(a.userName || 'Sistema')}</strong></td><td>${badge(a.action)}</td><td class="audit-detail">${esc(typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail || {}))}</td></tr>`).join(''), ui.auditSearch ? 'No hay eventos que coincidan con esa búsqueda.' : 'Las operaciones quedarán registradas automáticamente.')}</div>`;
}

export function renderModule(route) {
  const renderers = { planes: renderPlans, caja: renderCash, productos: renderProducts, ventas: renderSales, profesores: renderTeachers, clases: renderClasses, rutinas: renderRoutines, progreso: renderProgress, reportes: renderReports, configuracion: renderSettings, auditoria: renderAudit };
  return renderers[route]?.() || empty('Esta sección no está disponible.');
}

export async function handleModuleAction(action, id, element) {
  switch (action) {
    case 'module-nav': navigate(id); break;
    case 'module-print': window.print(); break;
    case 'plan-new': if (admin()) planModal(); break;
    case 'plan-edit': if (admin()) planModal(id); break;
    case 'plan-toggle': {
      if (!admin()) break;
      const p = rows('plans').find(item => item.id === id);
      if (p) confirmAction(p.active === false ? 'Activar plan' : 'Desactivar plan', p.active === false ? 'El plan volverá a estar disponible para contratar.' : 'El plan dejará de ofrecerse. Las membresías existentes conservarán su fecha de vencimiento.', async () => { await save('plans', p, { ...p, active: p.active === false }); toast('Estado del plan actualizado.'); });
      break;
    }
    case 'cash-open': if (cashier()) openCash(); break;
    case 'cash-close': if (cashier()) closeCash(); break;
    case 'cash-income': if (cashier()) movementModal('ingreso'); break;
    case 'cash-expense': if (cashier()) movementModal('gasto'); break;
    case 'product-new': if (canStock()) productModal(); break;
    case 'product-edit': if (canStock()) productModal(id); break;
    case 'product-sell': if (cashier()) addCart(id); break;
    case 'sale-add': if (cashier()) addCart(id); break;
    case 'sale-minus': if (cashier()) { if ((ui.cart[id] || 0) <= 1) delete ui.cart[id]; else ui.cart[id]--; navigate('ventas'); } break;
    case 'sale-clear': ui.cart = {}; navigate('ventas'); break;
    case 'sale-checkout': if (cashier()) await checkoutSale(element); break;
    case 'sale-void': if (admin()) voidSale(id); break;
    case 'teacher-new': if (admin()) teacherModal(); break;
    case 'teacher-edit': if (admin()) teacherModal(id); break;
    case 'class-new': if (canSchedule()) classModal(); break;
    case 'class-edit': if (canSchedule()) classModal(id); break;
    case 'class-delete': if (canSchedule()) confirmAction('Eliminar clase', 'Se cancelarán las reservas de esta clase. Esta operación queda en la auditoría.', async () => { await api(`/api/classes/${id}`, { method: 'DELETE' }); toast('Clase eliminada.'); }); break;
    case 'class-reservations': reservationModal(id); break;
    case 'class-reset': ui.classDate = ''; navigate('clases'); break;
    case 'reservation-delete': {
      if (!canReserve()) break;
      await api(`/api/reservations/${id}`, { method: 'DELETE' });
      closeModal(); await refresh(); toast('Reserva cancelada.'); break;
    }
    case 'routine-new': if (trainer()) routineModal(); break;
    case 'routine-edit': if (trainer()) routineModal(id); break;
    case 'routine-view': routineView(id); break;
    case 'routine-delete': if (trainer()) confirmAction('Eliminar rutina', 'La rutina se eliminará. Esta operación quedará registrada en la auditoría.', async () => { await api(`/api/routines/${id}`, { method: 'DELETE' }); toast('Rutina eliminada.'); }); break;
    case 'measurement-new': if (trainer()) measurementModal('', id); break;
    case 'measurement-edit': if (trainer()) measurementModal(id); break;
    case 'measurement-view': measurementView(id); break;
    case 'export': if (cashier()) exportCSV(id); break;
    case 'report-export': if (cashier()) exportCSV(ui.reportType, true); break;
    case 'report-apply': {
      const from = document.querySelector('[name="reportFrom"]')?.value;
      const to = document.querySelector('[name="reportTo"]')?.value;
      if (!from || !to || from > to) throw new Error('Ingresá un rango de fechas válido.');
      ui.reportFrom = from; ui.reportTo = to; ui.reportType = document.querySelector('[name="reportType"]')?.value || 'movements'; navigate('reportes'); break;
    }
    case 'report-period': {
      const day = today();
      ui.reportTo = day;
      if (id === 'today') ui.reportFrom = day;
      else if (id === 'year') ui.reportFrom = `${day.slice(0, 4)}-01-01`;
      else if (id === 'week') { const start = new Date(`${day}T12:00:00`); start.setDate(start.getDate() - 6); ui.reportFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`; }
      else ui.reportFrom = `${day.slice(0, 7)}-01`;
      navigate('reportes'); break;
    }
    case 'settings-edit': if (admin()) settingsModal(); break;
    case 'settings-access': if (admin()) settingsModal(true); break;
    case 'user-new': if (admin()) userModal(); break;
    case 'user-edit': if (admin()) userModal(id); break;
    case 'backup-create': {
      if (!admin()) break;
      element.disabled = true;
      try { await api('/api/backups', { method: 'POST', body: {} }); await refresh(); toast('Copia de seguridad creada.'); }
      catch (error) { element.disabled = false; throw error; }
      break;
    }
    default: return false;
  }
  return true;
}

function bindSearch(selector, key, route) {
  const input = document.querySelector(selector);
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const cursor = input.selectionStart;
      ui[key] = input.value;
      navigate(route);
      const fresh = document.querySelector(selector);
      if (fresh) { fresh.focus(); try { fresh.setSelectionRange(cursor, cursor); } catch {} }
    }, 180);
  });
}

export function afterModuleRender(route) {
  if (route === 'productos') bindSearch('#product-search', 'productSearch', route);
  if (route === 'ventas') {
    bindSearch('#sale-search', 'saleSearch', route);
    document.querySelector('[name="saleMethod"]')?.addEventListener('change', event => { ui.saleMethod = event.target.value; });
  }
  if (route === 'auditoria') bindSearch('#audit-search', 'auditSearch', route);
  if (route === 'caja') document.querySelector('#cash-period')?.addEventListener('change', event => { ui.cashPeriod = event.target.value; navigate(route); });
  if (route === 'clases') document.querySelector('#class-date')?.addEventListener('change', event => { ui.classDate = event.target.value; navigate(route); });
  if (route === 'progreso') document.querySelector('[name="progressMember"]')?.addEventListener('change', event => { ui.progressMember = event.target.value; navigate(route); });
}
