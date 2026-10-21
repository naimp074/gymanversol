-- Anversol Gym · apartados visibles por usuario
--
-- El rol define el máximo de lo que una persona puede hacer; dentro de eso, el
-- dueño elige qué apartados ve cada usuario. profiles.sections = null significa
-- "todos los de su rol" (así los usuarios existentes no cambian). El dueño ve todo.
-- La base controla los apartados en cada operación y en los datos que entrega,
-- no sólo el menú.

alter table public.profiles add column sections text[];

-- Apartados que permite cada rol (mismo criterio que el menú de la aplicación).
create or replace function public._role_sections(p_role text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(s order by o), '{}') from (values
    (1, 'inicio', '{dueno,administrador,recepcionista,profesor,contador}'),
    (2, 'socios', '{dueno,administrador,recepcionista,profesor,contador}'),
    (3, 'accesos', '{dueno,administrador,recepcionista}'),
    (4, 'vencimientos', '{dueno,administrador,recepcionista,contador}'),
    (5, 'planes', '{dueno,administrador,recepcionista,contador}'),
    (6, 'caja', '{dueno,administrador,recepcionista,contador}'),
    (7, 'finanzas', '{dueno,administrador,contador}'),
    (8, 'productos', '{dueno,administrador,recepcionista,contador}'),
    (9, 'ventas', '{dueno,administrador,recepcionista,contador}'),
    (10, 'profesores', '{dueno,administrador,recepcionista,profesor}'),
    (11, 'clases', '{dueno,administrador,recepcionista,profesor}'),
    (12, 'rutinas', '{dueno,administrador,recepcionista,profesor}'),
    (13, 'progreso', '{dueno,administrador,profesor}'),
    (14, 'asistencia', '{dueno,administrador,recepcionista,profesor,contador}'),
    (15, 'comunicaciones', '{dueno,administrador,recepcionista}'),
    (16, 'reportes', '{dueno,administrador,contador}'),
    (17, 'configuracion', '{dueno,administrador}'),
    (18, 'auditoria', '{dueno,administrador,contador}')
  ) v(o, s, roles) where p_role = any (roles::text[])
$$;

-- Apartados efectivos: los elegidos, siempre dentro de los del rol.
create or replace function public._sections(p public.profiles) returns text[]
language sql immutable as $$
  select case
    when p.role = 'dueno' or p.sections is null then public._role_sections(p.role)
    else array(select s from unnest(public._role_sections(p.role)) s where s = any (p.sections) or s = 'inicio')
  end
$$;

create or replace function public._require_in(p_roles text[], p_sections text[]) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles := public._require(p_roles);
begin
  if not (public._sections(p) && p_sections) then
    raise exception 'No tenés acceso a esta sección' using errcode = '42501';
  end if;
  return p;
end $$;

-- save_member: además del rol, exige socios
create or replace function public.save_member(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['socios']); r public.members; d jsonb; old_expires date;
begin
  if p_id is not null then
    select * into r from public.members where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
    old_expires := r.expires_at;
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
  if me.role not in ('dueno', 'administrador') and r.expires_at is distinct from old_expires then
    raise exception 'Sólo administración puede modificar el vencimiento sin un cobro' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.members (name, dni, birth_date, phone, whatsapp, email, address, photo, joined_at, state, plan_id,
      expires_at, notes, emergency_name, emergency_phone, medical_expires_at, medical_file, medical_file_name)
    values (r.name, r.dni, r.birth_date, r.phone, r.whatsapp, r.email, r.address, r.photo, r.joined_at, r.state, r.plan_id,
      r.expires_at, r.notes, r.emergency_name, r.emergency_phone, r.medical_expires_at, r.medical_file, r.medical_file_name)
    returning * into r;
  else
    update public.members set name = r.name, dni = r.dni, birth_date = r.birth_date, phone = r.phone, whatsapp = r.whatsapp,
      email = r.email, address = r.address, photo = r.photo, joined_at = r.joined_at, state = r.state, plan_id = r.plan_id,
      expires_at = r.expires_at, notes = r.notes, emergency_name = r.emergency_name, emergency_phone = r.emergency_phone,
      medical_expires_at = r.medical_expires_at, medical_file = r.medical_file, medical_file_name = r.medical_file_name
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear socio' else 'Actualizar socio' end, r.id::text, r.name);
  return public._safe_member(r, me.role);
