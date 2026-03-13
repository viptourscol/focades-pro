begin;

create table if not exists public.catalog_departamentos_colombia (
  id bigserial primary key,
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_municipios_colombia (
  id bigserial primary key,
  departamento_id bigint not null references public.catalog_departamentos_colombia(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (departamento_id, nombre)
);

create index if not exists idx_catalog_municipios_departamento_id
  on public.catalog_municipios_colombia(departamento_id);

create table if not exists public.catalog_establecimientos_educativos (
  id bigserial primary key,
  nombre text not null unique,
  municipio_id bigint null references public.catalog_municipios_colombia(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_establecimientos_municipio_id
  on public.catalog_establecimientos_educativos(municipio_id);

drop view if exists public.vw_catalog_municipios_colombia;

create view public.vw_catalog_municipios_colombia as
select
  m.id,
  m.nombre,
  d.nombre as departamento
from public.catalog_municipios_colombia m
join public.catalog_departamentos_colombia d on d.id = m.departamento_id;

alter table public.catalog_departamentos_colombia enable row level security;
alter table public.catalog_municipios_colombia enable row level security;
alter table public.catalog_establecimientos_educativos enable row level security;

drop policy if exists "read_catalog_departamentos_colombia" on public.catalog_departamentos_colombia;
create policy "read_catalog_departamentos_colombia"
on public.catalog_departamentos_colombia
for select
to anon, authenticated
using (true);

drop policy if exists "read_catalog_municipios_colombia" on public.catalog_municipios_colombia;
create policy "read_catalog_municipios_colombia"
on public.catalog_municipios_colombia
for select
to anon, authenticated
using (true);

drop policy if exists "read_catalog_establecimientos_educativos" on public.catalog_establecimientos_educativos;
create policy "read_catalog_establecimientos_educativos"
on public.catalog_establecimientos_educativos
for select
to anon, authenticated
using (true);

commit;
