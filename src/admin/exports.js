import { downloadCsv } from '../lib/csv.js';
import { rpc } from '../lib/supabase.js';
import { localDay } from '../lib/format.js';

// Genera los mismos CSV que la versión anterior a partir de los datos ya cargados.
export function exportCsv({ data, toast }, type, range = null) {
  const memberName = id => data.members.find(m => m.id === id)?.name || '';
  const planName = id => data.plans.find(p => p.id === id)?.name || '';
  const inRange = item => {
    if (!range) return true;
    const day = localDay(item.date || item.created_at);
    return day >= range.from && day <= range.to;
  };
  const sources = { members: data.members, payments: data.payments, movements: data.movements, checkins: data.checkins, products: data.products, sales: data.sales };
  const list = (sources[type] || []).filter(item => ['members', 'products'].includes(type) || inRange(item));
  let headers, rows;
  if (type === 'members') { headers = ['Número', 'Nombre', 'DNI', 'Teléfono', 'Email', 'Estado', 'Plan', 'Vencimiento']; rows = list.map(m => [m.number, m.name, m.dni, m.phone, m.email, m.status, m.plan_name, m.expires_at]); }
  if (type === 'payments') { headers = ['Fecha', 'Socio', 'Plan', 'Importe', 'Medio de pago', 'Vencimiento']; rows = list.map(p => [p.date, memberName(p.member_id), planName(p.plan_id), p.amount, p.method, p.expires_at]); }
  if (type === 'movements') { headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Importe', 'Medio de pago', 'Caja']; rows = list.map(m => [m.date, m.type, m.category, m.description, m.amount, m.method, m.session_id]); }
  if (type === 'checkins') { headers = ['Fecha', 'Socio', 'Permitido', 'Motivo', 'Método', 'Salida']; rows = list.map(c => [c.date, memberName(c.member_id), c.allowed ? 'Sí' : 'No', c.reason, c.method, c.checkout_at]); }
  if (type === 'products') { headers = ['Nombre', 'Categoría', 'Precio', 'Costo', 'Stock', 'Stock mínimo', 'Activo']; rows = list.map(p => [p.name, p.category, p.price, p.cost, p.stock, p.min_stock, p.active ? 'Sí' : 'No']); }
  if (type === 'sales') { headers = ['Fecha', 'Productos', 'Total', 'Medio de pago', 'Anulada']; rows = list.map(s => [s.date, s.items.map(i => `${i.quantity} × ${i.name}`).join(', '), s.total, s.method, s.voided ? 'Sí' : 'No']); }
  if (!headers) { toast?.('Tipo de exportación inválido', 'error'); return; }
  downloadCsv(`${type}-${data.today}.csv`, headers, rows);
  rpc('log_action', { p_action: 'Exportar CSV', p_entity: type, p_detail: `${rows.length} registros` }).catch(() => {});
}