end $$;

-- member_medical_file: además del rol, exige socios
create or replace function public.member_medical_file(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['socios']); m public.members;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  return jsonb_build_object('file', m.medical_file, 'name', m.medical_file_name);
end $$;

-- measurement_photo: además del rol, exige progreso o socios
create or replace function public.measurement_photo(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['progreso', 'socios']);
begin
  return (select photo from public.measurements where id = p_id);
end $$;

-- save_plan: además del rol, exige planes
create or replace function public.save_plan(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['planes']); r public.plans; d jsonb;
begin
  if p_id is not null then
    select * into r from public.plans where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.description := public._txt(d, 'description', 'Descripción', false, 2000);
  r.price := public._num(d, 'price', 'Precio');
  r.duration := public._num(d, 'duration', 'Duración', 1, 3650);
  r.access_limit := public._num(d, 'access_limit', 'Límite de accesos', 0, 10000, true, false, 0);
  r.discount := public._num(d, 'discount', 'Descuento', 0, 100, false, false, 0);
  r.start_time := public._time(d, 'start_time', 'Horario inicial', '06:00');
  r.end_time := public._time(d, 'end_time', 'Horario final', '23:00');
  if r.start_time >= r.end_time then raise exception 'La hora final debe ser posterior a la inicial'; end if;
  r.active := public._bool(d, 'active', true);
  if p_id is null then
    insert into public.plans (name, description, price, duration, access_limit, discount, start_time, end_time, active)
    values (r.name, r.description, r.price, r.duration, r.access_limit, r.discount, r.start_time, r.end_time, r.active)
    returning * into r;
  else
    update public.plans set name = r.name, description = r.description, price = r.price, duration = r.duration,
      access_limit = r.access_limit, discount = r.discount, start_time = r.start_time, end_time = r.end_time, active = r.active
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear plan' else 'Actualizar plan' end, r.id::text, r.name);
  return to_jsonb(r);
end $$;

-- save_product: además del rol, exige productos
create or replace function public.save_product(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'contador'], array['productos']); r public.products; d jsonb;
begin
  if p_id is not null then
    select * into r from public.products where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.category := public._txt(d, 'category', 'Categoría', false, 100);
  r.price := public._num(d, 'price', 'Precio');
  r.cost := public._num(d, 'cost', 'Costo', 0, 100000000, true, false, 0);
  r.stock := public._num(d, 'stock', 'Stock', 0, 1000000, true, false, 0);
  r.min_stock := public._num(d, 'min_stock', 'Stock mínimo', 0, 1000000, true, false, 0);
  r.active := public._bool(d, 'active', true);
  if p_id is null then
    insert into public.products (name, category, price, cost, stock, min_stock, active)
    values (r.name, r.category, r.price, r.cost, r.stock, r.min_stock, r.active) returning * into r;
  else
    update public.products set name = r.name, category = r.category, price = r.price, cost = r.cost,
      stock = r.stock, min_stock = r.min_stock, active = r.active
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear producto' else 'Actualizar producto' end, r.id::text,
    r.name || ' · stock ' || r.stock);
  return to_jsonb(r);
end $$;

-- save_teacher: además del rol, exige profesores
create or replace function public.save_teacher(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['profesores']); r public.teachers; d jsonb;
begin
  if p_id is not null then
    select * into r from public.teachers where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.phone := public._txt(d, 'phone', 'Teléfono', false, 40);
  r.specialty := public._txt(d, 'specialty', 'Especialidad', false, 250);
  r.schedule := public._txt(d, 'schedule', 'Horarios', false, 2000);
  r.salary := public._num(d, 'salary', 'Sueldo', 0, 100000000, true, false, 0);
  r.state := coalesce(nullif(d ->> 'state', ''), 'activo');
  if r.state not in ('activo', 'inactivo') then raise exception 'Estado: opción inválida'; end if;
  if p_id is null then
    insert into public.teachers (name, phone, specialty, schedule, salary, state)
    values (r.name, r.phone, r.specialty, r.schedule, r.salary, r.state) returning * into r;
  else
    update public.teachers set name = r.name, phone = r.phone, specialty = r.specialty, schedule = r.schedule,
      salary = r.salary, state = r.state
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear profesor' else 'Actualizar profesor' end, r.id::text, r.name);
  return to_jsonb(r);
