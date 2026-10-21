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
  finanzas: { title: 'Finanzas', nav: 'Finanzas y gráficos', sub: 'Cuánto entra, cuánto sale y de dónde viene la plata.', icon: 'trending-up', roles: [...adminRoles, 'contador'] },
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
  ['ADMINISTRACIÓN', ['planes', 'caja', 'finanzas', 'productos', 'ventas']],
  ['ENTRENAMIENTO', ['profesores', 'clases', 'rutinas', 'progreso', 'asistencia']],
  ['CRECIMIENTO', ['comunicaciones', 'reportes']]
];

// Apartados que permite cada rol: el máximo que el dueño puede habilitarle a un usuario.
export const roleSections = role => Object.keys(pages).filter(key => pages[key].roles.includes(role));
// Apartados que el usuario ve (la base ya los calcula: rol ∩ elegidos por el dueño).
export const canSee = (user, route) => Boolean(user?.sections?.includes(route));

// Qué puede hacer el usuario: su rol lo habilita y el apartado correspondiente tiene que estar visible.
export function permissions(user) {
  const role = user?.role;
  const any = (...keys) => keys.some(key => canSee(user, key));
  const admin = adminRoles.includes(role);
  return {
    admin,
    desk: deskRoles.includes(role) && any('socios'),
    pay: financeRoles.includes(role) && any('socios', 'vencimientos', 'accesos'),
    checkin: deskRoles.includes(role) && any('accesos'),
    finance: financeRoles.includes(role) && any('vencimientos', 'caja', 'finanzas', 'reportes'),
    financeRole: financeRoles.includes(role),
    trainer: admin || role === 'profesor',
    schedule: (admin || role === 'profesor') && any('clases'),
    reserve: (admin || role === 'profesor' || role === 'recepcionista') && any('clases'),
    stock: (admin || role === 'contador') && any('productos'),
    audit: admin || role === 'contador'
  };
}
