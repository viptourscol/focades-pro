-- Derechos de pago por beneficiario: topes por nivel, semestre de ingreso y validacion de sobrepagos.

alter table public.portal_beneficiarios
  add column if not exists nivel_formacion text,
  add column if not exists modalidad text,
  add column if not exists semestre_ingreso integer;

create index if not exists idx_portal_beneficiarios_nivel_semestre
  on public.portal_beneficiarios(nivel_formacion, semestre_ingreso);

create table if not exists public.portal_beneficiario_pago_ajustes (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  ajuste_pagos integer not null,
  motivo text not null,
  nota text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_benef_pago_ajustes_beneficiario
  on public.portal_beneficiario_pago_ajustes(beneficiario_id, created_at desc);

alter table public.portal_beneficiario_pago_ajustes enable row level security;

drop policy if exists portal_benef_pagos_self_select on public.portal_beneficiario_pagos;
create policy portal_benef_pagos_self_select
  on public.portal_beneficiario_pagos for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_beneficiarios b
      where b.id = beneficiario_id
        and b.auth_user_id = auth.uid()
    )
    or public.is_portal_admin(auth.uid())
  );

drop policy if exists portal_benef_pago_ajustes_admin_all on public.portal_beneficiario_pago_ajustes;
create policy portal_benef_pago_ajustes_admin_all
  on public.portal_beneficiario_pago_ajustes for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

update public.portal_beneficiarios b
set
  nivel_formacion = coalesce(
    nullif(trim(b.nivel_formacion), ''),
    nullif(trim(i.datos_formulario ->> 'nivel_formacion'), '')
  ),
  modalidad = coalesce(
    nullif(trim(b.modalidad), ''),
    nullif(trim(coalesce(i.datos_formulario ->> 'modalidad', i.datos_formulario ->> 'modalidad_aspira')), '')
  ),
  semestre_ingreso = coalesce(
    b.semestre_ingreso,
    nullif(regexp_replace(coalesce(i.datos_formulario ->> 'semestre_ingreso', ''), '[^0-9]', '', 'g'), '')::integer
  )
from public.inscripciones i
where i.id = coalesce(b.inscripcion_pk, b.inscripcion_id)
  and (
    b.nivel_formacion is null
    or b.modalidad is null
    or b.semestre_ingreso is null
  );

create or replace function public.normalize_beneficiario_level(p_nivel text)
returns text
language sql
immutable
as $$
  select case
    when p_nivel is null or btrim(p_nivel) = '' then null
    when lower(btrim(p_nivel)) like '%tecnol%' then 'tecnologo'
    when lower(btrim(p_nivel)) like '%tecnic%' then 'tecnico'
    when lower(btrim(p_nivel)) like '%universi%' then 'profesional'
    when lower(btrim(p_nivel)) like '%pregrado%' then 'profesional'
    when lower(btrim(p_nivel)) like '%profesional%' then 'profesional'
    else null
  end;
$$;

create or replace function public.payment_cap_for_level(p_nivel text)
returns integer
language sql
immutable
as $$
  select case public.normalize_beneficiario_level(p_nivel)
    when 'tecnico' then 4
    when 'tecnologo' then 6
    when 'profesional' then 10
    else null
  end;
$$;