end $$;

-- save_class: además del rol, exige clases
create or replace function public.save_class(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor'], array['clases']); r public.classes; d jsonb;
begin
  if p_id is not null then
    select * into r from public.classes where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.description := public._txt(d, 'description', 'Descripción', false, 2000);
  r.teacher_id := public._ref(d, 'teacher_id', 'teachers', 'Profesor', false);
  r.date := public._date(d, 'date', 'Fecha', true);
  r.time := public._time(d, 'time', 'Hora', '09:00');
  r.duration := public._num(d, 'duration', 'Duración', 1, 1440, true, false, 60);
  r.capacity := public._num(d, 'capacity', 'Cupo', 1, 10000, true, false, 20);
  if p_id is not null and (select count(*) from public.reservations where class_id = p_id) > r.capacity then
    raise exception 'El cupo no puede ser inferior a las reservas existentes';
  end if;
  if p_id is null then
    insert into public.classes (name, description, teacher_id, date, time, duration, capacity)
    values (r.name, r.description, r.teacher_id, r.date, r.time, r.duration, r.capacity) returning * into r;
  else
    update public.classes set name = r.name, description = r.description, teacher_id = r.teacher_id, date = r.date,
      time = r.time, duration = r.duration, capacity = r.capacity
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear clase' else 'Actualizar clase' end, r.id::text, r.name);
  return to_jsonb(r);
end $$;

-- save_routine: además del rol, exige rutinas
create or replace function public.save_routine(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['rutinas']); r public.routines; d jsonb;
begin
  if p_id is not null then
    select * into r from public.routines where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.member_id := public._ref(d, 'member_id', 'members', 'Socio');
  r.teacher_id := public._ref(d, 'teacher_id', 'teachers', 'Profesor', false);
  r.name := public._txt(d, 'name', 'Nombre', true, 150);
  r.goal := public._txt(d, 'goal', 'Objetivo', false, 1000);
  r.days := public._txt(d, 'days', 'Ejercicios', true, 15000);
  r.notes := public._txt(d, 'notes', 'Indicaciones', false, 5000);
  if p_id is null then
    insert into public.routines (member_id, teacher_id, name, goal, days, notes)
    values (r.member_id, r.teacher_id, r.name, r.goal, r.days, r.notes) returning * into r;
  else
    update public.routines set member_id = r.member_id, teacher_id = r.teacher_id, name = r.name, goal = r.goal,
      days = r.days, notes = r.notes
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Crear rutina' else 'Actualizar rutina' end, r.id::text, r.name);
  return to_jsonb(r);
end $$;

-- save_measurement: además del rol, exige progreso
create or replace function public.save_measurement(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['progreso']); r public.measurements; d jsonb;
begin
  if p_id is not null then
    select * into r from public.measurements where id = p_id for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    d := to_jsonb(r) || coalesce(p, '{}'::jsonb);
  else
    d := coalesce(p, '{}'::jsonb);
  end if;
  r.member_id := public._ref(d, 'member_id', 'members', 'Socio');
  r.date := public._date(d, 'date', 'Fecha', true);
  r.notes := public._txt(d, 'notes', 'Observaciones', false, 3000);
  r.photo := public._attachment(d ->> 'photo', 'Foto', false);
  r.weight := public._num(d, 'weight', 'Peso', 0, 1000, false, true);
  r.height := public._num(d, 'height', 'Altura', 0, 1000, false, true);
  r.waist := public._num(d, 'waist', 'Cintura', 0, 1000, false, true);
  r.arm := public._num(d, 'arm', 'Brazo', 0, 1000, false, true);
  r.chest := public._num(d, 'chest', 'Pecho', 0, 1000, false, true);
  r.leg := public._num(d, 'leg', 'Pierna', 0, 1000, false, true);
  r.body_fat := public._num(d, 'body_fat', 'Grasa corporal', 0, 100, false, true);
  if coalesce(r.weight, r.height, r.waist, r.arm, r.chest, r.leg, r.body_fat) is null and r.photo = '' then
    raise exception 'Completá al menos una medida o una foto';
  end if;
  if p_id is null then
    insert into public.measurements (member_id, date, notes, photo, weight, height, waist, arm, chest, leg, body_fat)
    values (r.member_id, r.date, r.notes, r.photo, r.weight, r.height, r.waist, r.arm, r.chest, r.leg, r.body_fat)
    returning * into r;
  else
    update public.measurements set member_id = r.member_id, date = r.date, notes = r.notes, photo = r.photo,
      weight = r.weight, height = r.height, waist = r.waist, arm = r.arm, chest = r.chest, leg = r.leg, body_fat = r.body_fat
    where id = p_id returning * into r;
  end if;
  perform public._audit(me, case when p_id is null then 'Registrar medición' else 'Actualizar medición' end, r.id::text, r.date::text);
  return (to_jsonb(r) - 'photo') || jsonb_build_object('has_photo', r.photo <> '');
end $$;

-- update_settings: además del rol, exige configuracion
create or replace function public.update_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['configuracion']); d jsonb; s public.settings;
begin
  select to_jsonb(x) || coalesce(p, '{}'::jsonb) into d from public.settings x where id = 1;
  update public.settings set
    gym_name = public._txt(d, 'gym_name', 'Nombre del gimnasio', true, 250),
    address = public._txt(d, 'address', 'Dirección', false, 250),
    phone = public._txt(d, 'phone', 'Teléfono', false, 40),
    tagline = public._txt(d, 'tagline', 'Frase principal', false, 160),
    about = public._txt(d, 'about', 'Quiénes somos', false, 2000),
    hours = public._txt(d, 'hours', 'Horarios', false, 300),
    whatsapp = public._txt(d, 'whatsapp', 'WhatsApp', false, 40),
    instagram = public._txt(d, 'instagram', 'Instagram', false, 120),
    email = public._txt(d, 'email', 'Email', false, 250),
    allow_expired_entry = public._bool(d, 'allow_expired_entry', false),
    allow_expired_override = public._bool(d, 'allow_expired_override', false),
    require_medical = public._bool(d, 'require_medical', false),
    updated_at = now()
  where id = 1 returning * into s;
  if s.email <> '' and s.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email inválido'; end if;
  perform public._audit(me, 'Actualizar configuración');
  return to_jsonb(s);
