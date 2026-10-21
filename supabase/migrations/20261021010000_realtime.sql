-- Anversol Gym · avisos en tiempo real
--
-- Las tablas de datos no son legibles desde el navegador, así que Realtime no
-- puede transmitirlas directamente. En su lugar, cada cambio actualiza una fila
-- en realtime_signals (sólo nombre de tabla y hora, sin datos) y las pantallas
-- abiertas vuelven a pedir la información por las funciones habituales.

create table public.realtime_signals (
  table_name text primary key,
  changed_at timestamptz not null default now()
);

alter table public.realtime_signals enable row level security;
create policy "avisos visibles" on public.realtime_signals for select to anon, authenticated using (true);
grant select on public.realtime_signals to anon, authenticated;
revoke insert, update, delete on public.realtime_signals from anon, authenticated;

create or replace function public._signal_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.realtime_signals (table_name, changed_at) values (tg_table_name, now())
  on conflict (table_name) do update set changed_at = excluded.changed_at;
  return null;
end $$;
revoke execute on function public._signal_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['settings', 'profiles', 'plans', 'members', 'teachers', 'classes', 'reservations', 'routines',
                           'measurements', 'products', 'cash_sessions', 'payments', 'sales', 'movements', 'checkins'] loop
    execute format('create trigger signal_change after insert or update or delete on public.%I for each statement execute function public._signal_change()', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.realtime_signals;
