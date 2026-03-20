-- Cache local de bancos para no depender de la API externa en tiempo real.
create table if not exists public.catalog_bancos (
  id bigserial primary key,
  nombre text not null unique,
  is_active boolean not null default true,
  source text not null default 'seed_local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_bancos_nombre on public.catalog_bancos (lower(nombre));

-- Trigger de updated_at
create or replace function public.set_catalog_bancos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_catalog_bancos_updated_at on public.catalog_bancos;
create trigger trg_catalog_bancos_updated_at
before update on public.catalog_bancos
for each row
execute function public.set_catalog_bancos_updated_at();

alter table public.catalog_bancos enable row level security;

drop policy if exists read_catalog_bancos_authenticated on public.catalog_bancos;
create policy read_catalog_bancos_authenticated
on public.catalog_bancos
for select
to authenticated
using (
  is_active = true
  or exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid())
);

drop policy if exists write_catalog_bancos_admin on public.catalog_bancos;
create policy write_catalog_bancos_admin
on public.catalog_bancos
for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- Seed mínimo de bancos comunes en Colombia
insert into public.catalog_bancos (nombre, source)
values
  ('BANCO AGRARIO DE COLOMBIA', 'seed_local'),
  ('BANCO AV VILLAS', 'seed_local'),
  ('BANCO BBVA COLOMBIA', 'seed_local'),
  ('BANCO CAJA SOCIAL', 'seed_local'),
  ('BANCO COOMEVA', 'seed_local'),
  ('BANCO COLPATRIA', 'seed_local'),
  ('BANCO DAVIVIENDA', 'seed_local'),
  ('BANCO DE BOGOTA', 'seed_local'),
  ('BANCO DE OCCIDENTE', 'seed_local'),
  ('BANCO FALABELLA', 'seed_local'),
  ('BANCO GNB SUDAMERIS', 'seed_local'),
  ('BANCO ITAU', 'seed_local'),
  ('BANCO PICHINCHA', 'seed_local'),
  ('BANCO POPULAR', 'seed_local'),
  ('BANCO SANTANDER', 'seed_local'),
  ('BANCO SERFINANZA', 'seed_local'),
  ('BANCO W', 'seed_local'),
  ('BANCOLOMBIA', 'seed_local'),
  ('BANCOOMEVA', 'seed_local')
on conflict (nombre) do nothing;
