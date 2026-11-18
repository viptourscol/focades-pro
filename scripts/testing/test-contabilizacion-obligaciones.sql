-- Regresión transaccional del flujo OP aprobado -> CargueContabilizacionObligaciones.
BEGIN;
DO $$
DECLARE
  v_contabilidad UUID;
  v_convocatoria UUID;
  v_rp_id UUID;
  v_editado_en TIMESTAMPTZ;
  v_aprobacion JSONB;
  v_op JSONB;
  v_contabilizacion JSONB;
  v_opcionales JSONB;
  v_clases JSONB;
BEGIN
  SELECT u.id INTO v_contabilidad
  FROM auth.users u
  JOIN public.portal_admin_users a ON a.user_id = u.id AND a.is_active
  WHERE u.raw_app_meta_data->'roles' @> '["admin_contabilidad"]'::JSONB
     OR u.raw_app_meta_data->>'role' = 'admin_contabilidad'
  ORDER BY u.created_at
  LIMIT 1;
  IF v_contabilidad IS NULL THEN
    RAISE EXCEPTION 'No hay un usuario activo con rol admin_contabilidad para la regresión.';
  END IF;

  SELECT d.convocatoria_id, d.id INTO v_convocatoria, v_rp_id
  FROM public.portal_documentos_cargue d
  WHERE d.tipo_documento = 'rp'
    AND d.estado IN ('aprobado', 'finalizado')
    AND d.aprobado_por IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.portal_valores_cargue v WHERE v.documento_id = d.id)
  ORDER BY d.aprobado_en DESC NULLS LAST, d.id
  LIMIT 1;
  IF v_rp_id IS NULL THEN
    RAISE EXCEPTION 'No hay un RP aprobado con filas para probar la contabilización.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_contabilidad::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_contabilidad, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;

  v_op := public.leer_op_desde_rp(v_convocatoria, v_rp_id);
  SELECT COALESCE(jsonb_object_agg(f->>'id', jsonb_build_object('estado', '', 'clase', '')),
    '{}'::JSONB)
  INTO v_opcionales
  FROM jsonb_array_elements(v_op->'filas') AS filas(f);
  v_editado_en := public.guardar_op_desde_rp(
    v_convocatoria, v_rp_id, DATE '2026-11-18', '2026.ALC.01.001249', '1',
    v_opcionales, NULL
  );

  BEGIN
    PERFORM public.leer_contabilizacion_op(v_convocatoria, v_rp_id);
    RAISE EXCEPTION 'Permitió abrir contabilización antes de aprobar el OP.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Permitió abrir contabilización antes de aprobar el OP.' THEN RAISE; END IF;
  END;

  v_aprobacion := public.aprobar_op_desde_rp(v_convocatoria, v_rp_id, v_editado_en);
  IF v_aprobacion->>'estado_op' <> 'aprobado' THEN
    RAISE EXCEPTION 'No confirmó la aprobación del OP.';
  END IF;
  BEGIN
    PERFORM public.guardar_op_desde_rp(
      v_convocatoria, v_rp_id, DATE '2026-11-18', '2026.ALC.01.001249', '1',
      v_opcionales, v_editado_en
    );
    RAISE EXCEPTION 'Permitió editar un OP después de aprobarlo.';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Permitió editar un OP después de aprobarlo.' THEN RAISE; END IF;
  END;
  v_contabilizacion := public.leer_contabilizacion_op(v_convocatoria, v_rp_id);
  IF jsonb_array_length(v_contabilizacion->'filas') <> jsonb_array_length(v_op->'filas')
    OR v_contabilizacion->'filas'->0->>'tipo' <> 'OP'
    OR v_contabilizacion->'filas'->0->>'no_obligacion' <> '2026.ALC.01.001249'
    OR v_contabilizacion->'filas'->0->>'subconsecutivo' <> '1' THEN
    RAISE EXCEPTION 'No precargó tipo, número de obligación o subconsecutivo desde el OP aprobado.';
  END IF;
  SELECT COALESCE(jsonb_object_agg(f->>'id', '""'::JSONB), '{}'::JSONB)
  INTO v_clases
  FROM jsonb_array_elements(v_contabilizacion->'filas') AS filas(f);
  v_editado_en := public.guardar_contabilizacion_op(
    v_convocatoria, v_rp_id, 'OP', '14150701', '24903701', v_clases, NULL
  );
  v_contabilizacion := public.leer_contabilizacion_op(v_convocatoria, v_rp_id);
  IF v_contabilizacion->'datos'->>'cuenta_debito' <> '14150701'
    OR v_contabilizacion->'datos'->>'cuenta_credito' <> '24903701'
    OR v_contabilizacion->'datos'->>'tipo' <> 'OP' THEN
    RAISE EXCEPTION 'No guardó los datos comunes de contabilización.';
  END IF;

  RESET ROLE;
END;
$$;
SELECT 'OK contabilización: bloqueo hasta aprobar OP, precarga y guardado. Todo revertido.' AS resultado;
ROLLBACK;
