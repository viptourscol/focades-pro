begin;

-- Recrear vista de departamentos con el nombre de columna esperado
drop view if exists public.vw_catalog_departamentos_colombia;
create view public.vw_catalog_departamentos_colombia
with (security_invoker = true) as
select
  d.id,
  d.nombre as departamento
from public.catalog_departamentos_colombia d;

-- Recrear vista de municipios con el nombre de columna esperado
drop view if exists public.vw_catalog_municipios_colombia;
create view public.vw_catalog_municipios_colombia
with (security_invoker = true) as
select
  m.id,
  m.nombre as municipio,
  d.nombre as departamento
from public.catalog_municipios_colombia m
join public.catalog_departamentos_colombia d on d.id = m.departamento_id;

-- Mantener los permisos
grant select on public.vw_catalog_departamentos_colombia to anon, authenticated;
grant select on public.vw_catalog_municipios_colombia to anon, authenticated;

commit;
