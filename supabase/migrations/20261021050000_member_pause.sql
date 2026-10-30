-- Pausa de membresía: congela los días que le quedan al socio hasta que vuelva.
-- Mientras paused_at tiene fecha, expires_at queda quieto; al reanudar se corre por los días en pausa.
alter table public.members add column paused_at date;

create or replace function public._member_json(m public.members) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(m) - 'medical_file') || jsonb_build_object(
    'has_medical_file', m.medical_file <> '',
    'status', case
      when m.state in ('suspendido', 'baja') then m.state
      when m.paused_at is not null then 'pausado'
      when m.expires_at is not null and m.expires_at >= public._today() then 'activo'
      else 'vencido' end,
    'days_left', case
      when m.expires_at is null then -1
      when m.paused_at is not null then m.expires_at - m.paused_at
      else m.expires_at - public._today() end,
    'plan_name', coalesce((select name from public.plans where id = m.plan_id), 'Sin plan'),
    'last_checkin', (select max(c.date) from public.checkins c where c.member_id = m.id and c.allowed)
  )
$$;

create function public.pause_member(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['socios']); m public.members;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Socio no encontrado'; end if;
  if m.paused_at is not null then raise exception 'La membresía ya está en pausa'; end if;
  if public._member_json(m) ->> 'status' <> 'activo' then raise exception 'Sólo se puede pausar una membresía activa'; end if;
  update public.members set paused_at = public._today() where id = m.id returning * into m;
  perform public._audit(me, 'Pausar membresía', m.id::text, m.name || ' · quedan ' || (m.expires_at - m.paused_at) || ' días');
  return public._safe_member(m, me.role);
end $$;

create function public.resume_member(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['socios']); m public.members; v_days integer;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Socio no encontrado'; end if;
  if m.paused_at is null then raise exception 'La membresía no está en pausa'; end if;
  v_days := public._today() - m.paused_at;
  update public.members set expires_at = expires_at + v_days, paused_at = null where id = m.id returning * into m;
  -- El último pago cubre ahora hasta la nueva fecha: si no, la próxima renovación figuraría como atrasada.
  update public.payments set expires_at = expires_at + v_days
  where id = (select id from public.payments where member_id = m.id order by date desc limit 1);
  perform public._audit(me, 'Reanudar membresía', m.id::text, m.name || ' · ' || v_days || ' días en pausa · vence ' || m.expires_at);
  return public._safe_member(m, me.role);
end $$;

revoke execute on function public.pause_member(uuid), public.resume_member(uuid) from public, anon;
grant execute on function public.pause_member(uuid), public.resume_member(uuid) to authenticated;

-- register_payment: no se cobra sobre una membresía en pausa
create or replace function public.register_payment(p_member uuid, p_plan uuid, p_method text, p_discount numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['socios', 'vencimientos', 'accesos']);
  m public.members; pl public.plans; s public.cash_sessions; pay public.payments;
  v_discount numeric := coalesce(p_discount, 0); v_amount integer; v_base date; v_expires date;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Socio no encontrado'; end if;
  if m.state = 'baja' then raise exception 'Reactivá al socio antes de cobrar una cuota'; end if;
  if m.paused_at is not null then raise exception 'Reanudá la membresía antes de cobrar una cuota'; end if;
  select * into pl from public.plans where id = p_plan;
  if not found then raise exception 'Plan no encontrado'; end if;
  if not pl.active then raise exception 'El plan está desactivado'; end if;
  perform public._check_method(p_method);
  if v_discount < 0 or v_discount > 100 then raise exception 'Descuento: valor inválido'; end if;
  if v_discount > 0 and me.role not in ('dueno', 'administrador') then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  s := public._open_session();
  v_amount := round(pl.price * (1 - pl.discount / 100) * (1 - v_discount / 100));
  v_base := case when m.expires_at is not null and m.expires_at > public._today() then m.expires_at else public._today() end;
  v_expires := v_base + pl.duration;
  insert into public.payments (member_id, plan_id, amount, discount, plan_discount, method, expires_at, user_id, session_id)
  values (m.id, pl.id, v_amount, v_discount, pl.discount, p_method, v_expires, me.id, s.id) returning * into pay;
  update public.members set plan_id = pl.id, expires_at = v_expires, last_payment = pay.date where id = m.id returning * into m;
  insert into public.movements (type, category, description, amount, method, session_id, user_id, payment_id)
  select 'ingreso', 'Cuotas', 'Cuota ' || pl.name || ' · ' || m.name, v_amount, p_method, s.id, me.id, pay.id
  where v_amount > 0;
  perform public._audit(me, 'Cobrar cuota', pay.id::text, m.name || ' · $' || v_amount || ' · ' || p_method);
  return jsonb_build_object('payment', to_jsonb(pay), 'member', public._safe_member(m, me.role));
