-- Ejecutar después de la migración dentro de una transacción que se revierte.
DO $$
DECLARE
  v_edu UUID; v_pre UUID; v_conv UUID; v_otra UUID; v_ins UUID; v_ventana BIGINT; v_otra_ventana BIGINT;
  v_b1 BIGINT; v_b2 BIGINT; v_b3 BIGINT; v_b4 BIGINT; v_b5 BIGINT; v_b6 BIGINT; v_a1 BIGINT; v_a2 BIGINT; v_a5 BIGINT;
  v_rp UUID; v_otro UUID; v_r JSONB; v_lista JSONB; v_seleccion JSONB; v_error BOOLEAN;
  v_filas JSONB; v_op JSONB; v_contabilidad JSONB; v_archivos JSONB; v_ts TIMESTAMPTZ;
BEGIN
  SELECT id INTO STRICT v_edu FROM auth.users WHERE public.is_portal_admin(id)
    AND raw_user_meta_data->'roles' @> '["admin_educacion"]'::JSONB ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_pre FROM auth.users WHERE public.is_portal_admin(id)
    AND raw_user_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB ORDER BY created_at LIMIT 1;
  UPDATE auth.users SET raw_app_meta_data=COALESCE(raw_app_meta_data,'{}'::JSONB)||'{"roles":["admin_educacion"]}'::JSONB WHERE id=v_edu;
  UPDATE auth.users SET raw_app_meta_data=COALESCE(raw_app_meta_data,'{}'::JSONB)||'{"roles":["admin_presupuesto"]}'::JSONB WHERE id=v_pre;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES(2098,'RP actualización prueba',FALSE) RETURNING id INTO v_conv;
  INSERT INTO public.convocatorias(anio,nombre,is_activa) VALUES(2097,'RP actualización otra',FALSE) RETURNING id INTO v_otra;
  INSERT INTO public.portal_ventanas_actualizacion(nombre,fecha_inicio,fecha_fin) VALUES('Período prueba','2098-01-01','2098-06-01') RETURNING id INTO v_ventana;
  INSERT INTO public.portal_ventanas_actualizacion(nombre,fecha_inicio,fecha_fin) VALUES('Otro período','2098-07-01','2098-12-01') RETURNING id INTO v_otra_ventana;
  INSERT INTO public.inscripciones(radicado,convocatoria_id,nombre_completo,n_documento,modalidad)
    VALUES('RP-ACT-PRUEBA',v_conv,'Segundo prueba','994001002','MÉRITO') RETURNING id INTO v_ins;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,convocatoria_id)
    VALUES('Primero prueba','994001001','SUEÑOS',v_conv) RETURNING id INTO v_b1;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,inscripcion_pk)
    VALUES('Segundo prueba','994001002','MÉRITO',v_ins) RETURNING id INTO v_b2;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,convocatoria_id,inscripcion_pk)
    VALUES('Tercero prueba','994001003','OTRA',v_otra,v_ins) RETURNING id INTO v_b3;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,convocatoria_id,estado_beneficiario)
    VALUES('Cuarto prueba','994001004','SUEÑOS',v_conv,'suspendido') RETURNING id INTO v_b4;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,convocatoria_id)
    VALUES('Quinto prueba','994001005','OTRA',v_conv) RETURNING id INTO v_b5;
  INSERT INTO public.portal_beneficiarios(nombre_completo,n_documento,modalidad_beca,convocatoria_id)
    VALUES('Identificación inválida','NO NUMERICA','SUEÑOS',v_conv) RETURNING id INTO v_b6;
  INSERT INTO public.portal_actualizaciones(beneficiario_id,ventana_id,estado) VALUES(v_b1,v_ventana,'aprobada') RETURNING id INTO v_a1;
  INSERT INTO public.portal_actualizaciones(beneficiario_id,ventana_id,estado) VALUES(v_b2,v_ventana,'aprobada') RETURNING id INTO v_a2;
  INSERT INTO public.portal_actualizaciones(beneficiario_id,ventana_id,estado) VALUES(v_b5,v_ventana,'aprobada') RETURNING id INTO v_a5;
  INSERT INTO public.portal_actualizaciones(beneficiario_id,ventana_id,estado) VALUES
    (v_b3,v_ventana,'aprobada'),(v_b4,v_ventana,'aprobada'),(v_b6,v_ventana,'aprobada'),(v_b1,v_otra_ventana,'aprobada');
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_edu,'role','authenticated')::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_rp:=public.crear_rp_actualizaciones(v_conv,v_ventana);
  v_lista:=public.listar_actualizaciones_rp(v_rp);
  IF jsonb_array_length(v_lista)<>4 OR NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements(v_lista) f WHERE (f->>'beneficiario_id')::BIGINT=v_b6 AND f->'valido'='false'::JSONB) THEN
    RAISE EXCEPTION 'Falló elegibilidad convocatoria, período, estado, identificación o fallback: %',v_lista;
  END IF;
  v_r:=public.leer_rp_cargue(v_rp);
  v_seleccion:=jsonb_build_array(jsonb_build_object('id',v_a1,'anteriores','[]'::JSONB),
    jsonb_build_object('id',v_a2,'anteriores','[]'::JSONB),jsonb_build_object('id',v_a5,'anteriores','[]'::JSONB));
  v_ts:=(v_r->>'editado_en')::TIMESTAMPTZ;
  v_r:=public.incorporar_actualizaciones_rp(v_rp,(v_r->>'editado_en')::TIMESTAMPTZ,v_seleccion,'100.50','200');
  IF jsonb_array_length(v_r->'filas')<>3 OR NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements(v_r->'filas') f WHERE f->>'tercero_presupuestal'='994001001' AND f->>'valor'='100.50' AND f->>'liquidacion'='100.50')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'filas') f WHERE f->>'tercero_presupuestal'='994001002' AND f->>'valor'='200')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'filas') f WHERE f->>'tercero_presupuestal'='994001005' AND f->>'valor'='') THEN
    RAISE EXCEPTION 'Importes o filas incorrectos: %',v_r->'filas';
  END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.incorporar_actualizaciones_rp(v_rp,v_ts,v_seleccion,'100','200'); EXCEPTION WHEN raise_exception THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió incorporar con versión desactualizada'; END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.guardar_rp_cargue(v_rp,NULL,v_r->'filas'||jsonb_build_array(v_r->'filas'->0||'{"id":null}'),
    (v_r->>'editado_en')::TIMESTAMPTZ); EXCEPTION WHEN raise_exception THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió agregar una persona sin actualización'; END IF;
  v_r:=public.guardar_rp_cargue(v_rp,NULL,
    (SELECT jsonb_agg(f||CASE WHEN f->>'tercero_presupuestal'='994001005'
      THEN '{"valor":"300","liquidacion":"300","valor_confirmado":true}'::JSONB
      ELSE '{"valor_confirmado":true}'::JSONB END) FROM jsonb_array_elements(v_r->'filas') f),
    (v_r->>'editado_en')::TIMESTAMPTZ);
  PERFORM public.transicionar_documento_presupuesto(v_rp,'enviar','Listo');
  v_otro:=public.crear_rp_actualizaciones(v_conv,v_ventana);
  v_lista:=public.listar_actualizaciones_rp(v_otro);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lista) f
    WHERE (f->>'id')::BIGINT=v_a1 AND jsonb_array_length(f->'anteriores')=1) THEN RAISE EXCEPTION 'No detectó RP anterior'; END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.incorporar_actualizaciones_rp(v_otro,(public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ,
    jsonb_build_array(jsonb_build_object('id',v_a1,'anteriores','[]'::JSONB)),'100','200');
    EXCEPTION WHEN raise_exception THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió duplicado sin confirmar'; END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.incorporar_actualizaciones_rp(v_otro,(public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ,
    jsonb_build_array(jsonb_build_object('id',v_a1,'anteriores',
      (SELECT f->'anteriores' FROM jsonb_array_elements(v_lista) f WHERE (f->>'id')::BIGINT=v_a1))),'100','200');
    EXCEPTION WHEN raise_exception THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió duplicado sin confirmación explícita'; END IF;
  v_r:=public.incorporar_actualizaciones_rp(v_otro,(public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ,
    jsonb_build_array(jsonb_build_object('id',v_a1,'anteriores',
      (SELECT f->'anteriores' FROM jsonb_array_elements(v_lista) f WHERE (f->>'id')::BIGINT=v_a1),'confirmado',true)),'100','200');
  IF jsonb_array_length(v_r->'filas')<>1 THEN RAISE EXCEPTION 'No incorporó duplicado confirmado'; END IF;
  RESET ROLE;
  UPDATE public.portal_actualizaciones SET estado='rechazada' WHERE id=v_a1;
  SET LOCAL ROLE authenticated;
  IF jsonb_array_length(public.alertas_actualizaciones_rp(v_rp))<>1 THEN RAISE EXCEPTION 'Falta alerta de cambio'; END IF;
  RESET ROLE;
  IF (SELECT count(*) FROM public.portal_beneficiario_bitacora WHERE actualizacion_id=v_a1
    AND tipo_evento='actualizacion_cambio_estado_rp')<>2 THEN RAISE EXCEPTION 'Falta bitácora vinculada a RP'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_pre::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_error:=FALSE;
  BEGIN PERFORM public.crear_rp_actualizaciones(v_conv,v_ventana); EXCEPTION WHEN insufficient_privilege THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Presupuesto pudo crear RP de actualizaciones'; END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.eliminar_rp_educacion(v_otro,'borrador',
    (public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ);
    EXCEPTION WHEN insufficient_privilege THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Presupuesto pudo borrar RP'; END IF;
  IF jsonb_array_length(public.alertas_actualizaciones_rp(v_rp))<>1 THEN RAISE EXCEPTION 'Presupuesto no ve alerta'; END IF;
  v_r:=public.leer_rp_cargue(v_rp);
  SELECT jsonb_agg(f || jsonb_build_object('no_rp','2026.ALC.01.001249','no_cdp','2026.ALC.01.001100',
    'tercero_confirmado',true)) INTO v_filas FROM jsonb_array_elements(v_r->'filas') f;
  v_r:=public.guardar_rp_cargue_generales(v_rp,NULL,v_filas,(v_r->>'editado_en')::TIMESTAMPTZ,
    '{"numero_resolucion":"1589","fecha_resolucion":"2026-11-04","fecha_rp":"2026-11-17","semestre_pago":"2","anio_pago":"2026","modalidades":"SUEÑOS Y MÉRITOS EDUCATIVOS","modalidades_manual":false,"fuente_financiacion":"875","descripcion_manual":false}'::JSONB);
  PERFORM public.transicionar_documento_presupuesto(v_rp,'aprobar','Verificado');
  RESET ROLE;
  UPDATE auth.users SET raw_app_meta_data='{"roles":["admin_contabilidad"]}'::JSONB WHERE id=v_pre;
  SET LOCAL ROLE authenticated;
  IF jsonb_array_length(public.alertas_actualizaciones_rp(v_rp))<>1 THEN RAISE EXCEPTION 'Contabilidad no ve alerta'; END IF;
  v_op:=public.leer_op_desde_rp(v_conv,v_rp);
  v_ts:=public.guardar_op_desde_rp(v_conv,v_rp,'2026-11-18','2026.ALC.01.001249','1','{}'::JSONB,NULL);
  PERFORM public.aprobar_op_desde_rp(v_conv,v_rp,v_ts);
  v_contabilidad:=public.leer_contabilizacion_op(v_conv,v_rp);
  v_ts:=public.guardar_contabilizacion_op(v_conv,v_rp,'OP','14150701','24903701','{}'::JSONB,NULL);
  PERFORM public.aprobar_contabilizacion_op(v_conv,v_rp,v_ts);
  RESET ROLE;
  UPDATE auth.users SET raw_app_meta_data='{"roles":["admin_pagos"]}'::JSONB WHERE id=v_pre;
  SET LOCAL ROLE authenticated;
  v_archivos:=public.leer_archivos_aprobados_pagos(v_conv,v_rp);
  IF jsonb_array_length(v_archivos->'op'->'filas')<>3 OR jsonb_array_length(v_archivos->'contabilidad'->'filas')<>3 THEN
    RAISE EXCEPTION 'Pagos no recibió ambos archivos de RP de actualizaciones';
  END IF;
  IF jsonb_array_length(public.alertas_actualizaciones_rp(v_rp))<>1 THEN RAISE EXCEPTION 'Pagos no ve alerta'; END IF;
  RESET ROLE;
  UPDATE public.portal_actualizaciones SET estado='aprobada' WHERE id=v_a1;
  SET LOCAL ROLE authenticated;
  IF public.leer_archivos_aprobados_pagos(v_conv,v_rp) IS DISTINCT FROM v_archivos
    OR jsonb_array_length(public.alertas_actualizaciones_rp(v_rp))<>2 THEN
    RAISE EXCEPTION 'Un cambio posterior alteró snapshots o no dejó alerta';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',v_edu::TEXT,TRUE);
  SET LOCAL ROLE authenticated;
  v_error:=FALSE;
  BEGIN PERFORM public.eliminar_rp_educacion(v_rp,'borrador',(public.leer_rp_cargue(v_rp)->>'editado_en')::TIMESTAMPTZ);
    EXCEPTION WHEN raise_exception THEN v_error:=TRUE; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Borró RP aprobado y vinculado a Pagos'; END IF;
  v_r:=public.leer_rp_cargue(v_otro);
  v_error:=FALSE;
  BEGIN PERFORM public.eliminar_rp_educacion(v_otro,'borrador',(v_r->>'editado_en')::TIMESTAMPTZ-INTERVAL '1 second');
    EXCEPTION WHEN raise_exception THEN v_error:=SQLERRM LIKE '%cambió%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Borró RP con versión desactualizada'; END IF;
  v_error:=FALSE;
  BEGIN PERFORM public.eliminar_rp_educacion(v_otro,'enviado_para_revision',(v_r->>'editado_en')::TIMESTAMPTZ);
    EXCEPTION WHEN raise_exception THEN v_error:=SQLERRM LIKE '%cambió%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Borró RP con estado desactualizado'; END IF;
  RESET ROLE;
  INSERT INTO public.portal_archivos_op(rp_id,datos,editado_por) VALUES(v_otro,'{}'::JSONB,v_edu);
  SET LOCAL ROLE authenticated;
  v_error:=FALSE;
  BEGIN PERFORM public.eliminar_rp_educacion(v_otro,'borrador',(v_r->>'editado_en')::TIMESTAMPTZ);
    EXCEPTION WHEN raise_exception THEN v_error:=SQLERRM LIKE '%vinculado%'; END;
  IF NOT v_error THEN RAISE EXCEPTION 'Borró RP vinculado a OP'; END IF;
  RESET ROLE;
  DELETE FROM public.portal_archivos_op WHERE rp_id=v_otro;
  SET LOCAL ROLE authenticated;
  PERFORM public.eliminar_rp_educacion(v_otro,'borrador',(v_r->>'editado_en')::TIMESTAMPTZ);
  IF EXISTS(SELECT 1 FROM public.portal_documentos_cargue WHERE id=v_otro)
    OR EXISTS(SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=v_otro)
    OR EXISTS(SELECT 1 FROM public.portal_transiciones_documento WHERE documento_id=v_otro) THEN
    RAISE EXCEPTION 'Borrado de RP en borrador incompleto';
  END IF;
  RESET ROLE;
  IF EXISTS(SELECT 1 FROM public.portal_rp_actualizaciones WHERE rp_id=v_otro) THEN
    RAISE EXCEPTION 'Borrado no retiró vínculos de actualizaciones';
  END IF;
  SET LOCAL ROLE authenticated;
  v_otro:=public.crear_rp_actualizaciones(v_conv,v_ventana);
  v_lista:=public.listar_actualizaciones_rp(v_otro);
  v_r:=public.incorporar_actualizaciones_rp(v_otro,(public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ,
    jsonb_build_array(jsonb_build_object('id',v_a1,'anteriores',
      (SELECT f->'anteriores' FROM jsonb_array_elements(v_lista) f WHERE (f->>'id')::BIGINT=v_a1),'confirmado',TRUE)),'100','200');
  v_r:=public.guardar_rp_cargue(v_otro,NULL,
    (SELECT jsonb_agg(f||'{"valor_confirmado":true}'::JSONB) FROM jsonb_array_elements(v_r->'filas') f),
    (v_r->>'editado_en')::TIMESTAMPTZ);
  PERFORM public.transicionar_documento_presupuesto(v_otro,'enviar','Prueba borrado en revisión');
  PERFORM public.eliminar_rp_educacion(v_otro,'enviado_para_revision',
    (public.leer_rp_cargue(v_otro)->>'editado_en')::TIMESTAMPTZ);
  IF EXISTS(SELECT 1 FROM public.portal_documentos_cargue WHERE id=v_otro) THEN
    RAISE EXCEPTION 'No borró RP en revisión';
  END IF;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM public.portal_actualizaciones WHERE id=v_a1 AND estado='aprobada')
    OR NOT EXISTS(SELECT 1 FROM public.portal_beneficiarios WHERE id=v_b1)
    OR EXISTS(SELECT 1 FROM public.portal_rp_actualizaciones WHERE rp_id=v_otro) THEN
    RAISE EXCEPTION 'Borrado no conservó fuentes o no limpió asociaciones';
  END IF;
  IF has_function_privilege('anon','public.eliminar_rp_educacion(uuid,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Anon puede eliminar RP';
  END IF;
END;
$$;
RESET ROLE;
SELECT 'OK RP actualizaciones: elegibilidad, importes, duplicados, aprobación, OP, contabilización, Pagos y alertas' AS resultado;
