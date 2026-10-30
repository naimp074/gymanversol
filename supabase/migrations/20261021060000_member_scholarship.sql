-- Socios becados: no pagan cuota ni vencen. Sólo administración puede otorgar o quitar la beca.
-- expires_at no se toca: si se quita la beca, el socio vuelve al vencimiento que tenía.
alter table public.members add column becado boolean not null default false;

create or replace function public._member_json(m public.members) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(m) - 'medical_file') || jsonb_build_object(
    'has_medical_file', m.medical_file <> '',
    'status', case
      when m.state in ('suspendido', 'baja') then m.state
      when m.paused_at is not null then 'pausado'
      when m.becado then 'becado'
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

-- save_member: la beca sólo la cambia administración
create or replace function public.save_member(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['socios']); r public.members; d jsonb; old_expires date; old_becado boolean := false;
begin
  if p_id is not null then
    select * into r from public.members where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
    old_expires := r.expires_at;
    old_becado := r.becado;
  else
    d := coalesce(p, '{}'::jsonb);
  end if;

  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.dni := public._txt(d, 'dni', 'DNI', true, 20);
  if r.dni !~ '^[0-9]{5,12}$' then raise exception 'El DNI debe tener entre 5 y 12 dígitos'; end if;
  if exists (select 1 from public.members where dni = r.dni and id is distinct from p_id) then
    raise exception 'Ya existe un socio con ese DNI';
  end if;
  r.phone := public._txt(d, 'phone', 'Teléfono', false, 40);
  r.whatsapp := public._txt(d, 'whatsapp', 'WhatsApp', false, 40);
  r.emergency_phone := public._txt(d, 'emergency_phone', 'Teléfono de emergencia', false, 40);
  r.email := public._txt(d, 'email', 'Email', false, 250);
  if r.email <> '' and r.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email inválido'; end if;
  r.address := public._txt(d, 'address', 'Dirección', false, 250);
  r.emergency_name := public._txt(d, 'emergency_name', 'Contacto de emergencia', false, 250);
  r.medical_file_name := public._txt(d, 'medical_file_name', 'Nombre del certificado', false, 250);
  r.notes := public._txt(d, 'notes', 'Observaciones', false, 5000);
  r.birth_date := public._date(d, 'birth_date', 'Fecha de nacimiento');
  if r.birth_date > public._today() then raise exception 'La fecha de nacimiento no puede ser futura'; end if;
  r.joined_at := coalesce(public._date(d, 'joined_at', 'Fecha de alta'), public._today());
  r.expires_at := public._date(d, 'expires_at', 'Vencimiento');
  r.medical_expires_at := public._date(d, 'medical_expires_at', 'Vencimiento del apto físico');
  r.state := coalesce(nullif(d ->> 'state', ''), 'activo');
  if r.state not in ('activo', 'suspendido', 'baja') then raise exception 'Estado: opción inválida'; end if;
  r.plan_id := public._ref(d, 'plan_id', 'plans', 'Plan', false);
  r.photo := public._attachment(d ->> 'photo', 'Foto', false);
  r.medical_file := public._attachment(d ->> 'medical_file', 'Certificado médico', true);
  r.becado := coalesce(d ->> 'becado', 'false') = 'true';
  if me.role not in ('dueno', 'administrador') and r.expires_at is distinct from old_expires then
    raise exception 'Sólo administración puede modificar el vencimiento sin un cobro' using errcode = '42501';
  end if;
  if me.role not in ('dueno', 'administrador') and r.becado is distinct from old_becado then
    raise exception 'Sólo administración puede otorgar o quitar una beca' using errcode = '42501';
  end if;
  if r.becado and r.paused_at is not null then raise exception 'Reanudá la membresía antes de otorgar la beca'; end if;

  if p_id is null then
    insert into public.members (name, dni, birth_date, phone, whatsapp, email, address, photo, joined_at, state, plan_id,
      expires_at, notes, emergency_name, emergency_phone, medical_expires_at, medical_file, medical_file_name, becado)
    values (r.name, r.dni, r.birth_date, r.phone, r.whatsapp, r.email, r.address, r.photo, r.joined_at, r.state, r.plan_id,
      r.expires_at, r.notes, r.emergency_name, r.emergency_phone, r.medical_expires_at, r.medical_file, r.medical_file_name, r.becado)
    returning * into r;
  else
    update public.members set name = r.name, dni = r.dni, birth_date = r.birth_date, phone = r.phone, whatsapp = r.whatsapp,
      email = r.email, address = r.address, photo = r.photo, joined_at = r.joined_at, state = r.state, plan_id = r.plan_id,
      expires_at = r.expires_at, notes = r.notes, emergency_name = r.emergency_name, emergency_phone = r.emergency_phone,
      medical_expires_at = r.medical_expires_at, medical_file = r.medical_file, medical_file_name = r.medical_file_name, becado = r.becado
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear socio' else 'Actualizar socio' end, r.id::text, r.name);
  if r.becado is distinct from old_becado then
    perform public._audit(me, case when r.becado then 'Otorgar beca' else 'Quitar beca' end, r.id::text, r.name);
  end if;
  return public._safe_member(r, me.role);
end $$;

-- register_payment: a un socio becado no se le cobra cuota
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
  if m.becado then raise exception 'El socio está becado: no se le cobra cuota'; end if;
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

-- register_checkin: un socio becado puede ingresar sin plan asignado
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
  elsif pl.id is null and not m.becado then v_allowed := false; v_reason := 'El socio no tiene un plan asignado';
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

-- create_reservation: un socio becado reserva sin cuota vigente
create or replace function public.create_reservation(p_class uuid, p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['clases']); c public.classes; m public.members; r public.reservations;
begin
  select * into c from public.classes where id = p_class for update;
  if not found then raise exception 'Clase no encontrada'; end if;
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  if public._member_json(m) ->> 'status' not in ('activo', 'becado') then raise exception 'El socio necesita una cuota activa para reservar'; end if;
  if not (c.date > public._today() or (c.date = public._today() and c.time > public._local_time())) then
    raise exception 'No se pueden reservar clases que ya comenzaron';
  end if;
  if not m.becado and m.expires_at is not null and m.expires_at < c.date then raise exception 'La cuota del socio vence antes de la clase'; end if;
  if exists (select 1 from public.reservations where class_id = c.id and member_id = m.id) then raise exception 'El socio ya reservó esta clase'; end if;
  if (select count(*) from public.reservations where class_id = c.id) >= c.capacity then raise exception 'La clase no tiene cupos disponibles'; end if;
  insert into public.reservations (class_id, member_id) values (c.id, m.id) returning * into r;
  perform public._audit(me, 'Reservar clase', r.id::text, m.name || ' · ' || c.name);
  return to_jsonb(r);
end $$;