end $$;

-- create_staff_invite: además del rol, exige configuracion
create or replace function public.create_staff_invite(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require_in(array['dueno', 'administrador'], array['configuracion']);
  v_name text := public._txt(p, 'name', 'Nombre', true, 120);
  v_username text := lower(public._txt(p, 'username', 'Usuario', true, 60));
  v_email text := lower(public._txt(p, 'email', 'Email', true, 250));
  v_role text := p ->> 'role';
begin
  if v_username !~ '^[a-z0-9_.-]{3,60}$' then
    raise exception 'El usuario requiere 3 a 60 letras, números, puntos o guiones';
  end if;
  if v_role is null or v_role not in ('dueno', 'administrador', 'recepcionista', 'profesor', 'contador') then
    raise exception 'Rol: opción inválida';
  end if;
  if v_role = 'dueno' and me.role <> 'dueno' then
    raise exception 'Sólo el dueño puede gestionar otros dueños' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where username = v_username or email = v_email) then
    raise exception 'Ese nombre de usuario ya existe';
  end if;
  insert into public.staff_invites (email, username, name, role, created_by)
  values (v_email, v_username, v_name, v_role, me.id)
  on conflict (email) do update set username = excluded.username, name = excluded.name, role = excluded.role,
    created_by = excluded.created_by, created_at = now();
  perform public._audit(me, 'Crear usuario', v_username, v_name || ' · ' || v_role);
  return jsonb_build_object('email', v_email);
end $$;

-- admin_set_password: además del rol, exige configuracion
create or replace function public.admin_set_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['configuracion']); target public.profiles;
begin
  select * into target from public.profiles where id = p_user;
  if not found then raise exception 'Registro no encontrado'; end if;
  if me.role <> 'dueno' and target.role = 'dueno' then
    raise exception 'Sólo el dueño puede gestionar otros dueños' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 8 or length(p_password) > 200 then
    raise exception 'La contraseña debe tener entre 8 y 200 caracteres';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  perform public._audit(me, 'Cambiar contraseña de usuario', target.id::text, target.name);
  return jsonb_build_object('ok', true);
