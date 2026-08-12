-- Tabla de credenciales alternativas para login por documento + contraseña
-- Permite a beneficiarios autenticarse sin depender solo de Google

create table if not exists public.portal_auth_credentials (
  id bigserial primary key,
  beneficiario_id bigint not null unique references public.portal_beneficiarios(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  document_number text not null,
  email_verified text, -- email verificado para recuperación
  password_hash text, -- bcrypt hash, null si no tiene contraseña establecida
  setup_completed_at timestamptz, -- cuando completó el setup inicial
  setup_token text unique, -- token temporal para setup
  setup_token_expires_at timestamptz,
  password_reset_token text unique, -- token para recuperación de contraseña
  password_reset_token_expires_at timestamptz,
  last_password_change_at timestamptz,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (password_hash is null or length(password_hash) > 20) -- bcrypt es ~60 chars
);

create index if not exists idx_portal_auth_credentials_beneficiario on public.portal_auth_credentials(beneficiario_id);
create index if not exists idx_portal_auth_credentials_auth_user on public.portal_auth_credentials(auth_user_id);
create index if not exists idx_portal_auth_credentials_document on public.portal_auth_credentials(document_number);
-- Índices para tokens (sin predicado now() - la app valida expiración)
create index if not exists idx_portal_auth_credentials_setup_token on public.portal_auth_credentials(setup_token) where setup_token is not null;
create index if not exists idx_portal_auth_credentials_reset_token on public.portal_auth_credentials(password_reset_token) where password_reset_token is not null;

alter table public.portal_auth_credentials enable row level security;

-- Beneficiario puede ver su propio registro
drop policy if exists portal_auth_credentials_self_select on public.portal_auth_credentials;
create policy portal_auth_credentials_self_select
  on public.portal_auth_credentials for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
  );

-- Beneficiario puede actualizar su propio registro (excepto campos sensibles)
drop policy if exists portal_auth_credentials_self_update on public.portal_auth_credentials;
create policy portal_auth_credentials_self_update
  on public.portal_auth_credentials for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Admin tiene acceso total
drop policy if exists portal_auth_credentials_admin_all on public.portal_auth_credentials;
create policy portal_auth_credentials_admin_all
  on public.portal_auth_credentials for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- Tabla de historial de intentos de login (para auditoría y seguridad)
create table if not exists public.portal_auth_login_attempts (
  id bigserial primary key,
  beneficiario_id bigint references public.portal_beneficiarios(id) on delete cascade,
  auth_credentials_id bigint references public.portal_auth_credentials(id) on delete cascade,
  method text not null, -- 'google', 'document_password'
  success boolean not null,
  ip_address text,
  user_agent text,
  error_reason text, -- si success=false
  created_at timestamptz not null default now(),
  check (method in ('google', 'document_password'))
);

create index if not exists idx_portal_auth_attempts_beneficiario on public.portal_auth_login_attempts(beneficiario_id, created_at desc);
create index if not exists idx_portal_auth_attempts_credentials on public.portal_auth_login_attempts(auth_credentials_id, created_at desc);

alter table public.portal_auth_login_attempts enable row level security;

-- Solo admin puede ver historial
drop policy if exists portal_auth_attempts_admin_all on public.portal_auth_login_attempts;
create policy portal_auth_attempts_admin_all
  on public.portal_auth_login_attempts for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));
