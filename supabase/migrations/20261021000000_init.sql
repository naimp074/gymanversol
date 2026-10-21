-- Anversol Gym · esquema inicial para Supabase
--
-- Todas las tablas tienen RLS activado y ninguna política: los clientes no
-- pueden leer ni escribir tablas directamente. Todo pasa por funciones
-- SECURITY DEFINER que validan rol, datos y reglas de negocio (precios,
-- vencimientos, caja, stock, accesos) y registran auditoría.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── Tablas ─────────────────────────────

create table public.settings (
  id int primary key default 1 check (id = 1),
  gym_name text not null default 'Anversol',
  allow_expired_override boolean not null default false,
  allow_expired_entry boolean not null default false,
  require_medical boolean not null default false,
  address text not null default '',
  phone text not null default '',
  demo boolean not null default false,
  tagline text not null default '',
  about text not null default '',
  hours text not null default '',
  whatsapp text not null default '',
  instagram text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  username text not null unique,
  email text not null unique,
  role text not null check (role in ('dueno', 'administrador', 'recepcionista', 'profesor', 'contador')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Invitaciones de personal: la crea un administrador justo antes de dar de
-- alta la cuenta en Supabase Auth; el trigger de auth.users la convierte en perfil.
create table public.staff_invites (
  email text primary key,
  username text not null,
  name text not null,
  role text not null check (role in ('dueno', 'administrador', 'recepcionista', 'profesor', 'contador')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price integer not null check (price >= 0),
  duration integer not null check (duration between 1 and 3650),
  access_limit integer not null default 0 check (access_limit >= 0),
  start_time text not null default '06:00',
  end_time text not null default '23:00',
  discount numeric(5, 2) not null default 0 check (discount between 0 and 100),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence public.member_number_seq start 1001;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default (nextval('public.member_number_seq'))::text,
  name text not null,
  dni text not null unique check (dni ~ '^[0-9]{5,12}$'),
  birth_date date,
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  address text not null default '',
  photo text not null default '',
  joined_at date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  state text not null default 'activo' check (state in ('activo', 'suspendido', 'baja')),
  plan_id uuid references public.plans (id) on delete set null,
  expires_at date,
  last_payment timestamptz,
  notes text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  medical_expires_at date,
  medical_file text not null default '',
  medical_file_name text not null default '',
  qr_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  specialty text not null default '',
  schedule text not null default '',
  salary integer not null default 0 check (salary >= 0),
  state text not null default 'activo' check (state in ('activo', 'inactivo')),
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  teacher_id uuid references public.teachers (id) on delete set null,
  date date not null,
  time text not null default '09:00',
  duration integer not null default 60 check (duration between 1 and 1440),
  capacity integer not null default 20 check (capacity between 1 and 10000),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, member_id)
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  teacher_id uuid references public.teachers (id) on delete set null,
  name text not null,
  goal text not null default '',
  days text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  date date not null,
  weight numeric(6, 1),
  height numeric(6, 1),
  waist numeric(6, 1),
  arm numeric(6, 1),
  chest numeric(6, 1),
  leg numeric(6, 1),
  body_fat numeric(5, 1),
  photo text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '',
  price integer not null check (price >= 0),
  cost integer not null default 0 check (cost >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount integer not null default 0 check (opening_amount >= 0),
  counted_amount integer,
  expected_amount integer,
  difference integer,
  notes text not null default '',
  user_id uuid,
  closed_by uuid,
  created_at timestamptz not null default now()
);
-- Una única caja abierta compartida.
create unique index cash_sessions_one_open on public.cash_sessions ((true)) where closed_at is null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  amount integer not null check (amount >= 0),
  discount numeric(5, 2) not null default 0,
  plan_discount numeric(5, 2) not null default 0,
  method text not null check (method in ('Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito')),
  date timestamptz not null default now(),
  expires_at date not null,
  user_id uuid,
  session_id uuid references public.cash_sessions (id),
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,
  total integer not null check (total >= 0),
  method text not null check (method in ('Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito')),
  date timestamptz not null default now(),
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  session_id uuid references public.cash_sessions (id),
  user_id uuid,
  created_at timestamptz not null default now()
);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('ingreso', 'gasto', 'retiro')),
  category text not null,
  description text not null,
  amount integer not null check (amount > 0),
  method text not null check (method in ('Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito')),
  date timestamptz not null default now(),
  session_id uuid not null references public.cash_sessions (id),
  user_id uuid,
  payment_id uuid references public.payments (id),
  sale_id uuid references public.sales (id),
  created_at timestamptz not null default now()
);
create index movements_session on public.movements (session_id);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  date timestamptz not null default now(),
  allowed boolean not null,
  reason text not null default '',
  method text not null default 'manual' check (method in ('manual', 'qr')),
  checkout_at timestamptz,
  user_id uuid,
  override boolean not null default false,
  created_at timestamptz not null default now()
);
create index checkins_member_date on public.checkins (member_id, date);
create index checkins_date on public.checkins (date);
-- Evita registrar dos veces al mismo socio dentro del gimnasio.
create unique index checkins_one_open on public.checkins (member_id) where allowed and checkout_at is null;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null default now(),
  user_id uuid,
  user_name text not null default 'Sistema',
  action text not null,
  entity_id text not null default '',
  detail text not null default ''
);
create index audit_log_date on public.audit_log (date desc);

