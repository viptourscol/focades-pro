alter table if exists public.inscripciones
  add column if not exists etapa text not null default 'aspirante';

alter table if exists public.inscripciones
  add column if not exists observacion_publica text;

alter table if exists public.inscripciones
  add column if not exists permite_reemplazo_soportes boolean not null default false;

alter table if exists public.inscripciones
  add column if not exists cert_bancario_requerido boolean not null default false;
