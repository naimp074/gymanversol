import { date } from '../lib/format.js';

export const messageTemplates = { recordatorio: 'Recordatorio de cuota', bienvenida: 'Bienvenida', recuperacion: 'Volver a entrenar', cumpleanos: 'Cumpleaños', promocion: 'Promociones', horario: 'Cambio de horario' };

export function messageFor(m, type, gymName) {
  const name = m.name.split(' ')[0], gym = gymName || 'Anversol Gym';
  return {
    recordatorio: `Hola ${name} 👋 Te escribimos desde ${gym}. Tu membresía ${m.days_left < 0 ? 'venció' : 'vence'} el ${date(m.expires_at)}. Podés acercarte a recepción para renovarla. ¡Te esperamos! 💪`,
    bienvenida: `¡Bienvenido/a a ${gym}, ${name}! 💪 Nos alegra acompañarte en tus objetivos. Acercate a recepción si necesitás ayuda.`,
    recuperacion: `¡Hola ${name}! En ${gym} te extrañamos. ¿Volvemos a entrenar? Escribinos y te ayudamos a retomar. 💪`,
    cumpleanos: `🎂 ¡Feliz cumpleaños, ${name}! Todo el equipo de ${gym} te desea un excelente día. ¡A seguir cumpliendo objetivos! 💪`,
    promocion: `Hola ${name} 👋 Tenemos novedades para vos en ${gym}. Consultá en recepción los planes y promociones disponibles.`,
    horario: `Hola ${name}, te escribimos de ${gym} para avisarte un cambio en los horarios. [Completá acá el nuevo horario antes de enviar].`
  }[type] || '';
}

export function openWhatsApp(phone, message) {
  const normalized = String(phone || '').replace(/\D/g, '');
  if (normalized.length < 10 || normalized.length > 15) throw new Error('Ingresá el número de WhatsApp con código de país, por ejemplo 54911…');
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}