create table public.member_sessions (
  token_hash text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  expires_at timestamptz not null
);

create table public.member_login_attempts (
  ip text primary key,
  count integer not null default 0,
  since timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.plans enable row level security;
alter table public.members enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.reservations enable row level security;
alter table public.routines enable row level security;
alter table public.measurements enable row level security;
alter table public.products enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.sales enable row level security;
alter table public.movements enable row level security;
alter table public.checkins enable row level security;
alter table public.audit_log enable row level security;
alter table public.member_sessions enable row level security;
alter table public.member_login_attempts enable row level security;

-- ───────────────────────────── Utilidades ─────────────────────────────

create or replace function public._today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public._local_time() returns text
language sql stable set search_path = public as $$
  select to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI')
$$;

create or replace function public._local_date(ts timestamptz) returns date
language sql stable set search_path = public as $$
  select (ts at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public._client_ip() returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(btrim(split_part(
    (nullif(current_setting('request.headers', true), '')::json) ->> 'x-forwarded-for', ',', 1)), ''), 'desconocida')
$$;

create or replace function public._me() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() and active;
  if not found then
    raise exception 'Iniciá sesión para continuar' using errcode = '28000';
  end if;
  return p;
end $$;

create or replace function public._require(p_roles text[]) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles := public._me();
begin
  if not (p.role = any (p_roles)) then
    raise exception 'No tenés permisos para esta acción' using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function public._audit(p_user public.profiles, p_action text, p_entity text default '', p_detail text default '')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (user_id, user_name, action, entity_id, detail)
  values (p_user.id, coalesce(p_user.name, 'Sistema'), p_action, coalesce(p_entity, ''), left(coalesce(p_detail, ''), 1500));
$$;

create or replace function public._txt(p jsonb, p_key text, p_label text, p_required boolean default false, p_max int default 500)
returns text language plpgsql immutable as $$
declare v text;
begin
  if p ? p_key and jsonb_typeof(p -> p_key) not in ('string', 'null') then
    raise exception '%: texto inválido', p_label;
  end if;
  v := btrim(coalesce(p ->> p_key, ''));
  if p_required and v = '' then raise exception '% es obligatorio', p_label; end if;
  if length(v) > p_max then raise exception '%: máximo % caracteres', p_label, p_max; end if;
  return v;
end $$;

create or replace function public._num(p jsonb, p_key text, p_label text, p_min numeric default 0, p_max numeric default 100000000,
  p_integer boolean default true, p_optional boolean default false, p_fallback numeric default null)
returns numeric language plpgsql immutable as $$
declare raw text := btrim(coalesce(p ->> p_key, '')); v numeric;
begin
  if raw = '' then
    if p_optional then return null; end if;
    if p_fallback is not null then return p_fallback; end if;
    raise exception '%: valor inválido', p_label;
  end if;
  begin
    v := raw::numeric;
  exception when others then
    raise exception '%: valor inválido', p_label;
  end;
  if v < p_min or v > p_max or (p_integer and v <> trunc(v)) then
    raise exception '%: valor inválido', p_label;
  end if;
  return v;
end $$;

create or replace function public._bool(p jsonb, p_key text, p_fallback boolean) returns boolean
language plpgsql immutable as $$
begin
  if p is null or not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then return p_fallback; end if;
  if jsonb_typeof(p -> p_key) <> 'boolean' then raise exception 'Se esperaba verdadero o falso'; end if;
  return (p ->> p_key)::boolean;
end $$;

create or replace function public._date(p jsonb, p_key text, p_label text, p_required boolean default false) returns date
language plpgsql immutable as $$
declare raw text := btrim(coalesce(p ->> p_key, '')); v date;
begin
  if raw = '' then
    if p_required then raise exception '% es obligatorio', p_label; end if;
    return null;
  end if;
  if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '%: fecha inválida', p_label; end if;
  begin
    v := raw::date;
  exception when others then
    raise exception '%: fecha inválida', p_label;
  end;
  if v < date '1900-01-01' or v > date '2200-12-31' then raise exception '%: fecha fuera de rango', p_label; end if;
  return v;
end $$;

create or replace function public._time(p jsonb, p_key text, p_label text, p_fallback text) returns text
language plpgsql immutable as $$
declare v text := left(coalesce(nullif(btrim(coalesce(p ->> p_key, '')), ''), p_fallback), 5);
begin
  if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '%: hora inválida', p_label; end if;
  return v;
end $$;

create or replace function public._ref(p jsonb, p_key text, p_table text, p_label text, p_required boolean default true) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare raw text := btrim(coalesce(p ->> p_key, '')); v uuid; ok boolean;
begin
  if raw = '' then
    if p_required then raise exception '% no encontrado', p_label; end if;
    return null;
  end if;
  begin
    v := raw::uuid;
  exception when others then
    raise exception '% no encontrado', p_label;
  end;
  execute format('select exists (select 1 from public.%I where id = $1)', p_table) into ok using v;
  if not ok then raise exception '% no encontrado', p_label; end if;
  return v;
end $$;

-- Archivo adjunto como data URL: valida tipo, tamaño y firma del contenido.
create or replace function public._attachment(p_value text, p_label text, p_medical boolean) returns text
language plpgsql immutable as $$
declare m text[]; mime text; head bytea; valid boolean;
begin
  if p_value is null or p_value = '' then return ''; end if;
  m := regexp_match(p_value, '^data:(image/(?:png|jpeg|webp)|application/pdf);base64,([A-Za-z0-9+/=]+)$');
  if m is null or (not p_medical and m[1] = 'application/pdf') then
    raise exception '%: formato permitido JPG, PNG, WebP%', p_label, case when p_medical then ' o PDF' else '' end;
  end if;
  mime := m[1];
  if floor(length(m[2]) * 3 / 4) > (case when p_medical then 4 else 2 end) * 1024 * 1024 then
    raise exception '%: máximo % MB', p_label, case when p_medical then 4 else 2 end;
  end if;
  head := decode(substr(m[2], 1, 16), 'base64');
  valid := case mime
    when 'image/png' then substr(head, 1, 8) = '\x89504e470d0a1a0a'::bytea
    when 'image/jpeg' then substr(head, 1, 3) = '\xffd8ff'::bytea
    when 'image/webp' then substr(head, 1, 4) = '\x52494646'::bytea and substr(head, 9, 4) = '\x57454250'::bytea
    else substr(head, 1, 5) = '\x255044462d'::bytea
  end;
  if not valid then raise exception '%: contenido de archivo inválido', p_label; end if;
  return p_value;
end $$;

create or replace function public._member_json(m public.members) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(m) - 'medical_file') || jsonb_build_object(
    'has_medical_file', m.medical_file <> '',
    'status', case
      when m.state in ('suspendido', 'baja') then m.state
      when m.expires_at is not null and m.expires_at >= public._today() then 'activo'
      else 'vencido' end,
    'days_left', case when m.expires_at is null then -1 else m.expires_at - public._today() end,
    'plan_name', coalesce((select name from public.plans where id = m.plan_id), 'Sin plan'),
    'last_checkin', (select max(c.date) from public.checkins c where c.member_id = m.id and c.allowed)
  )
