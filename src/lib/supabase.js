import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const domain = import.meta.env.VITE_STAFF_EMAIL_DOMAIN || 'staff.anversol.app';

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;
export const notConfiguredMessage = 'Falta configurar Supabase: completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.';

// El personal entra con nombre de usuario; Supabase Auth necesita un email.
export const staffEmail = value => {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('@') ? text : `${text}@${domain}`;
};

// Cliente aparte para crear cuentas de personal sin reemplazar la sesión actual.
export function signupClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'anversol-signup' } });
}

export function friendlyError(error) {
  const message = error?.message || '';
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'No se pudo conectar. Revisá la conexión a Internet.';
  return message || 'No se pudo completar la operación.';
}

export async function rpc(name, args) {
  if (!supabase) throw new Error(notConfiguredMessage);
  let result;
  try { result = await supabase.rpc(name, args); }
  catch (error) { throw new Error(friendlyError(error)); }
  if (result.error) {
    const error = new Error(friendlyError(result.error));
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}
