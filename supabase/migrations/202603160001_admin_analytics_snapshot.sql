-- Analitica administrativa escalable: snapshot agregado para dashboard de analiticas.

create or replace function public.admin_analytics_snapshot(
  p_year integer,
  p_convocatoria_id uuid default null,
  p_modalidad text default null,
  p_estado_beneficiario text default null,
  p_universidad text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'El parametro p_year es invalido';
  end if;

  if not public.is_portal_admin(v_actor) then
    raise exception 'Acceso denegado para analiticas admin' using errcode = '42501';
  end if;

  with ctx as (
    select
      pb.id as beneficiario_id,
      pb.estado_beneficiario,
      pb.deleted_at,
      pb.semestre_actual,
      pb.auth_user_id,
      coalesce(pb.convocatoria_id, i.convocatoria_id) as convocatoria_id,
      coalesce(nullif(btrim(pb.convocatoria_nombre), ''), nullif(btrim(c.nombre), ''), 'Sin convocatoria') as convocatoria_label,
      case
        when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%sue%' then 'Sueño Educativo'
        when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%meri%' then 'Mérito Educativo'
        when btrim(coalesce(i.datos_formulario ->> 'modalidad', '')) <> '' then initcap(lower(btrim(i.datos_formulario ->> 'modalidad')))
        else 'Sin dato'
      end as modalidad_label,
      case
        when lower(btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) like 'f%' then 'Femenino'
        when lower(btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) like 'm%' then 'Masculino'
        when lower(btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) like '%no bin%' then 'No binario'
        when lower(btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) like '%otro%' then 'Otro'
        when btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', '')) <> '' then initcap(lower(btrim(coalesce(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))))
        else 'Sin dato'
      end as genero_label,
      case
        when btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' then initcap(lower(btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
        else 'Sin dato'
      end as universidad_label
    from public.portal_beneficiarios pb
    left join public.inscripciones i
      on i.id = coalesce(pb.inscripcion_pk, pb.inscripcion_id)
    left join public.convocatorias c
      on c.id = coalesce(pb.convocatoria_id, i.convocatoria_id)
    where pb.deleted_at is null
  ),
  filtered_ctx as (
    select *
    from ctx
    where (p_convocatoria_id is null or convocatoria_id = p_convocatoria_id)
      and (p_modalidad is null or modalidad_label = p_modalidad)
      and (p_estado_beneficiario is null or estado_beneficiario = p_estado_beneficiario)
      and (p_universidad is null or universidad_label = p_universidad)
  ),
  paid_payments as (
    select
      pp.beneficiario_id,
      pp.monto,
      coalesce(pp.fecha_efectiva, pp.fecha_programada, pp.created_at::date) as fecha_base
    from public.portal_beneficiario_pagos pp
    inner join filtered_ctx f
      on f.beneficiario_id = pp.beneficiario_id
    where lower(coalesce(pp.estado, '')) = 'efectuado'
      and extract(year from coalesce(pp.fecha_efectiva, pp.fecha_programada, pp.created_at::date))::integer = p_year
  ),
  inscripciones_filtered as (
    select
      i.id,
      i.estado,
      i.promovido_a_beneficiario,
      c.anio,
      case
        when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%sue%' then 'Sueño Educativo'
        when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%meri%' then 'Mérito Educativo'
        when btrim(coalesce(i.datos_formulario ->> 'modalidad', '')) <> '' then initcap(lower(btrim(i.datos_formulario ->> 'modalidad')))
        else 'Sin dato'
      end as modalidad_label,
      case
        when btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' then initcap(lower(btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
        else 'Sin dato'
      end as universidad_label
    from public.inscripciones i
    left join public.convocatorias c on c.id = i.convocatoria_id
    where (
        (p_convocatoria_id is null and coalesce(c.anio, p_year) = p_year)
        or (p_convocatoria_id is not null and i.convocatoria_id = p_convocatoria_id)
      )
      and (
        p_modalidad is null
        or (
          case
            when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%sue%' then 'Sueño Educativo'
            when lower(btrim(coalesce(i.datos_formulario ->> 'modalidad', ''))) like '%meri%' then 'Mérito Educativo'
            when btrim(coalesce(i.datos_formulario ->> 'modalidad', '')) <> '' then initcap(lower(btrim(i.datos_formulario ->> 'modalidad')))
            else 'Sin dato'
          end
        ) = p_modalidad
      )
      and (
        p_universidad is null
        or (
          case
            when btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' then initcap(lower(btrim(coalesce(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
            else 'Sin dato'
          end
        ) = p_universidad
      )
  ),
  actualizaciones_filtered as (
    select pa.estado
    from public.portal_actualizaciones pa
    inner join filtered_ctx f on f.beneficiario_id = pa.beneficiario_id
  ),
  metrics as (
    select
      count(*)::bigint as total_beneficiarios,
      count(*) filter (where estado_beneficiario = 'activo')::bigint as activos,
      count(*) filter (where estado_beneficiario = 'suspendido')::bigint as suspendidos,
      count(*) filter (where estado_beneficiario = 'retirado')::bigint as retirados,
      coalesce((select sum(monto) from paid_payments), 0)::numeric as total_desembolsado,
      coalesce((select avg(monto) from paid_payments), 0)::numeric as pago_promedio
    from filtered_ctx
  ),
  activos_modalidad as (
    select modalidad_label as label, count(*)::bigint as value
    from filtered_ctx
    where estado_beneficiario = 'activo'
    group by modalidad_label
    order by count(*) desc, modalidad_label
  ),
  estado_general as (
    select initcap(coalesce(estado_beneficiario, 'sin estado')) as label, count(*)::bigint as value
    from filtered_ctx
    group by initcap(coalesce(estado_beneficiario, 'sin estado'))
    order by count(*) desc, label
  ),
  activos_genero as (
    select genero_label as label, count(*)::bigint as value
    from filtered_ctx
    where estado_beneficiario = 'activo'
    group by genero_label
    order by count(*) desc, genero_label
  ),
  desembolsos_convocatoria as (
    select f.convocatoria_label as label, coalesce(sum(p.monto), 0)::numeric as value
    from paid_payments p
    inner join filtered_ctx f on f.beneficiario_id = p.beneficiario_id
    group by f.convocatoria_label
    order by sum(p.monto) desc, f.convocatoria_label
  ),
  universidades_ranking as (
    select f.universidad_label as label, coalesce(sum(p.monto), 0)::numeric as value
    from paid_payments p
    inner join filtered_ctx f on f.beneficiario_id = p.beneficiario_id
    group by f.universidad_label
    order by sum(p.monto) desc, f.universidad_label
    limit 5
  ),
  tendencia_pagos as (
    select
      m.mes,
      case m.mes
        when 1 then 'Ene'
        when 2 then 'Feb'
        when 3 then 'Mar'
        when 4 then 'Abr'
        when 5 then 'May'
        when 6 then 'Jun'
        when 7 then 'Jul'
        when 8 then 'Ago'
        when 9 then 'Sep'
        when 10 then 'Oct'
        when 11 then 'Nov'
        else 'Dic'
      end as label,
      coalesce(sum(p.monto), 0)::numeric as value
    from generate_series(1, 12) as m(mes)
    left join paid_payments p
      on extract(month from p.fecha_base)::integer = m.mes
    group by m.mes
    order by m.mes
  ),
  embudo as (
    select 'Inscritos'::text as label, count(*)::bigint as value from inscripciones_filtered
    union all
    select 'En revisión'::text as label,
      count(*) filter (
        where lower(translate(coalesce(estado, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'en revision'
      )::bigint
    from inscripciones_filtered
    union all
    select 'Admitidos'::text as label,
      count(*) filter (
        where lower(translate(coalesce(estado, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'admitido'
      )::bigint
    from inscripciones_filtered
    union all
    select 'Promovidos'::text as label,
      count(*) filter (where promovido_a_beneficiario = true)::bigint
    from inscripciones_filtered
  ),
  semestres as (
    select
      case when coalesce(semestre_actual, 0) > 0 then 'Semestre ' || semestre_actual::text else 'Sin semestre' end as label,
      count(*)::bigint as value
    from filtered_ctx
    where estado_beneficiario = 'activo'
    group by case when coalesce(semestre_actual, 0) > 0 then 'Semestre ' || semestre_actual::text else 'Sin semestre' end
    order by count(*) desc, label
  ),
  actualizaciones_estado as (
    select
      initcap(replace(coalesce(estado, 'sin estado'), '_', ' ')) as label,
      count(*)::bigint as value
    from actualizaciones_filtered
    group by initcap(replace(coalesce(estado, 'sin estado'), '_', ' '))
    order by count(*) desc, label
  ),
  cobertura as (
    select 'Con acceso'::text as label, count(*) filter (where auth_user_id is not null)::bigint as value
    from filtered_ctx
    union all
    select 'Pendientes'::text as label, count(*) filter (where auth_user_id is null)::bigint as value
    from filtered_ctx
  ),
  options_modalidades as (
    select modalidad_label as value
    from ctx
    where modalidad_label <> 'Sin dato'
      and (p_convocatoria_id is null or convocatoria_id = p_convocatoria_id)
      and (p_estado_beneficiario is null or estado_beneficiario = p_estado_beneficiario)
    group by modalidad_label
    order by modalidad_label
  ),
  options_estados as (
    select coalesce(estado_beneficiario, 'sin estado') as value
    from public.portal_beneficiarios
    where deleted_at is null
    group by coalesce(estado_beneficiario, 'sin estado')
    order by 1
  ),
  options_universidades as (
    select universidad_label as value
    from ctx
    where universidad_label <> 'Sin dato'
      and (p_convocatoria_id is null or convocatoria_id = p_convocatoria_id)
      and (p_modalidad is null or modalidad_label = p_modalidad)
      and (p_estado_beneficiario is null or estado_beneficiario = p_estado_beneficiario)
    group by universidad_label
    order by universidad_label
    limit 200
  ),
  options_years as (
    select anio as value
    from public.convocatorias
    where anio is not null
    group by anio
    union
    select extract(year from coalesce(fecha_efectiva, fecha_programada, created_at::date))::integer as value
    from public.portal_beneficiario_pagos
    group by extract(year from coalesce(fecha_efectiva, fecha_programada, created_at::date))::integer
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalBeneficiarios', coalesce((select total_beneficiarios from metrics), 0),
      'activos', coalesce((select activos from metrics), 0),
      'suspendidos', coalesce((select suspendidos from metrics), 0),
      'retirados', coalesce((select retirados from metrics), 0),
      'totalDesembolsado', coalesce((select total_desembolsado from metrics), 0),
      'pagoPromedio', coalesce((select pago_promedio from metrics), 0)
    ),
    'charts', jsonb_build_object(
      'activosPorModalidad', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from activos_modalidad), '[]'::jsonb),
      'beneficiariosPorEstado', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from estado_general), '[]'::jsonb),
      'activosPorGenero', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from activos_genero), '[]'::jsonb),
      'desembolsosPorConvocatoria', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from desembolsos_convocatoria), '[]'::jsonb),
      'topUniversidades', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from universidades_ranking), '[]'::jsonb),
      'tendenciaPagos', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value) order by mes) from tendencia_pagos), '[]'::jsonb),
      'embudoConvocatoria', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from embudo), '[]'::jsonb),
      'beneficiariosPorSemestre', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from semestres), '[]'::jsonb),
      'actualizacionesPorEstado', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from actualizaciones_estado), '[]'::jsonb),
      'coberturaPortal', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from cobertura), '[]'::jsonb)
    ),
    'options', jsonb_build_object(
      'modalidades', coalesce((select jsonb_agg(value) from options_modalidades), '[]'::jsonb),
      'estadosBeneficiario', coalesce((select jsonb_agg(value) from options_estados), '[]'::jsonb),
      'universidades', coalesce((select jsonb_agg(value) from options_universidades), '[]'::jsonb),
      'years', coalesce((select jsonb_agg(value order by value desc) from options_years), '[]'::jsonb)
    )
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.admin_analytics_snapshot(integer, uuid, text, text, text) to authenticated;