$$;

-- Oculta datos sensibles según el rol (médicos, emergencia, pagos, fotos).
create or replace function public._safe_member(m public.members, p_role text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := public._member_json(m);
begin
  if p_role in ('profesor', 'contador') then
    v := v - 'medical_expires_at' - 'medical_file_name' - 'has_medical_file' - 'emergency_name' - 'emergency_phone';
  end if;
  if p_role = 'contador' then v := v - 'photo' - 'notes'; end if;
  if p_role = 'profesor' then v := v - 'last_payment'; end if;
  return v;
end $$;

create or replace function public._expected_cash(p_session uuid) returns integer
language sql stable security definer set search_path = public as $$
  select s.opening_amount + coalesce((
    select sum(case when mv.type = 'ingreso' then mv.amount else -mv.amount end)
    from public.movements mv where mv.session_id = s.id and mv.method = 'Efectivo'), 0)::integer
  from public.cash_sessions s where s.id = p_session
$$;

create or replace function public._open_session() returns public.cash_sessions
language plpgsql volatile security definer set search_path = public as $$
declare s public.cash_sessions;
begin
  select * into s from public.cash_sessions where closed_at is null for update;
  if not found then raise exception 'Abrí la caja antes de registrar operaciones'; end if;
  return s;
end $$;

create or replace function public._check_method(p_method text) returns text
language plpgsql immutable as $$
begin
  if p_method is null or p_method not in ('Efectivo', 'Transferencia', 'Mercado Pago', 'Débito', 'Crédito') then
    raise exception 'Medio de pago: opción inválida';
  end if;
  return p_method;
end $$;

-- ───────────────────────────── Alta de personal ─────────────────────────────

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites; uname text;
begin
  lock table public.profiles in share row exclusive mode;
  if not exists (select 1 from public.profiles) then
    -- Primer usuario del sistema: queda como dueño.
    uname := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
    insert into public.profiles (id, name, username, email, role, active)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), uname), uname, lower(new.email), 'dueno', true);
  else
    select * into inv from public.staff_invites
    where email = lower(new.email) and created_at > now() - interval '1 day';
    if found then
      insert into public.profiles (id, name, username, email, role, active)
      values (new.id, inv.name, inv.username, inv.email, inv.role, true);
      delete from public.staff_invites where email = inv.email;
    end if;
    -- Sin invitación: la cuenta existe en Auth pero no tiene acceso a nada.
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles)
$$;

-- ───────────────────────────── Datos de demostración ─────────────────────────────

