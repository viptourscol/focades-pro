-- Flujo completo con datos sinteticos y usuarios reales; todos los cambios se revierten.
BEGIN;
DO $$
DECLARE
  v_edu UUID; v_pre UUID; v_conv UUID; v_otra UUID; v_doc UUID; v_rp UUID; v_otro UUID; v_op UUID;
  v_fila UUID; v_revision TIMESTAMPTZ; v_r JSONB; v_datos JSONB; v_invalido JSONB; v_error BOOLEAN;
BEGIN
  SELECT id INTO STRICT v_edu FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_pre FROM auth.users WHERE raw_user_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB ORDER BY created_at LIMIT 1;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES (2099,'PRUEBA TERCEROS ROLLBACK',FALSE) RETURNING id INTO v_conv;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES (2098,'PRUEBA OTRA ROLLBACK',FALSE) RETURNING id INTO v_otra;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_edu,'role','authenticated')::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_doc := public.fn_crear_documento_cargue(v_conv,'terceros',0);
  v_otro := public.fn_crear_documento_cargue(v_conv,'terceros',0);
  v_error := FALSE;
  BEGIN PERFORM public.fn_crear_documento_cargue(v_conv,'rp',0);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%debe aprobar%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se creo RP sin TERCEROS aprobado'; END IF;
  v_op := public.fn_crear_documento_cargue(v_conv,'op',0);
  v_error := FALSE;
  BEGIN UPDATE public.portal_documentos_cargue SET tipo_documento='rp' WHERE id=v_op;
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se eludio el requisito cambiando el tipo de un documento'; END IF;

  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
  v_r := public.guardar_terceros_cargue(v_doc,'[{"cc_nit":"","primer_nombre":"Ana"}]',v_revision);
  IF jsonb_array_length(v_r->'filas') <> 1 THEN RAISE EXCEPTION 'No guarda borradores incompletos'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','');
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE 'Fila 1:%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se envio un documento incompleto'; END IF;

  v_fila := (v_r->'filas'->0->>'id')::UUID;
  v_datos := jsonb_build_array(jsonb_build_object('id',v_fila,'cc_nit','001234567890123',
    'nombre_referencia','Ana Maria De la Cruz Perez','primer_nombre','Ana','segundo_nombre','Maria',
    'primer_apellido','De la Cruz','segundo_apellido','Perez','tipo_identificacion','TI',
    'email','prueba@example.test','telefono',repeat('1',30),'direccion',repeat('x',500),
    'ciudad_residencia','Municipio original','banco','Banco de prueba','tipo_cuenta','AHORROS',
    'numero_cuenta','000123456789','nombres_confirmados',TRUE));
  v_r := public.guardar_terceros_cargue(v_doc,v_datos,(v_r->>'editado_en')::TIMESTAMPTZ);
  IF v_r->'filas'->0->>'tipo_identificacion' <> '12'
    OR v_r->'filas'->0->'datos_tercero'->>'numero_cuenta' <> '000123456789'
    OR v_r->'filas'->0->>'ciudad' <> 'Municipio original' THEN RAISE EXCEPTION 'Datos completos o codigos incorrectos'; END IF;
  v_error := FALSE;
  BEGIN PERFORM public.guardar_terceros_cargue(v_doc,v_datos,v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%cambió%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Sobrescribe revision desactualizada'; END IF;
  v_revision := (v_r->>'editado_en')::TIMESTAMPTZ;

  RESET ROLE;
  UPDATE public.portal_valores_cargue SET valor_bruto=123,numero_rp='PRESERVAR' WHERE id=v_fila;
  SET LOCAL ROLE authenticated;
  v_r := public.guardar_terceros_cargue(v_doc,v_datos,v_revision);
  IF (SELECT valor_bruto FROM public.portal_valores_cargue WHERE id=v_fila) <> 123
    OR (SELECT numero_rp FROM public.portal_valores_cargue WHERE id=v_fila) <> 'PRESERVAR' THEN RAISE EXCEPTION 'Se perdieron datos financieros'; END IF;
  v_revision := (v_r->>'editado_en')::TIMESTAMPTZ;
  FOREACH v_invalido IN ARRAY ARRAY[
    jsonb_set(v_datos,'{0,email}','"incorrecto"'),
    jsonb_set(v_datos,'{0,cc_nit}','"1e10"'),
    jsonb_set(v_datos,'{0,primer_apellido}',to_jsonb(repeat('x',121))),
    jsonb_set(v_datos,'{0,telefono}',to_jsonb(repeat('1',31))),
    jsonb_set(v_datos,'{0,direccion}',to_jsonb(repeat('x',501))),
    jsonb_set(v_datos,'{0,tipo_identificacion}','"PPT"'),
    jsonb_set(v_datos,'{0,tipo_cuenta}','"DESCONOCIDA"'),
    jsonb_set(v_datos,'{0,numero_cuenta}','"1 234"')
  ] LOOP
    v_error := FALSE;
    BEGIN PERFORM public.guardar_terceros_cargue(v_doc,v_invalido,v_revision);
    EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
    IF NOT v_error THEN RAISE EXCEPTION 'Se aceptaron datos invalidos'; END IF;
  END LOOP;
  v_error := FALSE;
  BEGIN PERFORM public.guardar_terceros_cargue(v_doc,v_datos||v_datos,v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%repetir%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se aceptaron duplicados'; END IF;
  v_error := FALSE;
  BEGIN
    SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_otro;
    PERFORM public.guardar_terceros_cargue(v_otro,v_datos,v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%no pertenece%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se acepto fila ajena'; END IF;

  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Revisar');
  v_error := FALSE;
  BEGIN PERFORM public.transicionar_documento_presupuesto(v_doc,'aprobar','');
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Educacion aprobo su documento'; END IF;
  v_error := FALSE;
  BEGIN UPDATE public.portal_documentos_cargue SET estado='aprobado' WHERE id=v_doc;
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se salto la aprobacion por SQL directo'; END IF;
  v_error := FALSE;
  BEGIN UPDATE public.portal_valores_cargue SET email='cambio@example.test' WHERE id=v_fila;
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error AND (SELECT email FROM public.portal_valores_cargue WHERE id=v_fila) IS DISTINCT FROM 'prueba@example.test' THEN
    RAISE EXCEPTION 'Se modifico tercero enviado';
  END IF;
  v_r := public.obtener_terceros_exportacion(v_doc);
  IF jsonb_array_length(v_r) <> 1 OR (SELECT estado FROM public.portal_documentos_cargue WHERE id=v_doc) <> 'enviado_para_revision' THEN
    RAISE EXCEPTION 'Exportar cambia estado o pierde filas';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_pre,'role','authenticated')::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN
    SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_otro;
    PERFORM public.guardar_terceros_cargue(v_otro,'[]',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%Solo Educación%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Presupuesto pudo editar'; END IF;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'rechazar','Corregir banco');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'reabrir','Corregir');
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
  v_r := public.guardar_terceros_cargue(v_doc,v_datos,v_revision);
  PERFORM public.transicionar_documento_presupuesto(v_doc,'enviar','Corregido');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  PERFORM public.transicionar_documento_presupuesto(v_doc,'aprobar','Verificado');
  IF (SELECT aprobado_por FROM public.portal_documentos_cargue WHERE id=v_doc) <> v_pre THEN RAISE EXCEPTION 'Aprobador incorrecto'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN DELETE FROM public.portal_documentos_cargue WHERE id=v_doc;
  EXCEPTION WHEN raise_exception THEN v_error := TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se elimino un TERCEROS aprobado'; END IF;
  v_rp := public.fn_crear_documento_cargue(v_conv,'rp',0);
  PERFORM public.verificar_rp_habilitado(v_rp);
  v_error := FALSE;
  BEGIN PERFORM public.fn_crear_documento_cargue(v_otra,'rp',0);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%debe aprobar%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Una convocatoria habilito RP de otra'; END IF;
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_doc;
  v_error := FALSE;
  BEGIN PERFORM public.guardar_terceros_cargue(v_doc,v_datos,v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%TERCEROS en borrador%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se modifico un aprobado'; END IF;
  SELECT editado_en INTO v_revision FROM public.portal_documentos_cargue WHERE id=v_otro;
  SELECT jsonb_agg(jsonb_build_object('cc_nit', n::TEXT, 'primer_nombre', 'Prueba'))
  INTO v_datos FROM generate_series(1,1001) n;
  v_r := public.guardar_terceros_cargue(v_otro,v_datos,v_revision);
  IF jsonb_array_length(public.leer_terceros_cargue(v_otro)->'filas') <> 1001 THEN
    RAISE EXCEPTION 'La lectura trunca documentos con mas de 1000 filas';
  END IF;
  v_revision := (v_r->>'editado_en')::TIMESTAMPTZ;
  PERFORM public.guardar_terceros_cargue(v_otro,'[]',v_revision);
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::TEXT,TRUE);
  v_error := FALSE;
  BEGIN PERFORM public.guardar_terceros_cargue(v_otro,'[]',v_revision);
  EXCEPTION WHEN raise_exception THEN v_error := SQLERRM LIKE '%Solo Educación%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Se acepto usuario sin permiso'; END IF;
  IF has_function_privilege('authenticated','public.precargar_aspirantes_cargue_interno(uuid,uuid,character varying,character varying)','EXECUTE') THEN
    RAISE EXCEPTION 'La precarga interna permite saltar el requisito RP';
  END IF;
END;
$$;
ROLLBACK;
SELECT 'OK: datos completos, limites, borradores, atomicidad, concurrencia, permisos, rechazo/reapertura, aprobacion y RP por convocatoria. Todo revertido.' AS resultado;
