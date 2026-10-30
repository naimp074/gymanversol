-- Apertura de caja con saldo inicial en efectivo y en transferencia.
-- opening_amount sigue siendo el efectivo: es lo único que entra en el arqueo.
alter table public.cash_sessions
  add column opening_transfer integer not null default 0 check (opening_transfer >= 0);

-- Se reemplaza la firma vieja para no dejar dos versiones de cash_open.
drop function public.cash_open(integer);

create function public.cash_open(p_opening integer, p_opening_transfer integer default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['caja']); s public.cash_sessions;
begin
  if exists (select 1 from public.cash_sessions where closed_at is null) then raise exception 'Ya existe una caja abierta'; end if;
  if p_opening is null or p_opening < 0 or p_opening > 100000000 then raise exception 'Efectivo inicial: valor inválido'; end if;
  if p_opening_transfer is null or p_opening_transfer < 0 or p_opening_transfer > 100000000 then raise exception 'Transferencia inicial: valor inválido'; end if;
  insert into public.cash_sessions (opening_amount, opening_transfer, user_id) values (p_opening, p_opening_transfer, me.id) returning * into s;
  perform public._audit(me, 'Abrir caja', s.id::text, 'Efectivo inicial $' || s.opening_amount || ' · Transferencia inicial $' || s.opening_transfer);
  return to_jsonb(s) || jsonb_build_object('expected_amount', s.opening_amount);
end $$;

revoke execute on function public.cash_open(integer, integer) from public, anon;
grant execute on function public.cash_open(integer, integer) to authenticated;