create or replace function public._seed_demo(p_owner public.profiles) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  d date := public._today();
  tz text := 'America/Argentina/Buenos_Aires';
  plan_ids uuid[] := '{}'; teacher_ids uuid[] := '{}'; product_ids uuid[] := '{}'; member_ids uuid[] := '{}';
  names text[] := array['Lucía Martínez','Tomás Rodríguez','Camila López','Mateo García','Sofía Fernández','Nicolás Pérez','Valentina González','Santiago Díaz','Martina Romero','Benjamín Sosa','Julieta Torres','Joaquín Álvarez','Catalina Ruiz','Felipe Ramírez','Florencia Acosta','Bautista Medina','Agustina Herrera','Lautaro Aguirre','Victoria Castro','Thiago Molina','Micaela Silva','Franco Ortiz','Josefina Núñez','Emiliano Rojas','Delfina Morales','Ignacio Suárez','Pilar Navarro','Bruno Cabrera','Milagros Domínguez','Facundo Vega','Renata Peralta','Manuel Figueroa','Abril Ríos','Simón Coronel','Alma Giménez','Pedro Luna','Malena Ponce','Valentín Vera','Clara Benítez','Juan Salas'];
  i int; k int; j int; off int; hr int; v_id uuid; v_day date; v_ts timestamptz; v_cash int;
  pl public.plans; pr public.products; mem public.members; v_session uuid; v_method text; v_pay uuid; v_sale uuid; v_class uuid;