create or replace function public.compute_beneficiario_payment_rights(
  p_beneficiario_id bigint,
  p_exclude_payment_id bigint default null
)
returns table (
  beneficiario_id bigint,
  nivel_formacion text,
  nivel_normalizado text,
  modalidad text,
  semestre_ingreso integer,
  semestre_referencia integer,
  tope_pagos integer,
  derecho_inicial integer,
  ajustes_netos integer,
  derecho_total integer,
  pagos_efectuados integer,
  pagos_restantes integer,
  estado_beneficiario text,
  es_elegible boolean,
  motivo_bloqueo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_beneficiario public.portal_beneficiarios%rowtype;
  v_nivel_normalizado text;
  v_tope integer;
  v_semestre_base integer;
  v_derecho_inicial integer;
  v_ajustes integer := 0;
  v_pagos_efectuados integer := 0;
  v_derecho_total integer;
  v_pagos_restantes integer;
  v_es_elegible boolean := false;
  v_motivo_bloqueo text := null;
begin
  select *
  into v_beneficiario
  from public.portal_beneficiarios
  where id = p_beneficiario_id;

  if not found then
    raise exception 'Beneficiario no encontrado.';
  end if;

  v_nivel_normalizado := public.normalize_beneficiario_level(v_beneficiario.nivel_formacion);
  v_tope := public.payment_cap_for_level(v_beneficiario.nivel_formacion);
  v_semestre_base := greatest(coalesce(v_beneficiario.semestre_ingreso, v_beneficiario.semestre_actual, 1), 1);

  if v_tope is null then
    v_derecho_inicial := 0;
    v_motivo_bloqueo := 'Nivel de formacion no configurado para derechos de pago.';
  else
    v_derecho_inicial := greatest(0, v_tope - (v_semestre_base - 1));
  end if;

  select coalesce(sum(a.ajuste_pagos), 0)
  into v_ajustes
  from public.portal_beneficiario_pago_ajustes a
  where a.beneficiario_id = p_beneficiario_id
    and a.is_active = true;

  select count(*)
  into v_pagos_efectuados
  from public.portal_beneficiario_pagos p
  where p.beneficiario_id = p_beneficiario_id
    and p.estado = 'efectuado'
    and (p_exclude_payment_id is null or p.id <> p_exclude_payment_id);

  v_derecho_total := greatest(0, v_derecho_inicial + v_ajustes);
  v_pagos_restantes := greatest(0, v_derecho_total - v_pagos_efectuados);

  if v_beneficiario.deleted_at is not null then
    v_es_elegible := false;
    v_motivo_bloqueo := coalesce(v_motivo_bloqueo, 'Beneficiario eliminado logicamente.');
  elsif coalesce(v_beneficiario.estado_beneficiario, 'activo') <> 'activo' then
    v_es_elegible := false;
    v_motivo_bloqueo := coalesce(v_motivo_bloqueo, 'El beneficiario no esta en estado activo.');
  elsif v_tope is null then
    v_es_elegible := false;
  elsif v_pagos_restantes <= 0 then
    v_es_elegible := false;
    v_motivo_bloqueo := coalesce(v_motivo_bloqueo, 'El beneficiario ya agotó sus cupos de pago.');
  else
    v_es_elegible := true;
  end if;

  return query
  select
    v_beneficiario.id,
    v_beneficiario.nivel_formacion,
    v_nivel_normalizado,
    v_beneficiario.modalidad,
    v_beneficiario.semestre_ingreso,
    v_semestre_base,
    v_tope,
    v_derecho_inicial,
    v_ajustes,
    v_derecho_total,
    v_pagos_efectuados,
    v_pagos_restantes,
    v_beneficiario.estado_beneficiario,
    v_es_elegible,
    v_motivo_bloqueo;
end;
$$;

create or replace function public.admin_beneficiario_payment_rights(
  p_beneficiario_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rights record;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden consultar derechos de pago.';
  end if;

  select *
  into v_rights
  from public.compute_beneficiario_payment_rights(p_beneficiario_id);

  return jsonb_build_object(
    'beneficiarioId', v_rights.beneficiario_id,
    'nivelFormacion', v_rights.nivel_formacion,
    'nivelNormalizado', v_rights.nivel_normalizado,
    'modalidad', v_rights.modalidad,
    'semestreIngreso', v_rights.semestre_ingreso,
    'semestreReferencia', v_rights.semestre_referencia,
    'topePagos', v_rights.tope_pagos,
    'derechoInicial', v_rights.derecho_inicial,
    'ajustesNetos', v_rights.ajustes_netos,
    'derechoTotal', v_rights.derecho_total,
    'pagosEfectuados', v_rights.pagos_efectuados,
    'pagosRestantes', v_rights.pagos_restantes,
    'estadoBeneficiario', v_rights.estado_beneficiario,
    'esElegible', v_rights.es_elegible,
    'motivoBloqueo', v_rights.motivo_bloqueo
  );
end;
$$;

revoke all on function public.admin_beneficiario_payment_rights(bigint) from public;
grant execute on function public.admin_beneficiario_payment_rights(bigint) to authenticated;

create or replace function public.beneficiario_payment_rights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_beneficiario_id bigint;
  v_rights record;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesion para consultar tus derechos de pago.';
  end if;

  select b.id
  into v_beneficiario_id
  from public.portal_beneficiarios b
  where b.auth_user_id = v_actor
    and b.deleted_at is null
  order by b.updated_at desc nulls last
  limit 1;

  if v_beneficiario_id is null then
    raise exception 'No existe un beneficiario vinculado a tu cuenta.';
  end if;

  select *
  into v_rights
  from public.compute_beneficiario_payment_rights(v_beneficiario_id);

  return jsonb_build_object(
    'beneficiarioId', v_rights.beneficiario_id,
    'nivelFormacion', v_rights.nivel_formacion,
    'nivelNormalizado', v_rights.nivel_normalizado,
    'modalidad', v_rights.modalidad,
    'semestreIngreso', v_rights.semestre_ingreso,
    'semestreReferencia', v_rights.semestre_referencia,
    'topePagos', v_rights.tope_pagos,
    'derechoInicial', v_rights.derecho_inicial,
    'ajustesNetos', v_rights.ajustes_netos,
    'derechoTotal', v_rights.derecho_total,
    'pagosEfectuados', v_rights.pagos_efectuados,
    'pagosRestantes', v_rights.pagos_restantes,
    'estadoBeneficiario', v_rights.estado_beneficiario,
    'esElegible', v_rights.es_elegible,
    'motivoBloqueo', v_rights.motivo_bloqueo
  );
end;
$$;

revoke all on function public.beneficiario_payment_rights() from public;
grant execute on function public.beneficiario_payment_rights() to authenticated;

create or replace function public.validate_beneficiario_pago_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rights record;
begin
  if coalesce(new.estado, 'programado') <> 'efectuado' then
    return new;
  end if;

  select *
  into v_rights
  from public.compute_beneficiario_payment_rights(
    new.beneficiario_id,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if not v_rights.es_elegible then
    raise exception '%', coalesce(v_rights.motivo_bloqueo, 'Beneficiario sin elegibilidad para registrar pagos efectuados.');
  end if;

  if coalesce(v_rights.pagos_restantes, 0) < 1 then
    raise exception 'El beneficiario no tiene cupos de pago restantes.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_beneficiario_pago_rights on public.portal_beneficiario_pagos;
create trigger trg_validate_beneficiario_pago_rights
before insert or update of estado, beneficiario_id
on public.portal_beneficiario_pagos
for each row
execute function public.validate_beneficiario_pago_rights();

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
  v_nivel_formacion text;
  v_modalidad text;
  v_semestre_ingreso integer;
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

  v_nivel_formacion := nullif(trim(v_inscripcion.datos_formulario ->> 'nivel_formacion'), '');
  v_modalidad := nullif(trim(coalesce(v_inscripcion.datos_formulario ->> 'modalidad', v_inscripcion.datos_formulario ->> 'modalidad_aspira')), '');
  v_semestre_ingreso := nullif(regexp_replace(coalesce(v_inscripcion.datos_formulario ->> 'semestre_ingreso', ''), '[^0-9]', '', 'g'), '')::integer;

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
    semestre_ingreso,
    nivel_formacion,
    modalidad,
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
    v_semestre_ingreso,
    v_nivel_formacion,
    v_modalidad,
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
