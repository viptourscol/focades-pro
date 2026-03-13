-- Corrección: inscripciones.id es uuid, no bigint.
-- Ajusta la columna inscripcion_pk y recrea la función con el tipo correcto.

-- 1. Quitar la función con firma bigint
drop function if exists public.promover_inscripcion_a_beneficiario(bigint, integer, boolean);

-- 2. Ajustar inscripcion_pk a uuid (estaba bigint por error de asunción de tipo)
alter table public.portal_beneficiarios
  alter column inscripcion_pk type uuid using inscripcion_pk::text::uuid;

-- 3. Recrear la función con p_inscripcion_id uuid
create or replace function public.promover_inscripcion_a_beneficiario(
  p_inscripcion_id uuid,
  p_semestre_actual integer default null,
  p_forzar boolean default false
)
returns table (
  ok boolean,
  beneficiario_id bigint,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_inscripcion record;
  v_persona record;
  v_beneficiario_id bigint;
  v_etapa text;
  v_cert_requerido boolean;
  v_cert_path text;
  v_nombre text;
  v_tipo_documento text;
  v_documento text;
  v_email text;
  v_convocatoria_nombre text;
begin
  if v_admin_user_id is null then
    return query select false, null::bigint, 'Debes iniciar sesion para ejecutar esta operacion.';
    return;
  end if;

  if not exists (
    select 1 from public.portal_admin_users a where a.user_id = v_admin_user_id
  ) then
    return query select false, null::bigint, 'Solo administradores pueden promover aspirantes.';
    return;
  end if;

  select *
  into v_inscripcion
  from public.inscripciones i
  where i.id = p_inscripcion_id
  limit 1;

  if v_inscripcion is null then
    return query select false, null::bigint, 'No se encontro la inscripcion indicada.';
    return;
  end if;

  if coalesce(v_inscripcion.promovido_a_beneficiario, false) and v_inscripcion.beneficiario_portal_id is not null then
    return query select true, v_inscripcion.beneficiario_portal_id, 'La inscripcion ya fue promovida previamente.';
    return;
  end if;

  v_etapa := lower(trim(coalesce(v_inscripcion.etapa, '')));
  v_cert_requerido := coalesce(v_inscripcion.cert_bancario_requerido, false);

  v_cert_path := coalesce(
    nullif(trim(v_inscripcion.certificado_bancario), ''),
    nullif(trim(v_inscripcion.soportes ->> 'certificado_bancario'), ''),
    nullif(trim(v_inscripcion.datos_formulario -> 'soportes' ->> 'certificado_bancario'), '')
  );

  if not p_forzar then
    if not (v_etapa = 'legalizacion' and v_cert_requerido and coalesce(v_cert_path, '') <> '') then
      return query select false, null::bigint, 'Solo se puede promover cuando este en legalizacion con certificado bancario cargado.';
      return;
    end if;
  end if;

  select p.*
  into v_persona
  from public.personas p
  where p.id = v_inscripcion.persona_id
  limit 1;

  v_nombre := coalesce(
    nullif(trim(v_persona.nombre_completo), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'nombre_completo'), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'nombre'), ''),
    'Beneficiario'
  );

  v_tipo_documento := coalesce(
    nullif(trim(v_persona.tipo_documento), ''),
    nullif(trim(v_inscripcion.tipo_documento), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'tipo_documento'), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'tipo_id'), ''),
    'CC'
  );

  v_documento := coalesce(
    nullif(trim(v_persona.n_documento), ''),
    nullif(trim(v_inscripcion.n_documento), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'n_documento'), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'documento'), ''),
    nullif(trim(v_inscripcion.radicado), '')
  );

  v_email := lower(coalesce(
    nullif(trim(v_persona.email), ''),
    nullif(trim(v_inscripcion.email), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'email'), ''),
    nullif(trim(v_inscripcion.datos_formulario ->> 'correo_electronico'), '')
  ));

  select c.nombre
  into v_convocatoria_nombre
  from public.convocatorias c
  where c.id = v_inscripcion.convocatoria_id
  limit 1;

  insert into public.portal_beneficiarios (
    persona_id,
    inscripcion_pk,
    inscripcion_id,
    convocatoria_id,
    convocatoria_nombre,
    radicado_inscripcion,
    nombre_completo,
    tipo_documento,
    n_documento,
    email,
    telefono,
    direccion,
    semestre_actual,
    estado_beneficiario,
    created_at,
    updated_at
  ) values (
    v_inscripcion.persona_id,
    v_inscripcion.id,
    null,
    v_inscripcion.convocatoria_id,
    v_convocatoria_nombre,
    v_inscripcion.radicado,
    v_nombre,
    upper(v_tipo_documento),
    v_documento,
    v_email,
    coalesce(
      nullif(trim(v_inscripcion.datos_formulario ->> 'telefono'), ''),
      nullif(trim(v_inscripcion.datos_formulario ->> 'n_celular'), '')
    ),
    nullif(trim(v_inscripcion.datos_formulario ->> 'direccion_residencia'), ''),
    nullif(p_semestre_actual, 0),
    'activo',
    now(),
    now()
  )
  returning id into v_beneficiario_id;

  insert into public.portal_beneficiario_estado_historial (
    beneficiario_id,
    estado_anterior,
    estado_nuevo,
    motivo,
    actor_user_id,
    actor_email,
    created_at
  ) values (
    v_beneficiario_id,
    null,
    'activo',
    format('Promovido desde inscripcion %s', coalesce(v_inscripcion.radicado, '#' || v_inscripcion.id::text)),
    v_admin_user_id,
    coalesce(v_email, ''),
    now()
  );

  update public.inscripciones
  set
    promovido_a_beneficiario = true,
    promovido_at = now(),
    promovido_por_user_id = v_admin_user_id,
    beneficiario_portal_id = v_beneficiario_id,
    updated_at = now()
  where id = v_inscripcion.id;

  return query select true, v_beneficiario_id, 'Aspirante promovido correctamente a beneficiario activo.';
exception
  when others then
    return query select false, null::bigint, coalesce(SQLERRM, 'Error no controlado durante la promocion.');
end;
$$;

grant execute on function public.promover_inscripcion_a_beneficiario(uuid, integer, boolean) to authenticated;