end $$;

-- register_checkin: una membresía en pausa no habilita el ingreso
create or replace function public.register_checkin(p_identifier text, p_method text default 'manual', p_override boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['accesos']);
  v_ident text := btrim(coalesce(p_identifier, ''));
  v_override boolean := coalesce(p_override, false);
  m public.members; pl public.plans; cfg public.settings; c public.checkins;
  v_allowed boolean := true; v_reason text := 'Ingreso permitido'; v_status text; v_time text := public._local_time(); v_since date;
begin
  if v_ident = '' then raise exception 'Identificación es obligatorio'; end if;
  if length(v_ident) > 250 then raise exception 'Identificación: máximo 250 caracteres'; end if;
  if p_method is null or p_method not in ('manual', 'qr') then raise exception 'Método: opción inválida'; end if;

  if p_method = 'qr' then
    select * into m from public.members where qr_token = v_ident for update;
  else
    select * into m from public.members
    where id::text = v_ident or dni = v_ident or number = v_ident
    order by (id::text = v_ident) desc, (dni = v_ident) desc limit 1 for update;
  end if;
  if not found then raise exception 'No se encontró un socio con esa identificación'; end if;

  select * into pl from public.plans where id = m.plan_id;
  select * into cfg from public.settings where id = 1;
  v_status := public._member_json(m) ->> 'status';

  if m.state = 'suspendido' then v_allowed := false; v_reason := 'Socio suspendido';
  elsif m.state = 'baja' then v_allowed := false; v_reason := 'Socio dado de baja';
  elsif m.paused_at is not null then v_allowed := false; v_reason := 'Membresía en pausa';
  elsif pl.id is null then v_allowed := false; v_reason := 'El socio no tiene un plan asignado';
  elsif v_status = 'vencido' and not cfg.allow_expired_entry and not (v_override and cfg.allow_expired_override) then
    v_allowed := false; v_reason := 'Cuota vencida';
  elsif cfg.require_medical and (m.medical_expires_at is null or m.medical_expires_at < public._today()) then
    v_allowed := false; v_reason := 'Certificado médico vencido o pendiente';
  elsif pl.start_time > v_time or pl.end_time < v_time then
    v_allowed := false; v_reason := 'Fuera del horario permitido por el plan';
  else
    if pl.access_limit > 0 then
      v_since := coalesce(public._local_date(m.last_payment), m.expires_at - pl.duration, public._today());
      if (select count(*) from public.checkins where member_id = m.id and allowed and public._local_date(date) >= v_since) >= pl.access_limit then
        v_allowed := false; v_reason := 'Se alcanzó el límite de accesos del plan';
      end if;
    end if;
    if v_allowed and exists (select 1 from public.checkins where member_id = m.id and allowed and checkout_at is null) then
      v_allowed := false; v_reason := 'El socio ya tiene un ingreso abierto';
    end if;
  end if;

  if v_allowed and v_status = 'vencido' then
    v_reason := case when v_override then 'Ingreso autorizado con cuota vencida' else 'Ingreso permitido con cuota vencida' end;
  end if;
  insert into public.checkins (member_id, allowed, reason, method, user_id, override)
  values (m.id, v_allowed, v_reason, p_method, me.id, v_allowed and v_override) returning * into c;
  perform public._audit(me, case when v_allowed then 'Registrar ingreso' else 'Ingreso rechazado' end, c.id::text, m.name || ': ' || v_reason);
  return jsonb_build_object('checkin', to_jsonb(c), 'member', public._safe_member(m, me.role), 'allowed', v_allowed, 'reason', v_reason);
end $$;
