-- Ejecutar con: supabase db query --linked --file scripts/testing/test-precarga-aspirantes.sql
-- Usa datos existentes, pero todos los documentos y valores de prueba se revierten.
BEGIN;

DO $$
DECLARE
  v_actor UUID;
  v_conv UUID;
  v_doc UUID;
  v_tipo TEXT;
  v_estado TEXT;
  v_esperados INTEGER;
  v_modalidad TEXT;
  v_resultado RECORD;
  v_error BOOLEAN;
BEGIN
  SELECT id INTO STRICT v_actor
  FROM auth.users
  WHERE raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB
  ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::TEXT, TRUE);

  SELECT convocatoria_id INTO STRICT v_conv
  FROM public.inscripciones
  WHERE LOWER(TRIM(estado)) = 'admitido'
  LIMIT 1;

  SET LOCAL ROLE authenticated;

  FOREACH v_tipo IN ARRAY ARRAY['terceros', 'rp'] LOOP
    FOR v_estado IN
      SELECT DISTINCT LOWER(TRIM(estado))
      FROM public.inscripciones
      WHERE convocatoria_id = v_conv AND NULLIF(TRIM(estado), '') IS NOT NULL
    LOOP
      v_doc := public.fn_crear_documento_cargue(v_conv, v_tipo, 0);

      SELECT COUNT(DISTINCT COALESCE(
        NULLIF(TRIM(p.n_documento), ''), NULLIF(TRIM(i.n_documento), ''),
        NULLIF(TRIM(i.datos_formulario->>'n_documento'), ''),
        NULLIF(TRIM(i.datos_formulario->>'numero_documento'), '')
      )) INTO v_esperados
      FROM public.inscripciones i LEFT JOIN public.personas p ON p.id = i.persona_id
      WHERE i.convocatoria_id = v_conv AND LOWER(TRIM(i.estado)) = v_estado;

      SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, v_estado, NULL);
      IF v_esperados < 1 OR v_resultado.cantidad_precargada <> v_esperados THEN
        RAISE EXCEPTION 'Precarga incorrecta: tipo %, estado %, esperados %, recibidos %',
          v_tipo, v_estado, v_esperados, v_resultado.cantidad_precargada;
      END IF;
      IF (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_doc) <> v_esperados
        OR (SELECT cantidad_registros FROM public.portal_documentos_cargue WHERE id = v_doc) <> v_esperados THEN
        RAISE EXCEPTION 'Filas persistidas o contador incorrectos';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.inscripciones i
        LEFT JOIN public.personas p ON p.id = i.persona_id
        LEFT JOIN public.portal_valores_cargue v ON v.documento_id = v_doc
          AND v.identificacion = COALESCE(NULLIF(TRIM(p.n_documento), ''), NULLIF(TRIM(i.n_documento), ''),
            NULLIF(TRIM(i.datos_formulario->>'n_documento'), ''), NULLIF(TRIM(i.datos_formulario->>'numero_documento'), ''))
        WHERE i.convocatoria_id = v_conv AND LOWER(TRIM(i.estado)) = v_estado
          AND (v.id IS NULL OR
            v.nombre_beneficiario IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.nombre_completo), ''), NULLIF(TRIM(i.nombre_completo), ''), NULLIF(TRIM(i.datos_formulario->>'nombre_completo'), '')) OR
            v.tipo_identificacion IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.tipo_documento), ''), NULLIF(TRIM(i.tipo_documento), ''), NULLIF(TRIM(i.datos_formulario->>'tipo_documento'), '')) OR
            v.email IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.email), ''), NULLIF(TRIM(i.email), ''), NULLIF(TRIM(i.datos_formulario->>'email'), '')) OR
            v.telefono IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.n_celular), ''), NULLIF(TRIM(i.n_celular), ''), NULLIF(TRIM(i.datos_formulario->>'n_celular'), ''), NULLIF(TRIM(i.datos_formulario->>'telefono'), '')) OR
            v.direccion IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.direccion_residencia), ''), NULLIF(TRIM(i.direccion_residencia), ''), NULLIF(TRIM(i.datos_formulario->>'direccion_residencia'), ''), NULLIF(TRIM(i.datos_formulario->>'direccion'), '')) OR
            v.ciudad IS DISTINCT FROM COALESCE(NULLIF(TRIM(p.municipio_residencia), ''), NULLIF(TRIM(i.municipio_residencia), ''), NULLIF(TRIM(i.datos_formulario->>'municipio_residencia'), ''), NULLIF(TRIM(i.datos_formulario->>'ciudad'), '')))
      ) THEN
        RAISE EXCEPTION 'Los siete campos no coinciden con la ficha del aspirante';
      END IF;

      SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, v_estado, NULL);
      IF v_resultado.cantidad_precargada <> 0 OR
          (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_doc) <> v_esperados THEN
        RAISE EXCEPTION 'La repeticion genero duplicados o informo un contador incorrecto';
      END IF;
    END LOOP;
  END LOOP;

  v_doc := public.fn_crear_documento_cargue(v_conv, 'rp', 0);
  -- Compatibilidad con la llamada automatica del creador de RP.
  SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(
    p_documento_id => v_doc, p_modalidad_beca => NULL
  );
  IF v_resultado.cantidad_precargada < 1 THEN
    RAISE EXCEPTION 'Fallo la llamada compatible del creador de RP';
  END IF;
  SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, 'estado_inexistente', NULL);
  IF v_resultado.cantidad_precargada <> 0 THEN
    RAISE EXCEPTION 'El estado inexistente cargo registros';
  END IF;
  SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, 'admit', NULL);
  IF v_resultado.cantidad_precargada <> 0 THEN
    RAISE EXCEPTION 'Se acepto una coincidencia parcial de estado';
  END IF;

  SELECT modalidad INTO STRICT v_modalidad FROM public.inscripciones
  WHERE convocatoria_id = v_conv AND LOWER(TRIM(estado)) = 'admitido' LIMIT 1;
  v_doc := public.fn_crear_documento_cargue(v_conv, 'rp', 0);
  SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, 'admitido', v_modalidad);
  IF v_resultado.cantidad_precargada < 1 THEN
    RAISE EXCEPTION 'La modalidad real no cargo aspirantes';
  END IF;
  SELECT * INTO STRICT v_resultado FROM public.precargar_rp_convocatoria(v_doc, v_conv, 'admitido', 'modalidad_inexistente');
  IF v_resultado.cantidad_precargada <> 0 THEN
    RAISE EXCEPTION 'Se ignoro el filtro de modalidad';
  END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.precargar_rp_convocatoria(v_doc, v_conv, '', NULL);
  EXCEPTION WHEN raise_exception THEN
    v_error := SQLERRM LIKE '%seleccionar un estado%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se acepto un estado vacio'; END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.precargar_rp_convocatoria(v_doc, gen_random_uuid(), 'admitido', NULL);
  EXCEPTION WHEN raise_exception THEN
    v_error := SQLERRM LIKE '%no corresponde al documento%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se mezclaron convocatorias'; END IF;

  RESET ROLE;
  UPDATE public.portal_documentos_cargue SET estado = 'aprobado' WHERE id = v_doc;
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN
    PERFORM public.precargar_rp_convocatoria(v_doc, v_conv, 'admitido', NULL);
  EXCEPTION WHEN raise_exception THEN
    v_error := SQLERRM LIKE '%debe estar en borrador%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se permitio modificar un documento aprobado'; END IF;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', TRUE);
  v_error := FALSE;
  BEGIN
    PERFORM public.precargar_rp_convocatoria(v_doc, v_conv, 'admitido', NULL);
  EXCEPTION WHEN raise_exception THEN
    v_error := SQLERRM LIKE '%Solo admin_educacion%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se permitio precargar sin rol autorizado'; END IF;
END;
$$;

ROLLBACK;
SELECT 'OK: TERCEROS, RP, estados reales, siete campos, contador, duplicados, compatibilidad, convocatoria y permisos. Pruebas revertidas.' AS resultado;
