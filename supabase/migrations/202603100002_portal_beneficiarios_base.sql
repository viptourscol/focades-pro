-- Portal beneficiarios: base de datos y seguridad inicial

create table if not exists public.portal_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_configuracion (
  id bigserial primary key,
  promedio_minimo numeric(4,2) not null default 3.50,
  cert_bancario_max_dias integer not null default 15,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_noticias (
  id bigserial primary key,
  title text not null,
  summary text,
  content text,
  image_url text,
  button_label text,
  button_url text,
  publish_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_modal_anuncios (
  id bigserial primary key,
  title text not null,
  content text not null,
  priority integer not null default 100,
  visible_desde timestamptz not null default now(),
  visible_hasta timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_ventanas_actualizacion (
  id bigserial primary key,
  nombre text not null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fecha_fin > fecha_inicio)
);

create table if not exists public.portal_beneficiarios (
  id bigserial primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  persona_id bigint,
  inscripcion_id uuid,
  radicado_inscripcion text,
  nombre_completo text,
  tipo_documento text,
  n_documento text,
  email text,
  telefono text,
  direccion text,
  semestre_actual integer,
  estado_beneficiario text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado_beneficiario in ('activo','suspendido','retirado','condonado','egresado'))
);

create index if not exists idx_portal_beneficiarios_auth_user on public.portal_beneficiarios(auth_user_id);
create index if not exists idx_portal_beneficiarios_estado on public.portal_beneficiarios(estado_beneficiario);

create table if not exists public.portal_actualizaciones (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  ventana_id bigint references public.portal_ventanas_actualizacion(id) on delete set null,
  estado text not null default 'en_revision',
  email text,
  telefono text,
  direccion text,
  semestre_actual integer,
  promedio_semestre_anterior numeric(4,2),
  payload_formulario jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado in ('en_revision','aprobada','rechazada'))
);

create index if not exists idx_portal_actualizaciones_beneficiario on public.portal_actualizaciones(beneficiario_id, created_at desc);

create table if not exists public.portal_actualizacion_documentos (
  id bigserial primary key,
  actualizacion_id bigint not null references public.portal_actualizaciones(id) on delete cascade,
  tipo_documento text not null,
  storage_path text not null,
  nombre_original text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo_documento in ('certificado_bancario','certificado_notas','certificado_matricula'))
);

create index if not exists idx_portal_docs_actualizacion on public.portal_actualizacion_documentos(actualizacion_id);

create table if not exists public.portal_auditoria (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  entidad text not null,
  entidad_id text not null,
  accion text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_auditoria_entidad on public.portal_auditoria(entidad, created_at desc);

alter table public.portal_admin_users enable row level security;
alter table public.portal_configuracion enable row level security;
alter table public.portal_noticias enable row level security;
alter table public.portal_modal_anuncios enable row level security;
alter table public.portal_ventanas_actualizacion enable row level security;
alter table public.portal_beneficiarios enable row level security;
alter table public.portal_actualizaciones enable row level security;
alter table public.portal_actualizacion_documentos enable row level security;
alter table public.portal_auditoria enable row level security;

-- admin users self lookup
drop policy if exists portal_admin_users_self_select on public.portal_admin_users;

create policy portal_admin_users_self_select
  on public.portal_admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- helper policies for admin-managed catalogs
drop policy if exists portal_config_select_authenticated on public.portal_configuracion;

create policy portal_config_select_authenticated
  on public.portal_configuracion for select
  to authenticated
  using (is_active = true or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_config_admin_write on public.portal_configuracion;

create policy portal_config_admin_write
  on public.portal_configuracion for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_news_select_authenticated on public.portal_noticias;

create policy portal_news_select_authenticated
  on public.portal_noticias for select
  to authenticated
  using (is_active = true or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_news_admin_write on public.portal_noticias;

create policy portal_news_admin_write
  on public.portal_noticias for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_modal_select_authenticated on public.portal_modal_anuncios;

create policy portal_modal_select_authenticated
  on public.portal_modal_anuncios for select
  to authenticated
  using (
    (
      is_active = true
      and visible_desde <= now()
      and (visible_hasta is null or visible_hasta >= now())
    )
    or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
  );

drop policy if exists portal_modal_admin_write on public.portal_modal_anuncios;

create policy portal_modal_admin_write
  on public.portal_modal_anuncios for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_windows_select_authenticated on public.portal_ventanas_actualizacion;

create policy portal_windows_select_authenticated
  on public.portal_ventanas_actualizacion for select
  to authenticated
  using (true);

drop policy if exists portal_windows_admin_write on public.portal_ventanas_actualizacion;

create policy portal_windows_admin_write
  on public.portal_ventanas_actualizacion for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- beneficiarios: self read, self partial update, admin full access
drop policy if exists portal_beneficiarios_self_select on public.portal_beneficiarios;

create policy portal_beneficiarios_self_select
  on public.portal_beneficiarios for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
  );

drop policy if exists portal_beneficiarios_self_update on public.portal_beneficiarios;

create policy portal_beneficiarios_self_update
  on public.portal_beneficiarios for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists portal_beneficiarios_admin_all on public.portal_beneficiarios;

create policy portal_beneficiarios_admin_all
  on public.portal_beneficiarios for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- actualizaciones: self create/read if active and inside window, admin all
drop policy if exists portal_actualizaciones_self_select on public.portal_actualizaciones;

create policy portal_actualizaciones_self_select
  on public.portal_actualizaciones for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_beneficiarios b
      where b.id = beneficiario_id
        and b.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
  );

drop policy if exists portal_actualizaciones_self_insert on public.portal_actualizaciones;

create policy portal_actualizaciones_self_insert
  on public.portal_actualizaciones for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.portal_beneficiarios b
      join public.portal_ventanas_actualizacion v on v.id = ventana_id
      where b.id = beneficiario_id
        and b.auth_user_id = auth.uid()
        and b.estado_beneficiario = 'activo'
        and v.is_active = true
        and now() between v.fecha_inicio and v.fecha_fin
    )
  );

drop policy if exists portal_actualizaciones_admin_all on public.portal_actualizaciones;

create policy portal_actualizaciones_admin_all
  on public.portal_actualizaciones for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- docs linked to owned actualizacion
drop policy if exists portal_docs_self_select on public.portal_actualizacion_documentos;

create policy portal_docs_self_select
  on public.portal_actualizacion_documentos for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_actualizaciones u
      join public.portal_beneficiarios b on b.id = u.beneficiario_id
      where u.id = actualizacion_id
        and b.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
  );

drop policy if exists portal_docs_self_insert on public.portal_actualizacion_documentos;

create policy portal_docs_self_insert
  on public.portal_actualizacion_documentos for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.portal_actualizaciones u
      join public.portal_beneficiarios b on b.id = u.beneficiario_id
      where u.id = actualizacion_id
        and b.auth_user_id = auth.uid()
    )
  );

drop policy if exists portal_docs_admin_all on public.portal_actualizacion_documentos;

create policy portal_docs_admin_all
  on public.portal_actualizacion_documentos for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_auditoria_admin_read on public.portal_auditoria;

create policy portal_auditoria_admin_read
  on public.portal_auditoria for select
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_auditoria_admin_insert on public.portal_auditoria;

create policy portal_auditoria_admin_insert
  on public.portal_auditoria for insert
  to authenticated
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- defaults
insert into public.portal_configuracion (promedio_minimo, cert_bancario_max_dias, is_active)
select 3.50, 15, true
where not exists (select 1 from public.portal_configuracion);
