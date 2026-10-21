import { createContext, useContext, useState } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Estado de UI de cada página (filtros, búsquedas, carrito) que se conserva al navegar.
export function useUi(key) {
  const { ui } = useApp();
  const [value, setValue] = useState(ui[key]);
  return [value, next => { const resolved = typeof next === 'function' ? next(ui[key]) : next; ui[key] = resolved; setValue(resolved); }];
}

export const roleLabels = { dueno: 'Dueño', administrador: 'Administrador', recepcionista: 'Recepción', profesor: 'Profesor', contador: 'Contador' };
export const adminRoles = ['dueno', 'administrador'];
export const deskRoles = [...adminRoles, 'recepcionista'];
export const financeRoles = [...deskRoles, 'contador'];
export const allRoles = Object.keys(roleLabels);
export const methods = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito'];

export const pages = {
  inicio: { title: 'Vista general', nav: 'Vista general', sub: 'Todo lo que necesitás para acompañar a tu comunidad.', icon: 'grid', roles: allRoles },
  socios: { title: 'Socios', sub: 'Cada persona, una historia. Toda su información en un solo lugar.', icon: 'users', roles: allRoles },
  accesos: { title: 'Control de acceso', sub: 'Una bienvenida simple. Un registro de cada entrenamiento.', icon: 'door', roles: deskRoles },
  vencimientos: { title: 'Cuotas y vencimientos', nav: 'Vencimientos', sub: 'Anticipate a las renovaciones y mantené a tus socios al día.', icon: 'calendar', roles: financeRoles },
  planes: { title: 'Planes y membresías', sub: 'Una propuesta para cada forma de entrenar.', icon: 'card', roles: financeRoles },
  caja: { title: 'Caja y movimientos', nav: 'Caja y gastos', sub: 'Los números de tu gimnasio, claros y ordenados.', icon: 'wallet', roles: financeRoles },
  productos: { title: 'Productos y stock', sub: 'Controlá tus productos y anticipá las próximas reposiciones.', icon: 'box', roles: financeRoles },
  ventas: { title: 'Punto de venta', nav: 'Ventas', sub: 'Sumá productos, elegí el medio de pago y registrá la venta.', icon: 'cart', roles: financeRoles },
  profesores: { title: 'Profesores', sub: 'El equipo que hace posible cada entrenamiento.', icon: 'user', roles: [...deskRoles, 'profesor'] },
  clases: { title: 'Clases y reservas', sub: 'Organizá la agenda y encontrá un lugar para cada socio.', icon: 'calendar', roles: [...deskRoles, 'profesor'] },
  rutinas: { title: 'Rutinas', sub: 'Entrenamientos pensados para cada objetivo.', icon: 'dumbbell', roles: [...deskRoles, 'profesor'] },
  progreso: { title: 'Progreso físico', sub: 'Cada pequeño avance también cuenta.', icon: 'activity', roles: [...adminRoles, 'profesor'] },
  asistencia: { title: 'Asistencia', sub: 'Conocé los hábitos de tu comunidad y acompañá su constancia.', icon: 'chart', roles: allRoles },
  comunicaciones: { title: 'Comunicaciones', sub: 'Mensajes que acercan a tu gimnasio y a tus socios.', icon: 'message', roles: deskRoles },
  reportes: { title: 'Reportes e inteligencia', nav: 'Reportes', sub: 'Transformá tus registros en mejores decisiones.', icon: 'chart', roles: [...adminRoles, 'contador'] },
  configuracion: { title: 'Configuración', sub: 'Tu gimnasio, a tu manera.', icon: 'settings', roles: adminRoles },
  auditoria: { title: 'Registro de actividad', sub: 'Transparencia y trazabilidad en cada operación.', icon: 'shield', roles: [...adminRoles, 'contador'] }
};

export const navGroups = [
  ['PRINCIPAL', ['inicio', 'socios', 'accesos', 'vencimientos']],
  ['ADMINISTRACIÓN', ['planes', 'caja', 'productos', 'ventas']],
  ['ENTRENAMIENTO', ['profesores', 'clases', 'rutinas', 'progreso', 'asistencia']],
  ['CRECIMIENTO', ['comunicaciones', 'reportes']]
];

export function permissions(role) {
  const admin = adminRoles.includes(role);
  return {
    admin,
    desk: deskRoles.includes(role),
    finance: financeRoles.includes(role),
    trainer: admin || role === 'profesor',
    schedule: admin || role === 'profesor',
    reserve: admin || role === 'profesor' || role === 'recepcionista',
    stock: admin || role === 'contador',
    audit: admin || role === 'contador'
  };
}