begin
  for i in 1..4 loop
    insert into public.plans (name, price, duration, access_limit, description)
    values ((array['Pase libre','Musculación','Full trimestral','Clases grupales'])[i],
            (array[28000,22000,72000,19000])[i], (array[30,30,90,30])[i], (array[0,20,0,12])[i],
            (array['Entrená todos los días, a tu ritmo','Sala de musculación y seguimiento','Todos los espacios durante tres meses','Yoga, funcional y entrenamiento en equipo'])[i])
    returning id into v_id;
    plan_ids := plan_ids || v_id;
  end loop;

  for i in 1..3 loop
    insert into public.teachers (name, specialty, schedule, salary, phone, state)
    values ((array['Martín Fernández','Valentina Gómez','Nicolás Torres'])[i],
            (array['Musculación','Yoga y movilidad','Funcional y HIIT'])[i],
            (array['Lun a vie · 07:00 a 14:00','Lun, mié y vie · 08:00 a 12:00','Lun a vie · 16:00 a 22:00'])[i],
            (array[420000,320000,390000])[i],
            '115555' || (1000 + (array[4200,3200,3900])[i])::text, 'activo')
    returning id into v_id;
    teacher_ids := teacher_ids || v_id;
  end loop;

  for i in 1..6 loop
    insert into public.products (name, category, price, cost, stock, min_stock, active)
    values ((array['Agua mineral 500 ml','Bebida isotónica','Barra de proteína','Whey protein 1 kg','Toalla deportiva','Shaker 600 ml'])[i],
            (array['Bebidas','Bebidas','Suplementos','Suplementos','Accesorios','Accesorios'])[i],
            (array[1500,2800,3200,38000,8500,6500])[i], (array[700,1500,1800,26000,4500,3200])[i],
            (array[48,22,8,6,12,4])[i], (array[12,8,10,3,4,5])[i], true)
    returning id into v_id;
    product_ids := product_ids || v_id;
  end loop;

  for i in 0..39 loop
    insert into public.members (name, dni, birth_date, joined_at, state, plan_id, expires_at, last_payment, notes, medical_expires_at)
    values (names[i + 1], (30123450 + i * 128361)::text,
            make_date(1986 + i % 18, i % 12 + 1, i % 25 + 1), d - 120 - i * 4,
            case when i = 35 then 'suspendido' when i = 39 then 'baja' else 'activo' end,
            plan_ids[i % 4 + 1],
            case when i < 27 then d + 7 + i when i < 32 then d + (i - 27) when i < 38 then d - (i - 30) else d + 12 end,
            ((d - 10 - i % 20) + time '12:00') at time zone tz,
            'Socio de demostración. Reemplazar por datos reales.', d + 120 + i)
    returning id into v_id;
    member_ids := member_ids || v_id;
  end loop;

  for off in reverse 30..0 loop
    v_day := d - off;
    insert into public.cash_sessions (opened_at, closed_at, opening_amount, user_id, created_at)
    values ((v_day + time '06:00') at time zone tz,
            case when off > 0 then (v_day + time '21:00') at time zone tz end,
            20000, p_owner.id, (v_day + time '06:00') at time zone tz)
    returning id into v_session;
    v_cash := 20000;

    for k in 0..(1 + off % 3) loop
      select * into mem from public.members where id = member_ids[(off * 3 + k) % 40 + 1];
      select * into pl from public.plans where id = mem.plan_id;
      v_method := case when (off + k) % 3 <> 0 then 'Transferencia' else 'Efectivo' end;
      v_ts := (v_day + make_time(9 + k, 0, 0)) at time zone tz;
      insert into public.payments (member_id, plan_id, amount, method, date, expires_at, user_id, session_id, created_at)
      values (mem.id, pl.id, pl.price, v_method, v_ts, v_day + pl.duration, p_owner.id, v_session, v_ts)
      returning id into v_pay;
      insert into public.movements (type, category, description, amount, method, date, session_id, user_id, payment_id, created_at)
      values ('ingreso', 'Cuotas', 'Cuota ' || pl.name || ' · ' || mem.name, pl.price, v_method, v_ts, v_session, p_owner.id, v_pay, v_ts);
      if v_method = 'Efectivo' then v_cash := v_cash + pl.price; end if;
    end loop;

    if off % 4 = 0 then
      v_ts := (v_day + time '12:00') at time zone tz;
      insert into public.movements (type, category, description, amount, method, date, session_id, user_id, created_at)
      values ('gasto', 'Mantenimiento', 'Insumos de limpieza · demostración', 4500, 'Efectivo', v_ts, v_session, p_owner.id, v_ts);
      v_cash := v_cash - 4500;
    end if;

    select * into pr from public.products where id = product_ids[off % 6 + 1];
    v_ts := (v_day + time '10:30') at time zone tz;
    insert into public.sales (items, total, method, date, session_id, user_id, created_at)
    values (jsonb_build_array(jsonb_build_object('product_id', pr.id, 'name', pr.name, 'quantity', 1, 'price', pr.price, 'subtotal', pr.price)),
            pr.price, 'Efectivo', v_ts, v_session, p_owner.id, v_ts)
    returning id into v_sale;
    insert into public.movements (type, category, description, amount, method, date, session_id, user_id, sale_id, created_at)
    values ('ingreso', 'Ventas', 'Venta ' || left(v_sale::text, 8), pr.price, 'Efectivo', v_ts, v_session, p_owner.id, v_sale, v_ts);
    v_cash := v_cash + pr.price;

    if off > 0 then
      update public.cash_sessions set counted_amount = v_cash, expected_amount = v_cash, difference = 0 where id = v_session;
    end if;

    for j in 0..(11 + (off * 7) % 18) loop
      hr := 7 + j % 12;
      v_ts := (v_day + make_time(hr, (j % 6) * 7, 0)) at time zone tz;
      continue when off = 0 and v_ts > now();
      insert into public.checkins (member_id, date, allowed, reason, method, checkout_at, user_id, created_at)
      values (member_ids[(off + j * 3) % 35 + 1], v_ts, true, 'Ingreso permitido',
              case when j % 3 <> 0 then 'manual' else 'qr' end,
              case when off = 0 and j < 3 then null else (v_day + make_time(hr + 1, (j % 6) * 7, 0)) at time zone tz end,
              p_owner.id, v_ts);
    end loop;
  end loop;

  for off in 0..6 loop
    for k in 0..2 loop
      insert into public.classes (name, teacher_id, date, time, duration, capacity, description)
      values ((array['Yoga & movilidad','Entrenamiento funcional','Fuerza y resistencia'])[k + 1],
              teacher_ids[(k + 1) % 3 + 1], d + off, (array['08:00','18:00','19:30'])[k + 1], 60,
              (array[16,20,18])[k + 1], 'Clase de demostración. Traer agua y toalla.')
      returning id into v_class;
      for j in 0..(3 + (off + k) % 7) loop
        insert into public.reservations (class_id, member_id)
        values (v_class, member_ids[(off * 3 + j + k) % 25 + 1]) on conflict do nothing;
      end loop;
    end loop;
  end loop;

  for i in 0..7 loop
    insert into public.routines (member_id, teacher_id, name, goal, days, notes)
    values (member_ids[i + 1], teacher_ids[1],
            case when i % 2 = 1 then 'Fuerza · nivel intermedio' else 'Acondicionamiento general' end,
            case when i % 2 = 1 then 'Mejorar la fuerza y la técnica' else 'Construir constancia y movilidad' end,
            E'Día 1 · Tren inferior\nSentadilla goblet — 3 × 12\nPeso muerto rumano — 3 × 10\nPlancha — 3 × 30 segundos\n\nDía 2 · Tren superior\nRemo con mancuerna — 3 × 12\nPress de pecho — 3 × 10\nMovilidad — 10 minutos',
            'Rutina de ejemplo. El profesor debe adaptarla a cada socio.');
    for k in 0..3 loop
      insert into public.measurements (member_id, date, weight, height, waist, arm, chest, leg, body_fat, notes)
      values (member_ids[i + 1], d - (3 - k) * 30, round((68 + i * 2 - k * 0.6) * 10) / 10, 165 + i * 2, 82 + i - k,
              30 + i * 0.5, 94 + i, 52 + i, 22 + i * 0.5 - k * 0.4, 'Medición de demostración');
    end loop;
  end loop;
end $$;

