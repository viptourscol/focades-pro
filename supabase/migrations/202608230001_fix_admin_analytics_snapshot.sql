-- Fix admin_analytics_snapshot para usar campos directos de portal_beneficiarios
-- Fecha: 2026-08-23
-- Los cambios recientes añadieron campos directos (genero, modalidad, nombre_universidad)
-- que tienen prioridad sobre los datos en inscripciones.datos_formulario (JSONB)

CREATE OR REPLACE FUNCTION public.admin_analytics_snapshot(
  p_year integer,
  p_convocatoria_id uuid DEFAULT NULL,
  p_modalidad text DEFAULT NULL,
  p_estado_beneficiario text DEFAULT NULL,
  p_universidad text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'El parametro p_year es invalido';
  END IF;

  IF NOT public.is_portal_admin(v_actor) THEN
    RAISE EXCEPTION 'Acceso denegado para analiticas admin' USING errcode = '42501';
  END IF;

  WITH ctx AS (
    SELECT
      pb.id AS beneficiario_id,
      pb.estado_beneficiario,
      pb.deleted_at,
      pb.semestre_actual,
      pb.auth_user_id,
      COALESCE(pb.convocatoria_id, i.convocatoria_id) AS convocatoria_id,
      COALESCE(NULLIF(BTRIM(pb.convocatoria_nombre), ''), NULLIF(BTRIM(c.nombre), ''), 'Sin convocatoria') AS convocatoria_label,
      
      -- MODALIDAD: Priorizar pb.modalidad_beca, luego pb.modalidad, luego JSONB
      CASE
        WHEN BTRIM(COALESCE(pb.modalidad_beca, '')) <> '' THEN 
          CASE
            WHEN LOWER(BTRIM(pb.modalidad_beca)) LIKE '%sue%' THEN 'Sueño Educativo'
            WHEN LOWER(BTRIM(pb.modalidad_beca)) LIKE '%meri%' THEN 'Mérito Educativo'
            ELSE INITCAP(LOWER(BTRIM(pb.modalidad_beca)))
          END
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%sue%' THEN 'Sueño Educativo'
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%meri%' THEN 'Mérito Educativo'
        WHEN BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', '')) <> '' THEN INITCAP(LOWER(BTRIM(i.datos_formulario ->> 'modalidad')))
        ELSE 'Sin dato'
      END AS modalidad_label,
      
      -- GÉNERO: Priorizar pb.genero, luego JSONB
      CASE
        WHEN BTRIM(COALESCE(pb.genero, '')) <> '' THEN
          CASE
            WHEN LOWER(BTRIM(pb.genero)) LIKE 'f%' OR LOWER(BTRIM(pb.genero)) LIKE '%femen%' THEN 'Femenino'
            WHEN LOWER(BTRIM(pb.genero)) LIKE 'm%' OR LOWER(BTRIM(pb.genero)) LIKE '%mascul%' THEN 'Masculino'
            WHEN LOWER(BTRIM(pb.genero)) LIKE '%no bin%' THEN 'No binario'
            WHEN LOWER(BTRIM(pb.genero)) LIKE '%otro%' THEN 'Otro'
            ELSE INITCAP(LOWER(BTRIM(pb.genero)))
          END
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) LIKE 'f%' THEN 'Femenino'
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) LIKE 'm%' THEN 'Masculino'
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) LIKE '%no bin%' THEN 'No binario'
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))) LIKE '%otro%' THEN 'Otro'
        WHEN BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', '')) <> '' THEN INITCAP(LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'genero', i.datos_formulario ->> 'sexo', ''))))
        ELSE 'Sin dato'
      END AS genero_label,
      
      -- UNIVERSIDAD: Priorizar pb.nombre_universidad, luego pb.institucion_superior, luego JSONB
      CASE
        WHEN BTRIM(COALESCE(pb.nombre_universidad, '')) <> '' THEN INITCAP(LOWER(BTRIM(pb.nombre_universidad)))
        WHEN BTRIM(COALESCE(pb.institucion_superior, '')) <> '' THEN INITCAP(LOWER(BTRIM(pb.institucion_superior)))
        WHEN BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' THEN 
          INITCAP(LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
        ELSE 'Sin dato'
      END AS universidad_label
    FROM public.portal_beneficiarios pb
    LEFT JOIN public.inscripciones i
      ON i.id = COALESCE(pb.inscripcion_pk, pb.inscripcion_id)
    LEFT JOIN public.convocatorias c
      ON c.id = COALESCE(pb.convocatoria_id, i.convocatoria_id)
    WHERE pb.deleted_at IS NULL
  ),
  filtered_ctx AS (
    SELECT *
    FROM ctx
    WHERE (p_convocatoria_id IS NULL OR convocatoria_id = p_convocatoria_id)
      AND (p_modalidad IS NULL OR modalidad_label = p_modalidad)
      AND (p_estado_beneficiario IS NULL OR estado_beneficiario = p_estado_beneficiario)
      AND (p_universidad IS NULL OR universidad_label = p_universidad)
  ),
  paid_payments AS (
    SELECT
      pp.beneficiario_id,
      pp.monto,
      COALESCE(pp.fecha_efectiva, pp.fecha_programada, pp.created_at::date) AS fecha_base
    FROM public.portal_beneficiario_pagos pp
    INNER JOIN filtered_ctx f
      ON f.beneficiario_id = pp.beneficiario_id
    WHERE LOWER(COALESCE(pp.estado, '')) = 'efectuado'
      AND EXTRACT(year FROM COALESCE(pp.fecha_efectiva, pp.fecha_programada, pp.created_at::date))::integer = p_year
  ),
  inscripciones_filtered AS (
    SELECT
      i.id,
      i.estado,
      i.promovido_a_beneficiario,
      c.anio,
      CASE
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%sue%' THEN 'Sueño Educativo'
        WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%meri%' THEN 'Mérito Educativo'
        WHEN BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', '')) <> '' THEN INITCAP(LOWER(BTRIM(i.datos_formulario ->> 'modalidad')))
        ELSE 'Sin dato'
      END AS modalidad_label,
      CASE
        WHEN BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' THEN 
          INITCAP(LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
        ELSE 'Sin dato'
      END AS universidad_label
    FROM public.inscripciones i
    LEFT JOIN public.convocatorias c ON c.id = i.convocatoria_id
    WHERE (
        (p_convocatoria_id IS NULL AND COALESCE(c.anio, p_year) = p_year)
        OR (p_convocatoria_id IS NOT NULL AND i.convocatoria_id = p_convocatoria_id)
      )
      AND (
        p_modalidad IS NULL
        OR (
          CASE
            WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%sue%' THEN 'Sueño Educativo'
            WHEN LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', ''))) LIKE '%meri%' THEN 'Mérito Educativo'
            WHEN BTRIM(COALESCE(i.datos_formulario ->> 'modalidad', '')) <> '' THEN INITCAP(LOWER(BTRIM(i.datos_formulario ->> 'modalidad')))
            ELSE 'Sin dato'
          END
        ) = p_modalidad
      )
      AND (
        p_universidad IS NULL
        OR (
          CASE
            WHEN BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', '')) <> '' THEN 
              INITCAP(LOWER(BTRIM(COALESCE(i.datos_formulario ->> 'institucion_superior', i.datos_formulario ->> 'universidad', ''))))
            ELSE 'Sin dato'
          END
        ) = p_universidad
      )
  ),
  actualizaciones_filtered AS (
    SELECT pa.estado
    FROM public.portal_actualizaciones pa
    INNER JOIN filtered_ctx f ON f.beneficiario_id = pa.beneficiario_id
  ),
  metrics AS (
    SELECT
      COUNT(*)::bigint AS total_beneficiarios,
      COUNT(*) FILTER (WHERE estado_beneficiario = 'activo')::bigint AS activos,
      COUNT(*) FILTER (WHERE estado_beneficiario = 'suspendido')::bigint AS suspendidos,
      COUNT(*) FILTER (WHERE estado_beneficiario = 'retirado')::bigint AS retirados,
      COALESCE((SELECT SUM(monto) FROM paid_payments), 0)::numeric AS total_desembolsado,
      COALESCE((SELECT AVG(monto) FROM paid_payments), 0)::numeric AS pago_promedio
    FROM filtered_ctx
  ),
  activos_modalidad AS (
    SELECT modalidad_label AS label, COUNT(*)::bigint AS value
    FROM filtered_ctx
    WHERE estado_beneficiario = 'activo'
    GROUP BY modalidad_label
    ORDER BY COUNT(*) DESC, modalidad_label
  ),
  estado_general AS (
    SELECT INITCAP(COALESCE(estado_beneficiario, 'sin estado')) AS label, COUNT(*)::bigint AS value
    FROM filtered_ctx
    GROUP BY INITCAP(COALESCE(estado_beneficiario, 'sin estado'))
    ORDER BY COUNT(*) DESC, label
  ),
  activos_genero AS (
    SELECT genero_label AS label, COUNT(*)::bigint AS value
    FROM filtered_ctx
    WHERE estado_beneficiario = 'activo'
    GROUP BY genero_label
    ORDER BY COUNT(*) DESC, genero_label
  ),
  desembolsos_convocatoria AS (
    SELECT f.convocatoria_label AS label, COALESCE(SUM(p.monto), 0)::numeric AS value
    FROM paid_payments p
    INNER JOIN filtered_ctx f ON f.beneficiario_id = p.beneficiario_id
    GROUP BY f.convocatoria_label
    ORDER BY SUM(p.monto) DESC, f.convocatoria_label
  ),
  universidades_ranking AS (
    SELECT f.universidad_label AS label, COALESCE(SUM(p.monto), 0)::numeric AS value
    FROM paid_payments p
    INNER JOIN filtered_ctx f ON f.beneficiario_id = p.beneficiario_id
    GROUP BY f.universidad_label
    ORDER BY SUM(p.monto) DESC, f.universidad_label
    LIMIT 5
  ),
  tendencia_pagos AS (
    SELECT
      m.mes,
      CASE m.mes
        WHEN 1 THEN 'Ene'
        WHEN 2 THEN 'Feb'
        WHEN 3 THEN 'Mar'
        WHEN 4 THEN 'Abr'
        WHEN 5 THEN 'May'
        WHEN 6 THEN 'Jun'
        WHEN 7 THEN 'Jul'
        WHEN 8 THEN 'Ago'
        WHEN 9 THEN 'Sep'
        WHEN 10 THEN 'Oct'
        WHEN 11 THEN 'Nov'
        ELSE 'Dic'
      END AS label,
      COALESCE(SUM(p.monto), 0)::numeric AS value
    FROM generate_series(1, 12) AS m(mes)
    LEFT JOIN paid_payments p
      ON EXTRACT(month FROM p.fecha_base)::integer = m.mes
    GROUP BY m.mes
    ORDER BY m.mes
  ),
  embudo AS (
    SELECT 'Inscritos'::text AS label, COUNT(*)::bigint AS value FROM inscripciones_filtered
    UNION ALL
    SELECT 'En revisión'::text AS label,
      COUNT(*) FILTER (
        WHERE LOWER(TRANSLATE(COALESCE(estado, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'en revision'
      )::bigint
    FROM inscripciones_filtered
    UNION ALL
    SELECT 'Admitidos'::text AS label,
      COUNT(*) FILTER (
        WHERE LOWER(TRANSLATE(COALESCE(estado, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = 'admitido'
      )::bigint
    FROM inscripciones_filtered
    UNION ALL
    SELECT 'Promovidos'::text AS label,
      COUNT(*) FILTER (WHERE promovido_a_beneficiario = TRUE)::bigint
    FROM inscripciones_filtered
  ),
  semestres AS (
    SELECT
      CASE WHEN COALESCE(semestre_actual, 0) > 0 THEN 'Semestre ' || semestre_actual::text ELSE 'Sin semestre' END AS label,
      COUNT(*)::bigint AS value
    FROM filtered_ctx
    WHERE estado_beneficiario = 'activo'
    GROUP BY CASE WHEN COALESCE(semestre_actual, 0) > 0 THEN 'Semestre ' || semestre_actual::text ELSE 'Sin semestre' END
    ORDER BY COUNT(*) DESC, label
  ),
  actualizaciones_estado AS (
    SELECT
      INITCAP(REPLACE(COALESCE(estado, 'sin estado'), '_', ' ')) AS label,
      COUNT(*)::bigint AS value
    FROM actualizaciones_filtered
    GROUP BY INITCAP(REPLACE(COALESCE(estado, 'sin estado'), '_', ' '))
    ORDER BY COUNT(*) DESC, label
  ),
  cobertura AS (
    SELECT 'Con acceso'::text AS label, COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL)::bigint AS value
    FROM filtered_ctx
    UNION ALL
    SELECT 'Pendientes'::text AS label, COUNT(*) FILTER (WHERE auth_user_id IS NULL)::bigint AS value
    FROM filtered_ctx
  ),
  options_modalidades AS (
    SELECT modalidad_label AS value
    FROM ctx
    WHERE modalidad_label <> 'Sin dato'
      AND (p_convocatoria_id IS NULL OR convocatoria_id = p_convocatoria_id)
      AND (p_estado_beneficiario IS NULL OR estado_beneficiario = p_estado_beneficiario)
    GROUP BY modalidad_label
    ORDER BY modalidad_label
  ),
  options_estados AS (
    SELECT COALESCE(estado_beneficiario, 'sin estado') AS value
    FROM public.portal_beneficiarios
    WHERE deleted_at IS NULL
    GROUP BY COALESCE(estado_beneficiario, 'sin estado')
    ORDER BY 1
  ),
  options_universidades AS (
    SELECT universidad_label AS value
    FROM ctx
    WHERE universidad_label <> 'Sin dato'
      AND (p_convocatoria_id IS NULL OR convocatoria_id = p_convocatoria_id)
      AND (p_modalidad IS NULL OR modalidad_label = p_modalidad)
      AND (p_estado_beneficiario IS NULL OR estado_beneficiario = p_estado_beneficiario)
    GROUP BY universidad_label
    ORDER BY universidad_label
    LIMIT 200
  ),
  options_years AS (
    SELECT anio AS value
    FROM public.convocatorias
    WHERE anio IS NOT NULL
    GROUP BY anio
    UNION
    SELECT EXTRACT(year FROM COALESCE(fecha_efectiva, fecha_programada, created_at::date))::integer AS value
    FROM public.portal_beneficiario_pagos
    GROUP BY EXTRACT(year FROM COALESCE(fecha_efectiva, fecha_programada, created_at::date))::integer
  )
  SELECT jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalBeneficiarios', COALESCE((SELECT total_beneficiarios FROM metrics), 0),
      'activos', COALESCE((SELECT activos FROM metrics), 0),
      'suspendidos', COALESCE((SELECT suspendidos FROM metrics), 0),
      'retirados', COALESCE((SELECT retirados FROM metrics), 0),
      'totalDesembolsado', COALESCE((SELECT total_desembolsado FROM metrics), 0),
      'pagoPromedio', COALESCE((SELECT pago_promedio FROM metrics), 0)
    ),
    'charts', jsonb_build_object(
      'activosPorModalidad', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM activos_modalidad), '[]'::jsonb),
      'beneficiariosPorEstado', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM estado_general), '[]'::jsonb),
      'activosPorGenero', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM activos_genero), '[]'::jsonb),
      'desembolsosPorConvocatoria', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM desembolsos_convocatoria), '[]'::jsonb),
      'topUniversidades', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM universidades_ranking), '[]'::jsonb),
      'tendenciaPagos', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value) ORDER BY mes) FROM tendencia_pagos), '[]'::jsonb),
      'embudoConvocatoria', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM embudo), '[]'::jsonb),
      'beneficiariosPorSemestre', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM semestres), '[]'::jsonb),
      'actualizacionesPorEstado', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM actualizaciones_estado), '[]'::jsonb),
      'coberturaPortal', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'value', value)) FROM cobertura), '[]'::jsonb)
    ),
    'options', jsonb_build_object(
      'modalidades', COALESCE((SELECT jsonb_agg(value) FROM options_modalidades), '[]'::jsonb),
      'estadosBeneficiario', COALESCE((SELECT jsonb_agg(value) FROM options_estados), '[]'::jsonb),
      'universidades', COALESCE((SELECT jsonb_agg(value) FROM options_universidades), '[]'::jsonb),
      'years', COALESCE((SELECT jsonb_agg(value ORDER BY value DESC) FROM options_years), '[]'::jsonb)
    )
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_analytics_snapshot(integer, uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_analytics_snapshot IS 'Snapshot analitico agregado que prioriza campos directos de portal_beneficiarios sobre datos_formulario JSONB';
