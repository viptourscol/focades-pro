-- Ejecutar con supabase db query --linked --file scripts/testing/test-correcciones-presupuesto.sql
-- Datos sinteticos. Todas las operaciones se revierten.
BEGIN;
DO $$
DECLARE
  v_edu UUID; v_pre UUID; v_conv UUID; v_doc UUID; v_otro UUID; v_fila UUID; v_fila_otra UUID;
  v_revision TIMESTAMPTZ; v_r JSONB; v_error BOOLEAN; v_cambios JSONB;
  v_fuentes TEXT;
BEGIN
  SELECT id INTO STRICT v_edu FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_pre FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB
    AND NOT raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES (2099,'CORRECCIONES ROLLBACK',FALSE) RETURNING id INTO v_conv;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::TEXT,'')) INTO v_fuentes FROM public.personas p;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_edu,'role','authenticated')::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_doc := public.fn_crear_documento_cargue(v_conv,'terceros',0);
  v_otro := public.fn_crear_documento_cargue(v_conv,'terceros',0);
  v_cambios := '{"cc_nit":"000123","primer_nombre":"Ana","segundo_nombre":"Maria","primer_apellido":"Perez","segundo_apellido":"Gomez","tipo_identificacion":"13","email":"prueba@example.test","telefono":"3001234567","direccion":"Direccion","banco":"Banco original","tipo_cuenta":"AHORROS","numero_cuenta":"000987","nombres_confirmados":true}'::JSONB;
  v_r := public.guardar_terceros_cargue(v_doc,jsonb_build_array(v_cambios,v_cambios || '{"cc_nit":"000456"}'::JSONB),
    (SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_doc));
  v_fila := (v_r->'filas'->0->>'id')::UUID;
  -- Orden de filas por id: localizar por identificacion, no por posicion.
  SELECT id INTO v_fila FROM public.portal_valores_cargue WHERE documento_id=v_doc AND identificacion='000123';
  v_r := public.guardar_terceros_cargue(v_otro,jsonb_build_array(v_cambios),(SELECT editado_en FROM public.portal_documentos_cargue WHERE id=v_otro));
  v_fila_otra := (v_r->'filas'->0->>'id')::UUID;
  RESET ROLE;
  UPDATE public.portal_valores_cargue SET valor_bruto=123,numero_rp='PRESERVAR',ciudad='Municipio original' WHERE id=v_fila;
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Revision');
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"No autorizado"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%Solo Presupuesto%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Educacion pudo usar la correccion de Presupuesto'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;

  v_r := public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"Banco corregido","numero_cuenta":"0000012345"}','Verificado con certificado',v_revision);
  IF v_r->>'estado' <> 'enviado_para_revision' THEN RAISE EXCEPTION 'Guardar aprobo o cambio estado'; END IF;
  IF (SELECT count(*) FROM public.portal_valores_cargue WHERE documento_id=v_doc) <> 2 THEN RAISE EXCEPTION 'Se altero cantidad de personas'; END IF;
  IF (SELECT datos_tercero->>'numero_cuenta' FROM public.portal_valores_cargue WHERE id=v_fila) <> '0000012345' THEN RAISE EXCEPTION 'Perdio ceros iniciales'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_correcciones_terceros WHERE documento_id=v_doc AND fila_id=v_fila
    AND campo='banco' AND valor_anterior='Banco original' AND valor_nuevo='Banco corregido'
    AND motivo='Verificado con certificado' AND usuario_id=v_pre AND fecha IS NOT NULL) THEN
    RAISE EXCEPTION 'Historial no conserva actor, fecha, motivo y valores';
  END IF;
  IF jsonb_array_length(public.leer_correcciones_terceros(v_doc)) <> 2 THEN RAISE EXCEPTION 'Historial incompleto'; END IF;
  IF (SELECT valor_bruto FROM public.portal_valores_cargue WHERE id=v_fila) <> 123
    OR (SELECT numero_rp FROM public.portal_valores_cargue WHERE id=v_fila) <> 'PRESERVAR'
    OR (SELECT ciudad FROM public.portal_valores_cargue WHERE id=v_fila) <> 'Municipio original' THEN RAISE EXCEPTION 'Se alteraron datos no editables'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"Revision desactualizada"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%cambió%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Sobrescribe revision desactualizada'; END IF;
  v_revision := (v_r->>'editado_en')::TIMESTAMPTZ;

  FOREACH v_cambios IN ARRAY ARRAY[
    '{"codigo_dependencia":"5"}'::JSONB, '{"nombre_razon_social":"NO"}', '{"digito_verificador":"1"}',
    '{"documento_id":"00000000-0000-0000-0000-000000000000"}', '{"valor_bruto":"999"}',
    '{"ciudad_residencia":"OTRA"}', '{"nombre_referencia":"Otra persona"}', '{"email":"incorrecto"}',
    '{"cc_nit":"000456"}', '{"cc_nit":"1e10"}', '{"primer_apellido":"Corregido"}',
    '{"numero_cuenta":1234}', '{"banco":null}', '{"nombres_confirmados":false}',
    '{"primer_nombre":""}', '{"banco":"Banco corregido"}'
  ] LOOP
    v_error := FALSE;
    BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,v_cambios,'Prueba invalida',v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Acepto correccion invalida: %',v_cambios; END IF;
  END LOOP;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"Cambio"}',' ',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%motivo%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Acepto motivo vacio'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila_otra,'{"banco":"Cambio"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%no pertenece%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Acepto fila ajena'; END IF;
  IF jsonb_array_length(public.leer_correcciones_terceros(v_doc)) <> 2 THEN RAISE EXCEPTION 'Errores dejaron auditorias parciales'; END IF;

  -- REST directo no tiene politicas de escritura para filas ni historial.
  UPDATE public.portal_valores_cargue SET email='sin-auditar@example.test' WHERE id=v_fila;
  IF (SELECT email FROM public.portal_valores_cargue WHERE id=v_fila) <> 'prueba@example.test' THEN RAISE EXCEPTION 'Modifico celda sin auditoria'; END IF;
  DELETE FROM public.portal_valores_cargue WHERE id=v_fila;
  IF NOT EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE id=v_fila) THEN RAISE EXCEPTION 'Presupuesto elimino persona'; END IF;
  v_error := FALSE;
  BEGIN INSERT INTO public.portal_valores_cargue(documento_id,identificacion,nombre_beneficiario) VALUES(v_doc,'999','No permitido');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Presupuesto agrego persona'; END IF;
  v_error := FALSE;
  BEGIN DELETE FROM public.portal_correcciones_terceros WHERE documento_id=v_doc;
  EXCEPTION WHEN insufficient_privilege THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Historial puede borrarse'; END IF;
  IF has_table_privilege('authenticated','public.portal_correcciones_terceros','INSERT')
    OR has_table_privilege('authenticated','public.portal_correcciones_terceros','UPDATE')
    OR has_function_privilege('anon','public.corregir_tercero_presupuesto(uuid,uuid,jsonb,text,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','public.celdas_tercero(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Permisos de auditoria o funciones internas incorrectos';
  END IF;

  v_r := public.corregir_tercero_presupuesto(v_doc,v_fila,'{"primer_apellido":"De la Cruz","nombres_confirmados":true}','Verificacion de apellidos',v_revision);
  v_revision := (v_r->>'editado_en')::TIMESTAMPTZ;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.obtener_terceros_exportacion(v_doc)) f
    WHERE f->>'id'=v_fila::TEXT AND f->'datos_tercero'->>'primer_apellido'='De la Cruz'
      AND f->'datos_tercero'->>'banco'='Banco corregido') THEN RAISE EXCEPTION 'Exportacion no contiene correcciones'; END IF;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'rechazar','Revisar personas');
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"No permitido"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%pendientes%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Edito rechazado'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'reabrir','Corregir');
  IF jsonb_array_length(public.leer_correcciones_terceros(v_doc)) <> 3 THEN RAISE EXCEPTION 'Educacion no ve historial al reabrir'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"No permitido"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%pendientes%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Edito borrador'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Completo');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'aprobar','Verificado');
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"No permitido"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%pendientes%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Edito aprobado'; END IF;
  RESET ROLE;
  IF v_fuentes IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::TEXT,'')) FROM public.personas p) THEN RAISE EXCEPTION 'Cambio perfiles originales'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',TRUE);
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',TRUE);
  SET LOCAL ROLE authenticated;
  IF public.leer_correcciones_terceros(v_doc) <> '[]'::JSONB THEN RAISE EXCEPTION 'Historial visible sin rol'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.corregir_tercero_presupuesto(v_doc,v_fila,'{"banco":"No autorizado"}','Prueba',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Sin rol pudo corregir'; END IF;
  RESET ROLE;
END;
$$;
SELECT 'OK: correcciones auditadas, motivo, concurrencia, validacion, permisos, exportacion, bloqueo por estado y perfiles intactos. Todo revertido.' AS resultado;
ROLLBACK;