create or replace function public.setup_finish(p_demo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno']);
begin
  if (select count(*) from public.profiles) <> 1 or exists (select 1 from public.members) or exists (select 1 from public.plans) then
    raise exception 'El sistema ya está configurado';
  end if;
  update public.settings set demo = coalesce(p_demo, false), updated_at = now() where id = 1;
  if coalesce(p_demo, false) then perform public._seed_demo(me); end if;
  perform public._audit(me, 'Configuración inicial', me.id::text,
    case when p_demo then 'Se crearon datos de demostración' else 'Sistema inicializado sin datos de demostración' end);
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── Lectura principal ─────────────────────────────

create or replace function public.app_bootstrap() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  is_admin boolean := me.role in ('dueno', 'administrador');
  has_finance boolean := me.role in ('dueno', 'administrador', 'recepcionista', 'contador');
  has_training boolean := me.role in ('dueno', 'administrador', 'profesor', 'recepcionista');
begin
  return jsonb_build_object(
    'user', jsonb_build_object('id', me.id, 'name', me.name, 'username', me.username, 'email', me.email, 'role', me.role),
    'today', public._today(),
    'settings', (select to_jsonb(s) from public.settings s where id = 1),
    'members', coalesce((select jsonb_agg(public._safe_member(m, me.role) order by m.created_at desc) from public.members m), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(case when me.role = 'profesor' then to_jsonb(p) || '{"price":0,"discount":0}'::jsonb else to_jsonb(p) end order by p.created_at desc) from public.plans p), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) order by c.date desc) from public.checkins c where c.date >= now() - interval '400 days'), '[]'::jsonb),
    'payments', case when has_finance then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.payments x), '[]'::jsonb) else '[]'::jsonb end,
    'movements', case when has_finance then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.movements x), '[]'::jsonb) else '[]'::jsonb end,
    'cash_sessions', case when has_finance then coalesce((select jsonb_agg(
        to_jsonb(s) || case when s.closed_at is null then jsonb_build_object('expected_amount', public._expected_cash(s.id)) else '{}'::jsonb end
        order by s.opened_at desc) from public.cash_sessions s), '[]'::jsonb) else '[]'::jsonb end,
    'products', case when has_finance then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.products x), '[]'::jsonb) else '[]'::jsonb end,
    'sales', case when has_finance then coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from public.sales x), '[]'::jsonb) else '[]'::jsonb end,
    'teachers', coalesce((select jsonb_agg(case when is_admin or me.role = 'contador' then to_jsonb(t) else to_jsonb(t) - 'salary' end order by t.created_at desc) from public.teachers t), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(c) order by c.date desc, c.time desc) from public.classes c), '[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.reservations r), '[]'::jsonb),
    'routines', case when has_training then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.routines x), '[]'::jsonb) else '[]'::jsonb end,
    'measurements', case when has_training then coalesce((select jsonb_agg((to_jsonb(x) - 'photo') || jsonb_build_object('has_photo', x.photo <> '') order by x.date desc) from public.measurements x), '[]'::jsonb) else '[]'::jsonb end,
    'users', case when is_admin then coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at) from public.profiles u), '[]'::jsonb) else '[]'::jsonb end,
    'audit', case when is_admin or me.role = 'contador' then coalesce((select jsonb_agg(to_jsonb(a) order by a.date desc) from (select * from public.audit_log order by date desc limit 1000) a), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- Archivos pesados: se piden sólo cuando hacen falta.
create or replace function public.member_medical_file(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista']); m public.members;
begin
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Socio no encontrado'; end if;
  return jsonb_build_object('file', m.medical_file, 'name', m.medical_file_name);
end $$;

create or replace function public.measurement_photo(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']);
begin
  return (select photo from public.measurements where id = p_id);
end $$;

-- ───────────────────────────── Altas y modificaciones ─────────────────────────────

create or replace function public.save_member(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista']); r public.members; d jsonb; old_expires date;
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

create or replace function public.save_plan(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador']); r public.plans; d jsonb;
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

create or replace function public.save_product(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'contador']); r public.products; d jsonb;
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

create or replace function public.save_teacher(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador']); r public.teachers; d jsonb;
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

create or replace function public.save_class(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor']); r public.classes; d jsonb;
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

create or replace function public.save_routine(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']); r public.routines; d jsonb;
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

create or replace function public.save_measurement(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']); r public.measurements; d jsonb;
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

create or replace function public.update_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador']); d jsonb; s public.settings;
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

-- ───────────────────────────── Usuarios del personal ─────────────────────────────

create or replace function public.create_staff_invite(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require(array['dueno', 'administrador']);
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

create or replace function public.save_user(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador']); ex public.profiles; r public.profiles; d jsonb;
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
  update public.profiles set name = r.name, role = r.role, active = r.active where id = ex.id returning * into r;
  perform public._audit(me, 'Actualizar usuario', r.id::text, r.name || ' · ' || r.role || case when r.active then '' else ' · inactivo' end);
  return to_jsonb(r);
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me public.profiles := public._require(array['dueno', 'administrador']); target public.profiles;
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

create or replace function public.log_action(p_action text, p_entity text default '', p_detail text default '') returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  if p_action not in ('Inicio de sesión', 'Cierre de sesión', 'Exportar CSV', 'Descargar respaldo', 'Cambiar contraseña') then
    raise exception 'Acción inválida';
  end if;
  perform public._audit(me, p_action, left(coalesce(p_entity, ''), 100), p_detail);
end $$;

-- ───────────────────────────── Operaciones ─────────────────────────────

create or replace function public.register_payment(p_member uuid, p_plan uuid, p_method text, p_discount numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista', 'contador']);
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

create or replace function public.register_checkin(p_identifier text, p_method text default 'manual', p_override boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista']);
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

create or replace function public.register_checkout(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista']); c public.checkins;
begin
  select * into c from public.checkins where id = p_id for update;
  if not found then raise exception 'Ingreso no encontrado'; end if;
  if not c.allowed then raise exception 'No se puede registrar salida de un ingreso rechazado'; end if;
  if c.checkout_at is not null then raise exception 'La salida ya estaba registrada'; end if;
  update public.checkins set checkout_at = now() where id = p_id returning * into c;
  perform public._audit(me, 'Registrar salida', c.id::text);
  return to_jsonb(c);
end $$;

create or replace function public.cash_open(p_opening integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista', 'contador']); s public.cash_sessions;
begin
  if exists (select 1 from public.cash_sessions where closed_at is null) then raise exception 'Ya existe una caja abierta'; end if;
  if p_opening is null or p_opening < 0 or p_opening > 100000000 then raise exception 'Monto inicial: valor inválido'; end if;
  insert into public.cash_sessions (opening_amount, user_id) values (p_opening, me.id) returning * into s;
  perform public._audit(me, 'Abrir caja', s.id::text, 'Fondo inicial $' || s.opening_amount);
  return to_jsonb(s) || jsonb_build_object('expected_amount', s.opening_amount);
end $$;

create or replace function public.cash_close(p_counted integer, p_notes text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista', 'contador']); s public.cash_sessions; v_expected integer;
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

create or replace function public.register_movement(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista', 'contador']); s public.cash_sessions; mv public.movements; v_type text := p ->> 'type';
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

create or replace function public.register_sale(p_items jsonb, p_method text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require(array['dueno', 'administrador', 'recepcionista', 'contador']);
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

create or replace function public.void_sale(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._require(array['dueno', 'administrador']);
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

create or replace function public.create_reservation(p_class uuid, p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']); c public.classes; m public.members; r public.reservations;
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

create or replace function public.delete_reservation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']);
begin
  delete from public.reservations where id = p_id;
  if not found then raise exception 'Registro no encontrado'; end if;
  perform public._audit(me, 'Cancelar reserva', p_id::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_class(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor']); c public.classes; r record;
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

create or replace function public.delete_routine(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador', 'profesor', 'recepcionista']); r public.routines;
begin
  delete from public.routines where id = p_id returning * into r;
  if not found then raise exception 'Registro no encontrado'; end if;
  perform public._audit(me, 'Eliminar rutina', p_id::text, r.name);
  return jsonb_build_object('ok', true);
end $$;

-- Copia completa de los datos (incluye fotos y certificados) para guardar fuera de Supabase.
create or replace function public.export_backup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._require(array['dueno', 'administrador']);
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

-- ───────────────────────────── Sitio público ─────────────────────────────

create or replace function public.public_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.settings; d date := public._today(); v_time text := public._local_time(); v_plans jsonb; v_classes jsonb; v_opening jsonb;
begin
  select * into s from public.settings where id = 1;
  select coalesce(jsonb_agg(t.x order by (t.x ->> 'price')::numeric), '[]'::jsonb) into v_plans from (
    select jsonb_build_object('id', id, 'name', name, 'description', description,
      'price', round(price * (1 - discount / 100)), 'full_price', price, 'discount', discount, 'duration', duration,
      'access_limit', access_limit, 'start_time', start_time, 'end_time', end_time) as x
    from public.plans where active) t;
  select coalesce(jsonb_agg(t.x order by t.k), '[]'::jsonb) into v_classes from (
    select c.date::text || c.time as k, jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description,
      'date', c.date, 'time', c.time, 'duration', c.duration, 'teacher', coalesce(te.name, ''), 'capacity', c.capacity,
      'spots', greatest(0, c.capacity - (select count(*) from public.reservations r where r.class_id = c.id))) as x
    from public.classes c left join public.teachers te on te.id = c.teacher_id
    where c.date <= d + 14 and (c.date > d or (c.date = d and c.time > v_time))
    order by c.date, c.time limit 24) t;
  select case when count(*) = 0 then null else jsonb_build_object('start', min(start_time), 'end', max(end_time)) end
  into v_opening from public.plans where active;
  return jsonb_build_object(
    'gym_name', s.gym_name, 'address', s.address, 'phone', s.phone, 'tagline', s.tagline, 'about', s.about,
    'hours', s.hours, 'whatsapp', s.whatsapp, 'instagram', s.instagram, 'email', s.email,
    'today', d, 'opening', v_opening, 'plans', v_plans, 'classes', v_classes,
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'specialty', specialty, 'schedule', schedule) order by created_at)
      from public.teachers where state <> 'inactivo'), '[]'::jsonb),
    'stats', jsonb_build_object(
      'active_members', (select count(*) from public.members where state not in ('suspendido', 'baja') and expires_at >= d),
      'teachers', (select count(*) from public.teachers where state <> 'inactivo'),
      'classes', jsonb_array_length(v_classes),
      'visits_month', (select count(*) from public.checkins where allowed and public._local_date(date) >= date_trunc('month', d)::date)
    )
  );
end $$;

-- ───────────────────────────── Portal de socios ─────────────────────────────

create or replace function public._member_portal(m public.members) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := public._member_json(m); pl public.plans; d date := public._today();
begin
  select * into pl from public.plans where id = m.plan_id;
  return jsonb_build_object(
    'gym_name', (select gym_name from public.settings where id = 1),
    'today', d,
    'member', jsonb_build_object('name', m.name, 'number', m.number, 'photo', m.photo, 'plan_name', v ->> 'plan_name',
      'status', v ->> 'status', 'days_left', (v ->> 'days_left')::int, 'expires_at', m.expires_at, 'joined_at', m.joined_at,
      'last_checkin', v -> 'last_checkin', 'access_limit', coalesce(pl.access_limit, 0),
      'start_time', coalesce(pl.start_time, ''), 'end_time', coalesce(pl.end_time, '')),
    'visits', coalesce((select jsonb_agg(c.date order by c.date) from public.checkins c
      where c.member_id = m.id and c.allowed and public._local_date(c.date) >= d - 400), '[]'::jsonb),
    'reservations', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'date', c.date, 'time', c.time,
        'duration', c.duration, 'teacher', coalesce(t.name, '')) order by c.date, c.time)
      from public.reservations r join public.classes c on c.id = r.class_id left join public.teachers t on t.id = c.teacher_id
      where r.member_id = m.id and c.date >= d), '[]'::jsonb),
    'routines', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'goal', r.goal, 'days', r.days,
        'notes', r.notes, 'teacher', coalesce(t.name, ''), 'created_at', r.created_at) order by r.created_at desc)
      from public.routines r left join public.teachers t on t.id = r.teacher_id where r.member_id = m.id), '[]'::jsonb),
    'measurements', coalesce((select jsonb_agg(to_jsonb(x) - 'photo' - 'member_id' order by x.date)
      from public.measurements x where x.member_id = m.id), '[]'::jsonb)
  );
end $$;

-- Devuelve {error} en lugar de lanzar excepción para que el contador de intentos se conserve.
create or replace function public.member_login(p_dni text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g');
  v_ip text := public._client_ip();
  a public.member_login_attempts; has_attempts boolean; m public.members; v_token text;
begin
  select * into a from public.member_login_attempts where ip = v_ip for update;
  has_attempts := found;
  if has_attempts and a.since < now() - interval '15 minutes' then
    update public.member_login_attempts set count = 0, since = now() where ip = v_ip;
    a.count := 0;
  end if;
  if has_attempts and a.count >= 10 then
    return jsonb_build_object('error', 'Demasiados intentos. Intentá de nuevo en 15 minutos');
  end if;
  if v_dni ~ '^[0-9]{5,12}$' then
    select * into m from public.members where dni = v_dni;
  end if;
  if m.id is null or m.state = 'baja' then
    insert into public.member_login_attempts (ip, count, since) values (v_ip, 1, now())
    on conflict (ip) do update set count = public.member_login_attempts.count + 1;
    return jsonb_build_object('error', 'No encontramos un socio activo con ese DNI. Consultá en recepción.');
  end if;
  delete from public.member_login_attempts where ip = v_ip;
  delete from public.member_sessions where expires_at < now();
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token_hash, member_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), m.id, now() + interval '30 days');
  perform public._audit(null::public.profiles, 'Ingreso al portal de socios', m.id::text, m.name);
  return jsonb_build_object('token', v_token, 'portal', public._member_portal(m));
end $$;

create or replace function public.member_portal(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.members;
begin
  select mb.* into m from public.member_sessions s join public.members mb on mb.id = s.member_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and s.expires_at > now();
  if not found or m.state = 'baja' then
    return jsonb_build_object('error', 'Ingresá con tu DNI para continuar', 'status', 401);
  end if;
  return public._member_portal(m);
end $$;

create or replace function public.member_logout(p_token text) returns jsonb
language sql volatile security definer set search_path = public, extensions as $$
  delete from public.member_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  select jsonb_build_object('ok', true);
$$;

-- ───────────────────────────── Permisos de ejecución ─────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.public_info() to anon, authenticated;
grant execute on function public.member_login(text) to anon, authenticated;
grant execute on function public.member_portal(text) to anon, authenticated;
grant execute on function public.member_logout(text) to anon, authenticated;
grant execute on function public.needs_setup() to anon, authenticated;

grant execute on function
  public.setup_finish(boolean),
  public.app_bootstrap(),
  public.member_medical_file(uuid),
  public.measurement_photo(uuid),
  public.save_member(uuid, jsonb),
  public.save_plan(uuid, jsonb),
  public.save_product(uuid, jsonb),
  public.save_teacher(uuid, jsonb),
  public.save_class(uuid, jsonb),
  public.save_routine(uuid, jsonb),
  public.save_measurement(uuid, jsonb),
  public.update_settings(jsonb),
  public.create_staff_invite(jsonb),
  public.save_user(uuid, jsonb),
  public.admin_set_password(uuid, text),
  public.log_action(text, text, text),
  public.register_payment(uuid, uuid, text, numeric),
  public.register_checkin(text, text, boolean),
  public.register_checkout(uuid),
  public.cash_open(integer),
  public.cash_close(integer, text),
  public.register_movement(jsonb),
  public.register_sale(jsonb, text),
  public.void_sale(uuid, text),
  public.create_reservation(uuid, uuid),
  public.delete_reservation(uuid),
  public.delete_class(uuid),
  public.delete_routine(uuid),
  public.export_backup()
to authenticated;