end $$;

-- export_backup: además del rol, exige configuracion
create or replace function public.export_backup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['configuracion']);
begin
  perform public._audit(me, 'Descargar respaldo');
  return jsonb_build_object(
    'version', 1, 'exported_at', now(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from public.profiles x), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(x)) from public.plans x), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(x)) from public.members x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from public.teachers x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from public.classes x), '[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(to_jsonb(x)) from public.reservations x), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(to_jsonb(x)) from public.routines x), '[]'::jsonb),
    'measurements', coalesce((select jsonb_agg(to_jsonb(x)) from public.measurements x), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(x)) from public.products x), '[]'::jsonb),
    'cash_sessions', coalesce((select jsonb_agg(to_jsonb(x)) from public.cash_sessions x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(x)) from public.payments x), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(x)) from public.sales x), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(to_jsonb(x)) from public.movements x), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(x)) from public.checkins x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from public.audit_log x), '[]'::jsonb)
  );
end $$;

-- register_payment: además del rol, exige socios o vencimientos o accesos
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

-- register_checkin: además del rol, exige accesos
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

-- register_checkout: además del rol, exige accesos
create or replace function public.register_checkout(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista'], array['accesos']); c public.checkins;
begin
  select * into c from public.checkins where id = p_id for update;
  if not found then raise exception 'Ingreso no encontrado'; end if;
  if not c.allowed then raise exception 'No se puede registrar salida de un ingreso rechazado'; end if;
  if c.checkout_at is not null then raise exception 'La salida ya estaba registrada'; end if;
  update public.checkins set checkout_at = now() where id = p_id returning * into c;
  perform public._audit(me, 'Registrar salida', c.id::text);
  return to_jsonb(c);
end $$;

-- cash_open: además del rol, exige caja
create or replace function public.cash_open(p_opening integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['caja']); s public.cash_sessions;
begin
  if exists (select 1 from public.cash_sessions where closed_at is null) then raise exception 'Ya existe una caja abierta'; end if;
  if p_opening is null or p_opening < 0 or p_opening > 100000000 then raise exception 'Monto inicial: valor inválido'; end if;
  insert into public.cash_sessions (opening_amount, user_id) values (p_opening, me.id) returning * into s;
  perform public._audit(me, 'Abrir caja', s.id::text, 'Fondo inicial $' || s.opening_amount);
  return to_jsonb(s) || jsonb_build_object('expected_amount', s.opening_amount);
end $$;

-- cash_close: además del rol, exige caja
create or replace function public.cash_close(p_counted integer, p_notes text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['caja']); s public.cash_sessions; v_expected integer;
begin
  s := public._open_session();
  if p_counted is null or p_counted < 0 or p_counted > 100000000 then raise exception 'Efectivo contado: valor inválido'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception 'Notas: máximo 2000 caracteres'; end if;
  v_expected := public._expected_cash(s.id);
  update public.cash_sessions set closed_at = now(), counted_amount = p_counted, expected_amount = v_expected,
    difference = p_counted - v_expected, notes = btrim(coalesce(p_notes, '')), closed_by = me.id
  where id = s.id returning * into s;
  perform public._audit(me, 'Cerrar caja', s.id::text,
    'Esperado $' || v_expected || '; contado $' || p_counted || '; diferencia $' || s.difference);
  return to_jsonb(s);
end $$;

-- register_movement: además del rol, exige caja
create or replace function public.register_movement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['caja']); s public.cash_sessions; mv public.movements; v_type text := p ->> 'type';
begin
  s := public._open_session();
  if v_type is null or v_type not in ('ingreso', 'gasto', 'retiro') then raise exception 'Tipo: opción inválida'; end if;
  insert into public.movements (type, category, description, amount, method, session_id, user_id)
  values (v_type, public._txt(p, 'category', 'Categoría', true, 100), public._txt(p, 'description', 'Descripción', true, 1000),
          public._num(p, 'amount', 'Importe', 1), public._check_method(p ->> 'method'), s.id, me.id)
  returning * into mv;
  perform public._audit(me, 'Registrar movimiento', mv.id::text, mv.type || ': $' || mv.amount || ' · ' || mv.description);
  return to_jsonb(mv);
