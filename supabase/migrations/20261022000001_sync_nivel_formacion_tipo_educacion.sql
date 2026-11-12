-- Mantiene nivel_formacion en valores canonicos (PROFESIONAL, TECNOLOGICO, TECNICO)
-- derivandolos de nivel_formacion o tipo_educacion al insertar/actualizar.
create or replace function public.sync_nivel_formacion_beneficiario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_src text;
  v_valor text;
begin
  v_src := translate(
    upper(btrim(coalesce(nullif(btrim(new.nivel_formacion), ''), new.tipo_educacion, ''))),
    'ÁÉÍÓÚ', 'AEIOU'
  );

  v_valor := case
    when v_src like 'TECNOLOG%' then 'TECNOLOGICO'
    when v_src like 'TECNIC%' then 'TECNICO'
    when v_src like 'PROFESIONAL%' or v_src like 'UNIVERSIT%' then 'PROFESIONAL'
    else null
  end;

  if v_valor is not null then
    new.nivel_formacion := v_valor;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_nivel_formacion on public.portal_beneficiarios;
create trigger trg_sync_nivel_formacion
before insert or update of nivel_formacion, tipo_educacion
on public.portal_beneficiarios
for each row
execute function public.sync_nivel_formacion_beneficiario();
