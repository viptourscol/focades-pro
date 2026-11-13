-- Datos sinteticos. ROLLBACK restaura todos los documentos y filas de prueba.
BEGIN;
DO $$
DECLARE
  v_edu UUID; v_pre UUID; v_conv UUID; v_doc UUID; v_rp UUID; v_r JSONB;
  v_revision TIMESTAMPTZ; v_error BOOLEAN; v_estado TEXT; v_fuentes TEXT;
  v_fila UUID;
  v_datos JSONB := '[{"cc_nit":"000123","primer_nombre":"Ana","primer_apellido":"Perez","segundo_apellido":"Gomez","tipo_identificacion":"13","email":"prueba@example.test","telefono":"3001234567","direccion":"Direccion","banco":"Banco prueba","tipo_cuenta":"AHORROS","numero_cuenta":"000987","nombres_confirmados":true}]';
BEGIN
  SELECT id INTO STRICT v_edu FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_pre FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB
    AND NOT raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::TEXT,'')) INTO v_fuentes FROM public.personas p;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES (2099,'ELIMINAR TERCEROS ROLLBACK',FALSE) RETURNING id INTO v_conv;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_edu,'role','authenticated')::TEXT,TRUE);
  SET LOCAL ROLE authenticated;

  FOREACH v_estado IN ARRAY ARRAY['borrador','enviado_para_revision'] LOOP
    v_doc := public.fn_crear_documento_cargue(v_conv,'terceros',0);
    v_r := public.guardar_terceros_cargue(v_doc,v_datos,(SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_doc));
    v_fila := (v_r->'filas'->0->>'id')::UUID;
    IF v_estado='enviado_para_revision' THEN
      PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Revision');
      RESET ROLE;
      PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
      SET LOCAL ROLE authenticated;
      PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"Banco verificado"}','Certificado',(SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_doc));
      RESET ROLE;
      PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
      SET LOCAL ROLE authenticated;
    END IF;
    SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
    v_error := FALSE;
    BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,v_estado,v_revision - interval '1 second');
    EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%cambió%'; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Elimino con revision desactualizada'; END IF;
    v_error := FALSE;
    BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,'otro_estado',v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%cambió%'; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Elimino con estado desactualizado'; END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
    SET LOCAL ROLE authenticated;
    v_error := FALSE;
    BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,v_estado,v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%Solo Educación%'; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Presupuesto pudo eliminar'; END IF;
    DELETE FROM public.portal_documentos_cargue WHERE id=v_doc;
    IF NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue WHERE id=v_doc) THEN RAISE EXCEPTION 'Presupuesto borro por REST'; END IF;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
    SET LOCAL ROLE authenticated;
    v_r := public.eliminar_terceros_educacion(v_doc,v_estado,v_revision);
    IF v_r->>'success' <> 'true' OR v_r->>'documento_id' <> v_doc::TEXT THEN RAISE EXCEPTION 'Respuesta incorrecta'; END IF;
    IF EXISTS (SELECT 1 FROM public.portal_documentos_cargue WHERE id=v_doc)
      OR EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=v_doc)
      OR EXISTS (SELECT 1 FROM public.portal_transiciones_documento WHERE documento_id=v_doc)
      OR EXISTS (SELECT 1 FROM public.portal_correcciones_terceros WHERE documento_id=v_doc) THEN
      RAISE EXCEPTION 'Borrado incompleto o cascada bloqueada';
    END IF;
    v_error := FALSE;
    BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,v_estado,v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%ya no existe%'; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Borrar inexistente produjo exito falso'; END IF;
  END LOOP;

  -- La eliminacion de documentos protegidos debe fallar incluso por SQL directo.
  v_doc := public.fn_crear_documento_cargue(v_conv,'terceros',0);
  PERFORM public.guardar_terceros_cargue(v_doc,v_datos,(SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_doc));
  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Revision');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'rechazar','Corregir');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
  v_error := FALSE;
  BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,'rechazado',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Elimino rechazado fuera de alcance'; END IF;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'reabrir','Corregido');
  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Revision');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'aprobar','Completo');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_rp := public.fn_crear_documento_cargue(v_conv,'rp',0);
  v_error := FALSE;
  BEGIN PERFORM public.eliminar_terceros_educacion(v_rp,'borrador',(SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_rp));
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'El endpoint de terceros elimino RP'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,'enviado_para_revision',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Elimino aprobado desde una bandeja obsoleta'; END IF;
  v_error := FALSE;
  BEGIN DELETE FROM public.portal_documentos_cargue WHERE id=v_doc;
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Elimino aprobado por SQL directo'; END IF;
  IF has_function_privilege('anon','public.eliminar_terceros_educacion(uuid,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Anon puede eliminar'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',TRUE);
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN PERFORM public.eliminar_terceros_educacion(v_doc,'enviado_para_revision',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%Solo Educación%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Sin rol pudo eliminar'; END IF;
  RESET ROLE;
  IF v_fuentes IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::TEXT,'')) FROM public.personas p) THEN RAISE EXCEPTION 'Cambio perfiles'; END IF;
END;
$$;
SELECT 'OK: borrado de borrador/revision, cascada, permisos, concurrencia, aprobados protegidos y perfiles intactos. Todo revertido.' AS resultado;
ROLLBACK;
