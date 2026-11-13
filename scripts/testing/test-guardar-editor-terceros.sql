-- supabase db query --linked --file scripts/testing/test-guardar-editor-terceros.sql
-- Datos sinteticos. Todo se revierte, incluido el documento.
BEGIN;
DO $$
DECLARE
  v_actor UUID;
  v_conv UUID;
  v_doc UUID;
  v_otro UUID;
  v_fila UUID;
  v_ajena UUID;
  v_revision TIMESTAMPTZ;
  v_resultado JSONB;
  v_datos JSONB;
  v_invalido JSONB;
  v_error BOOLEAN;
BEGIN
  SELECT id INTO STRICT v_actor FROM auth.users
  WHERE raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_conv FROM public.convocatorias ORDER BY anio DESC LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;
  v_doc := public.fn_crear_documento_cargue(v_conv, 'terceros', 0);
  v_otro := public.fn_crear_documento_cargue(v_conv, 'terceros', 0);
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id = v_doc;

  v_datos := '[{"id":null,"cc_nit":"123456789","nombre_razon_social":" Nombre de prueba largo ","tipo_identificacion":"TI","email":"prueba@example.test","telefono":"3001234567","direccion":"Direccion completa de prueba","ciudad":"Municipio de prueba"}]'::JSONB;
  v_resultado := public.guardar_terceros_cargue(v_doc, v_datos, v_revision);
  v_fila := (v_resultado->'filas'->0->>'id')::UUID;
  IF v_fila IS NULL OR (v_resultado->'filas'->0->>'nombre_beneficiario') <> 'Nombre de prueba largo'
    OR (v_resultado->'filas'->0->>'identificacion') <> '123456789'
    OR (v_resultado->'filas'->0->>'tipo_identificacion') <> 'TI'
    OR (v_resultado->'filas'->0->>'email') <> 'prueba@example.test'
    OR (v_resultado->'filas'->0->>'telefono') <> '3001234567'
    OR (v_resultado->'filas'->0->>'direccion') <> 'Direccion completa de prueba'
    OR (v_resultado->'filas'->0->>'ciudad') <> 'Municipio de prueba'
    OR (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_doc) <> 1
    OR (SELECT cantidad_registros FROM public.portal_documentos_cargue WHERE id = v_doc) <> 1 THEN
    RAISE EXCEPTION 'No se guardaron los datos normalizados o el contador';
  END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.guardar_terceros_cargue(v_doc, v_datos, v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%cambió desde que lo abrió%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se acepto una revision desactualizada'; END IF;
  v_revision := (v_resultado->>'editado_en')::TIMESTAMPTZ;

  RESET ROLE;
  UPDATE public.portal_valores_cargue SET valor_bruto = 123, numero_rp = 'RP-PRESERVAR' WHERE id = v_fila;
  SET LOCAL ROLE authenticated;
  v_datos := jsonb_set(v_datos, '{0,id}', to_jsonb(v_fila::TEXT));
  v_datos := jsonb_set(v_datos, '{0,direccion}', '"Direccion actualizada completa"');
  v_resultado := public.guardar_terceros_cargue(v_doc, v_datos, v_revision);
  v_revision := (v_resultado->>'editado_en')::TIMESTAMPTZ;
  IF (SELECT direccion FROM public.portal_valores_cargue WHERE id = v_fila) <> 'Direccion actualizada completa'
    OR (SELECT valor_bruto FROM public.portal_valores_cargue WHERE id = v_fila) <> 123
    OR (SELECT numero_rp FROM public.portal_valores_cargue WHERE id = v_fila) <> 'RP-PRESERVAR' THEN
    RAISE EXCEPTION 'No se actualizo el tercero o se alteraron datos financieros';
  END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.guardar_terceros_cargue(v_doc, v_datos || v_datos, v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%repetir la identificacion%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se aceptaron duplicados'; END IF;

  FOREACH v_invalido IN ARRAY ARRAY[
    jsonb_set(v_datos, '{0,email}', '"correo-invalido"'),
    jsonb_set(v_datos, '{0,cc_nit}', '"   "'),
    jsonb_set(v_datos, '{0,nombre_razon_social}', to_jsonb(REPEAT('x', 201))),
    jsonb_set(v_datos, '{0,direccion}', to_jsonb(REPEAT('x', 256)))
  ] LOOP
    v_error := FALSE;
    BEGIN
      PERFORM public.guardar_terceros_cargue(v_doc, v_invalido, v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := TRUE;
    END;
    IF NOT v_error THEN RAISE EXCEPTION 'Se aceptaron datos invalidos'; END IF;
  END LOOP;
  IF (SELECT direccion FROM public.portal_valores_cargue WHERE id = v_fila) <> 'Direccion actualizada completa' THEN
    RAISE EXCEPTION 'Un error modifico datos previamente guardados';
  END IF;

  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id = v_otro;
  v_resultado := public.guardar_terceros_cargue(v_otro, '[{"cc_nit":"987654321","nombre_razon_social":"Otro tercero"}]', v_revision);
  v_ajena := (v_resultado->'filas'->0->>'id')::UUID;
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id = v_doc;
  v_error := FALSE;
  BEGIN
    PERFORM public.guardar_terceros_cargue(v_doc, jsonb_set(v_datos, '{0,id}', to_jsonb(v_ajena::TEXT)), v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%no pertenece al documento%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se edito una fila ajena'; END IF;

  -- Agregar otro tercero conservando el existente, luego eliminar el primero.
  v_datos := v_datos || '[{"cc_nit":"555555555","nombre_razon_social":"Tercero nuevo sin contacto"}]'::JSONB;
  v_resultado := public.guardar_terceros_cargue(v_doc, v_datos, v_revision);
  IF jsonb_array_length(v_resultado->'filas') <> 2 THEN RAISE EXCEPTION 'Fallo la adicion'; END IF;
  v_revision := (v_resultado->>'editado_en')::TIMESTAMPTZ;
  v_resultado := public.guardar_terceros_cargue(v_doc, '[]', v_revision);
  IF jsonb_array_length(v_resultado->'filas') <> 0 OR
    (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_doc) <> 0 OR
    (SELECT cantidad_registros FROM public.portal_documentos_cargue WHERE id = v_doc) <> 0 THEN
    RAISE EXCEPTION 'No se eliminaron filas o no se actualizo el contador';
  END IF;
  IF (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_otro) <> 1 THEN
    RAISE EXCEPTION 'Se afecto otro documento';
  END IF;
  v_revision := (v_resultado->>'editado_en')::TIMESTAMPTZ;

  RESET ROLE;
  UPDATE public.portal_documentos_cargue SET estado = 'aprobado' WHERE id = v_doc;
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN
    PERFORM public.guardar_terceros_cargue(v_doc, '[]', v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%TERCEROS en borrador%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se modifico un documento aprobado'; END IF;

  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, TRUE);
  v_error := FALSE;
  BEGIN
    PERFORM public.guardar_terceros_cargue(v_doc, '[]', v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%No tiene permiso%';
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se acepto un usuario sin permiso'; END IF;
END;
$$;
ROLLBACK;
SELECT 'OK: alta, edicion, eliminacion, siete campos, datos financieros preservados, atomicidad, concurrencia, permisos y aislamiento. Todo revertido.' AS resultado;
