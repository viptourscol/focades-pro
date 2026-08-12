-- Extender tabla portal_beneficiarios con campos académicos y bancarios
-- Esta migración agrega columnas para completar el perfil de beneficiarios

alter table public.portal_beneficiarios add column if not exists genero text; -- MASCULINO, FEMENINO, OTRO
alter table public.portal_beneficiarios add column if not exists nombre_colegio text;
alter table public.portal_beneficiarios add column if not exists nombre_universidad text;
alter table public.portal_beneficiarios add column if not exists programa_academico text;
alter table public.portal_beneficiarios add column if not exists tipo_educacion text; -- PROFESIONAL, TECNOLOGICO, TECNICO
alter table public.portal_beneficiarios add column if not exists modalidad_beca text; -- MÉRITO, SUEÑOS
alter table public.portal_beneficiarios add column if not exists año_convocatoria integer;

-- Campos bancarios
alter table public.portal_beneficiarios add column if not exists nombre_banco text;
alter table public.portal_beneficiarios add column if not exists numero_cuenta text;
alter table public.portal_beneficiarios add column if not exists tipo_cuenta_bancaria text; -- AHORROS, CORRIENTE

-- Campos de completitud de perfil
alter table public.portal_beneficiarios add column if not exists perfil_completado_en timestamptz;
alter table public.portal_beneficiarios add column if not exists perfil_incompleto_fields text[]; -- array de campos pendientes

-- Comentarios
comment on column public.portal_beneficiarios.genero is 'Género del beneficiario';
comment on column public.portal_beneficiarios.nombre_colegio is 'Nombre de la institución educativa de procedencia';
comment on column public.portal_beneficiarios.nombre_universidad is 'Nombre de la universidad donde estudia';
comment on column public.portal_beneficiarios.programa_academico is 'Programa académico (carrera, pregrado, etc)';
comment on column public.portal_beneficiarios.tipo_educacion is 'Tipo de educación: PROFESIONAL, TECNOLÓGICO, TÉCNICO';
comment on column public.portal_beneficiarios.modalidad_beca is 'Modalidad de la beca: MÉRITO, SUEÑOS, etc';
comment on column public.portal_beneficiarios.año_convocatoria is 'Año de la convocatoria a la que aplica';
comment on column public.portal_beneficiarios.nombre_banco is 'Entidad bancaria para disbursement';
comment on column public.portal_beneficiarios.numero_cuenta is 'Número de cuenta bancaria (sin espacios)';
comment on column public.portal_beneficiarios.tipo_cuenta_bancaria is 'Tipo de cuenta: AHORROS, CORRIENTE, etc';
comment on column public.portal_beneficiarios.perfil_completado_en is 'Timestamp cuando completó su perfil por primera vez';
comment on column public.portal_beneficiarios.perfil_incompleto_fields is 'Array de campos que faltan completar';

-- Índice para búsquedas por numero_cuenta
create index if not exists idx_portal_beneficiarios_numero_cuenta on public.portal_beneficiarios(numero_cuenta) where numero_cuenta is not null and numero_cuenta != '';

-- Índice para buscar perfiles incompletos
create index if not exists idx_portal_beneficiarios_perfil_incompleto on public.portal_beneficiarios(perfil_completado_en) where perfil_completado_en is null;
