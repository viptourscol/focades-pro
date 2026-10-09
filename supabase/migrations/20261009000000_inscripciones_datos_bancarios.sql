-- Registro.jsx guarda banco, tipo y numero de cuenta al legalizar; la columna nunca se habia creado.
alter table public.inscripciones
  add column if not exists datos_bancarios jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscripciones'::regclass
      and conname = 'inscripciones_datos_bancarios_objeto'
  ) then
    alter table public.inscripciones
      add constraint inscripciones_datos_bancarios_objeto
      check (datos_bancarios is null or jsonb_typeof(datos_bancarios) = 'object');
  end if;
end
$$;

comment on column public.inscripciones.datos_bancarios is
  'Datos bancarios del aspirante en legalizacion: banco, tipo_cuenta, numero_cuenta.';

notify pgrst, 'reload schema';