end $$;

-- register_sale: además del rol, exige ventas
create or replace function public.register_sale(p_items jsonb, p_method text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require_in(array['dueno', 'administrador', 'recepcionista', 'contador'], array['ventas']);
  s public.cash_sessions; e jsonb; rec record; pr public.products; sl public.sales;
  v_items jsonb := '[]'::jsonb; v_total bigint := 0; v_sub bigint;
begin
  s := public._open_session();
  perform public._check_method(p_method);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Agregá entre 1 y 100 productos';
  end if;
  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'Producto inválido'; end if;
    perform public._num(e, 'quantity', 'Cantidad', 1, 100000);
    perform public._ref(e, 'product_id', 'products', 'Producto');
  end loop;
  for rec in
    select (value ->> 'product_id')::uuid as pid, sum((value ->> 'quantity')::numeric)::integer as qty
    from jsonb_array_elements(p_items) group by 1 order by 1
  loop
    select * into pr from public.products where id = rec.pid for update;
    if not pr.active then raise exception 'El producto % está desactivado', pr.name; end if;
    if pr.stock < rec.qty then raise exception 'Stock insuficiente de %', pr.name; end if;
    v_sub := pr.price::bigint * rec.qty;
    v_total := v_total + v_sub;
    v_items := v_items || jsonb_build_object('product_id', pr.id, 'name', pr.name, 'quantity', rec.qty, 'price', pr.price, 'subtotal', v_sub);
    update public.products set stock = stock - rec.qty where id = pr.id;
  end loop;
  if v_total > 100000000 then raise exception 'El total de la venta supera el máximo permitido'; end if;
  insert into public.sales (items, total, method, session_id, user_id) values (v_items, v_total, p_method, s.id, me.id) returning * into sl;
  if v_total > 0 then
    insert into public.movements (type, category, description, amount, method, session_id, user_id, sale_id)
    values ('ingreso', 'Ventas', 'Venta ' || left(sl.id::text, 8), v_total, p_method, s.id, me.id, sl.id);
  end if;
  perform public._audit(me, 'Registrar venta', sl.id::text, '$' || v_total || ' · ' || jsonb_array_length(v_items) || ' productos');
  return to_jsonb(sl);
end $$;

-- void_sale: además del rol, exige ventas
create or replace function public.void_sale(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require_in(array['dueno', 'administrador'], array['ventas']);
  sl public.sales; s public.cash_sessions; it jsonb; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into sl from public.sales where id = p_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if sl.voided then raise exception 'La venta ya está anulada'; end if;
  if v_reason = '' then raise exception 'Motivo es obligatorio'; end if;
  if length(v_reason) > 1000 then raise exception 'Motivo: máximo 1000 caracteres'; end if;
  s := public._open_session();
  for it in select value from jsonb_array_elements(sl.items) loop
    update public.products set stock = stock + (it ->> 'quantity')::integer where id = (it ->> 'product_id')::uuid;
    if not found then raise exception 'No se puede reponer un producto inexistente'; end if;
  end loop;
  update public.sales set voided = true, voided_at = now(), voided_by = me.id, void_reason = v_reason where id = p_id returning * into sl;
  if sl.total > 0 then
    insert into public.movements (type, category, description, amount, method, session_id, user_id, sale_id)
    values ('gasto', 'Anulación de venta', 'Anulación ' || left(sl.id::text, 8) || ': ' || v_reason, sl.total, sl.method, s.id, me.id, sl.id);
  end if;
  perform public._audit(me, 'Anular venta', sl.id::text, v_reason);
  return to_jsonb(sl);
end $$;

-- create_reservation: además del rol, exige clases
create or replace function public.create_reservation(p_class uuid, p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['clases']); c public.classes; m public.members; r public.reservations;
begin
  select * into c from public.classes where id = p_class for update;
  if not found then raise exception 'Clase no encontrada'; end if;
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  if public._member_json(m) ->> 'status' <> 'activo' then raise exception 'El socio necesita una cuota activa para reservar'; end if;
  if not (c.date > public._today() or (c.date = public._today() and c.time > public._local_time())) then
    raise exception 'No se pueden reservar clases que ya comenzaron';
  end if;
  if m.expires_at is not null and m.expires_at < c.date then raise exception 'La cuota del socio vence antes de la clase'; end if;
  if exists (select 1 from public.reservations where class_id = c.id and member_id = m.id) then raise exception 'El socio ya reservó esta clase'; end if;
  if (select count(*) from public.reservations where class_id = c.id) >= c.capacity then raise exception 'La clase no tiene cupos disponibles'; end if;
  insert into public.reservations (class_id, member_id) values (c.id, m.id) returning * into r;
  perform public._audit(me, 'Reservar clase', r.id::text, m.name || ' · ' || c.name);
  return to_jsonb(r);
end $$;

-- delete_reservation: además del rol, exige clases
create or replace function public.delete_reservation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['clases']);
begin
  delete from public.reservations where id = p_id;
  if not found then raise exception 'Registro no encontrado'; end if;
  perform public._audit(me, 'Cancelar reserva', p_id::text);
  return jsonb_build_object('ok', true);
end $$;

-- delete_class: además del rol, exige clases
create or replace function public.delete_class(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor'], array['clases']); c public.classes; r record;
begin
  select * into c from public.classes where id = p_id for update;
  if not found then raise exception 'Registro no encontrado'; end if;
  for r in select id from public.reservations where class_id = p_id loop
    perform public._audit(me, 'Cancelar reserva por eliminación de clase', r.id::text);
  end loop;
  delete from public.classes where id = p_id;
  perform public._audit(me, 'Eliminar clase', p_id::text, c.name);
  return jsonb_build_object('ok', true);
end $$;

-- delete_routine: además del rol, exige rutinas
create or replace function public.delete_routine(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador', 'profesor', 'recepcionista'], array['rutinas']); r public.routines;
begin
  delete from public.routines where id = p_id returning * into r;
  if not found then raise exception 'Registro no encontrado'; end if;
  perform public._audit(me, 'Eliminar rutina', p_id::text, r.name);
  return jsonb_build_object('ok', true);
end $$;

-- Usuarios: además de nombre, rol y estado, los apartados que ve.
create or replace function public.save_user(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require_in(array['dueno', 'administrador'], array['configuracion']); ex public.profiles; r public.profiles; d jsonb;
begin
  select * into ex from public.profiles where id = p_id for update;
  if not found then raise exception 'Registro no encontrado'; end if;
  d := to_jsonb(ex) || coalesce(p, '{}'::jsonb);
  r := ex;
  r.name := public._txt(d, 'name', 'Nombre', true, 120);
  r.role := d ->> 'role';
  if r.role is null or r.role not in ('dueno', 'administrador', 'recepcionista', 'profesor', 'contador') then
    raise exception 'Rol: opción inválida';
  end if;
  r.active := public._bool(d, 'active', true);
  if me.role <> 'dueno' and (r.role = 'dueno' or ex.role = 'dueno') then
    raise exception 'Sólo el dueño puede gestionar otros dueños' using errcode = '42501';
  end if;
  if ex.id = me.id and not r.active then raise exception 'No podés desactivar tu propio usuario'; end if;
  if ex.role = 'dueno' and (not r.active or r.role <> 'dueno')
     and not exists (select 1 from public.profiles where id <> ex.id and role = 'dueno' and active) then
    raise exception 'Debe quedar al menos un dueño activo';
  end if;

  if p ? 'sections' then
    if jsonb_typeof(p -> 'sections') = 'null' then r.sections := null;
    elsif jsonb_typeof(p -> 'sections') = 'array' then
      r.sections := array(select distinct s from jsonb_array_elements_text(p -> 'sections') s);
    else raise exception 'Apartados: valor inválido';
    end if;
  end if;
  -- Se guardan sólo los apartados válidos para el rol; el dueño siempre ve todo.
  if r.role = 'dueno' then r.sections := null;
  elsif r.sections is not null then
    r.sections := array(select s from unnest(public._role_sections(r.role)) s where s = any (r.sections) or s = 'inicio');
  end if;
  if ex.id = me.id and not ('configuracion' = any (public._sections(r))) then
    raise exception 'No podés quitarte el acceso a Configuración';
  end if;

  update public.profiles set name = r.name, role = r.role, active = r.active, sections = r.sections where id = ex.id returning * into r;
  perform public._audit(me, 'Actualizar usuario', r.id::text, r.name || ' · ' || r.role
    || case when r.active then '' else ' · inactivo' end
    || case when r.sections is null then '' else ' · apartados: ' || array_to_string(public._sections(r), ', ') end);
  return to_jsonb(r) || jsonb_build_object('effective_sections', public._sections(r));
end $$;

-- Lectura principal: cada usuario recibe sólo los datos de los apartados que ve.
create or replace function public.app_bootstrap() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  sec text[] := public._sections(me);
  is_admin boolean := me.role in ('dueno', 'administrador');
  has_finance boolean := me.role in ('dueno', 'administrador', 'recepcionista', 'contador');
  has_training boolean := me.role in ('dueno', 'administrador', 'profesor', 'recepcionista');
  see_payments boolean := has_finance and sec && array['vencimientos', 'caja', 'finanzas', 'reportes'];
  see_cash boolean := has_finance and sec && array['caja', 'finanzas', 'reportes'];
  see_sessions boolean := has_finance and sec && array['caja', 'finanzas', 'reportes', 'ventas', 'vencimientos', 'socios', 'accesos'];
  see_products boolean := has_finance and sec && array['productos', 'ventas', 'finanzas', 'reportes'];
  see_sales boolean := has_finance and sec && array['ventas', 'finanzas', 'reportes'];
  see_routines boolean := has_training and sec && array['rutinas', 'socios'];
  see_measures boolean := has_training and sec && array['progreso', 'socios'];
  see_prices boolean := me.role <> 'profesor' or sec && array['planes', 'vencimientos', 'caja', 'finanzas', 'reportes'];
begin
  return jsonb_build_object(
    'user', jsonb_build_object('id', me.id, 'name', me.name, 'username', me.username, 'email', me.email, 'role', me.role, 'sections', sec),
    'today', public._today(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'members', coalesce((select jsonb_agg(public._safe_member(m, me.role) order by m.created_at desc) from public.members m), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(case when see_prices then to_jsonb(p) else to_jsonb(p) || '{"price":0,"discount":0}'::jsonb end order by p.created_at desc) from public.plans p), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) order by c.date desc) from public.checkins c where c.date >= now() - interval '400 days'), '[]'::jsonb),
    'payments', case when see_payments then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.payments x), '[]'::jsonb) else '[]'::jsonb end,
    'movements', case when see_cash then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.movements x), '[]'::jsonb) else '[]'::jsonb end,
    'cash_sessions', case when see_sessions then coalesce((select jsonb_agg(
        to_jsonb(s) || case when s.closed_at is null then jsonb_build_object('expected_amount', public._expected_cash(s.id)) else '{}'::jsonb end
        order by s.opened_at desc) from public.cash_sessions s), '[]'::jsonb) else '[]'::jsonb end,
    'products', case when see_products then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.products x), '[]'::jsonb) else '[]'::jsonb end,
    'sales', case when see_sales then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.sales x), '[]'::jsonb) else '[]'::jsonb end,
    'teachers', coalesce((select jsonb_agg(case when is_admin or me.role = 'contador' then to_jsonb(t) else to_jsonb(t) - 'salary' end order by t.created_at desc) from public.teachers t), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(c) order by c.date desc, c.time desc) from public.classes c), '[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.reservations r), '[]'::jsonb),
    'routines', case when see_routines then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.routines x), '[]'::jsonb) else '[]'::jsonb end,
    'measurements', case when see_measures then coalesce((select jsonb_agg((to_jsonb(x) - 'photo') || jsonb_build_object('has_photo', x.photo <> '') order by x.date desc) from public.measurements x), '[]'::jsonb) else '[]'::jsonb end,
    'users', case when is_admin and 'configuracion' = any (sec) then coalesce((select jsonb_agg(to_jsonb(u) || jsonb_build_object('effective_sections', public._sections(u)) order by u.created_at) from public.profiles u), '[]'::jsonb) else '[]'::jsonb end,
    'audit', case when (is_admin or me.role = 'contador') and 'auditoria' = any (sec) then coalesce((select jsonb_agg(to_jsonb(a) order by a.date desc) from (select * from public.audit_log order by date desc limit 1000) a), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

revoke execute on function public._role_sections(text), public._sections(public.profiles), public._require_in(text[], text[]) from public, anon, authenticated;
