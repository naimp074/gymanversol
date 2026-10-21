import { supabase } from './supabase.js';

let channelCount = 0;

// Avisa cuando cambian datos en Supabase (desde esta u otra pantalla, o desde el panel de Supabase).
// tables: lista de tablas que interesan; vacío = todas. Agrupa ráfagas de cambios en una sola llamada.
export function subscribeChanges(onChange, { tables = [], delay = 400 } = {}) {
  if (!supabase) return () => {};
  let timer;
  const channel = supabase
    .channel(`anversol-cambios-${++channelCount}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'realtime_signals' }, payload => {
      const table = payload.new?.table_name || payload.old?.table_name;
      if (tables.length && !tables.includes(table)) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, delay);
    })
    .subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}
