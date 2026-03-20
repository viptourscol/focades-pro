-- Enriquecer esquema para que la carga historica se comporte como flujo normal.

alter table public.portal_beneficiarios
  add column if not exists programa_academico text,
  add column if not exists institucion_superior text,
  add column if not exists origen_registro text not null default 'normal';

alter table public.portal_beneficiarios
  drop constraint if exists portal_beneficiarios_origen_registro_check;

alter table public.portal_beneficiarios
  add constraint portal_beneficiarios_origen_registro_check
  check (origen_registro in ('normal', 'historico', 'migrado_manual'));

update public.portal_beneficiarios
set origen_registro = 'normal'
where origen_registro is null;

create index if not exists idx_portal_beneficiarios_origen_registro
  on public.portal_beneficiarios(origen_registro, created_at desc);
