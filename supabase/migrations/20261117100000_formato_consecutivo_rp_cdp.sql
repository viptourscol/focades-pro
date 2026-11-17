CREATE OR REPLACE FUNCTION public.formatear_numero_rp(p_numero TEXT, p_anio TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_numero ~ '^[0-9]{1,6}$' AND p_anio ~ '^[0-9]{4}$'
      THEN p_anio || '.ALC.01.' || lpad(p_numero,6,'0')
    ELSE COALESCE(p_numero,'')
  END;
$$;

CREATE OR REPLACE FUNCTION public.errores_fila_rp(p_fila JSONB, p_etapa TEXT DEFAULT 'borrador')
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_e TEXT[] := ARRAY[]::TEXT[]; v_c TEXT; v_v TEXT; v_max INTEGER;
  v_edu TEXT[] := ARRAY['tercero_presupuestal','origen_legal_apropiacion','proyecto','entidad','rubro_presupuestal','valor','liquidacion','firma_mecanica'];
  v_pre TEXT[] := ARRAY['no_rp','subconsecutivo','descripcion','fecha','no_cdp','subconsecutivo_cdp','fuente_financiacion'];
  v_fecha DATE;
BEGIN
  FOREACH v_c IN ARRAY v_edu || v_pre || ARRAY['contrato'] LOOP
    v_v := COALESCE(p_fila->>v_c,'');
    IF p_fila ? v_c AND jsonb_typeof(p_fila->v_c) <> 'string' THEN
      v_e := array_append(v_e,v_c || ': debe ser texto'); CONTINUE;
    END IF;
    IF v_v = '' THEN
      IF (p_etapa = 'completo' AND v_c <> 'contrato') OR (p_etapa = 'educacion' AND v_c = ANY(v_edu)) THEN
        v_e := array_append(v_e,v_c || ': obligatorio');
      END IF;
      CONTINUE;
    END IF;
    v_max := CASE WHEN v_c = 'tercero_presupuestal' THEN 15
      WHEN v_c IN ('subconsecutivo','subconsecutivo_cdp','origen_legal_apropiacion','proyecto','entidad','fuente_financiacion') THEN 4 ELSE NULL END;
    IF v_max IS NOT NULL AND v_v !~ ('^[0-9]{1,' || v_max || '}$') THEN
      v_e := array_append(v_e,v_c || ': maximo ' || v_max || ' digitos');
    END IF;
    IF v_c IN ('no_rp','no_cdp') AND v_v !~ '^[0-9]{4}\.ALC\.01\.[0-9]{6}$' THEN
      v_e := array_append(v_e,v_c || ': use AAAA.ALC.01.NNNNNN');
    END IF;
    IF (v_c = 'descripcion' AND length(v_v) > 500) OR (v_c = 'rubro_presupuestal' AND length(v_v) > 30) THEN
      v_e := array_append(v_e,v_c || ': excede el limite de caracteres');
    END IF;
    IF v_c IN ('valor','liquidacion') THEN
      IF v_v !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' THEN v_e := array_append(v_e,v_c || ': hasta 13 enteros y 2 decimales');
      ELSIF v_v::NUMERIC <= 0 THEN v_e := array_append(v_e,v_c || ': debe ser mayor que cero'); END IF;
    END IF;
    IF v_c = 'fecha' THEN
      BEGIN
        IF v_v !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Formato'; END IF;
        v_fecha := make_date(substring(v_v,5,4)::INTEGER,substring(v_v,3,2)::INTEGER,substring(v_v,1,2)::INTEGER);
      EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN v_e := array_append(v_e,'fecha: fecha invalida, use DDMMYYYY');
      END;
    END IF;
  END LOOP;
  IF p_fila->>'origen_legal_apropiacion' IS DISTINCT FROM '5'
    OR p_fila->>'proyecto' IS DISTINCT FROM '841' OR p_fila->>'entidad' IS DISTINCT FROM '9901'
    OR p_fila->>'rubro_presupuestal' IS DISTINCT FROM '2.3.2.02.02.009' OR p_fila->>'firma_mecanica' IS DISTINCT FROM 'NO' THEN
    v_e := array_append(v_e,'Los codigos fijos RP no se pueden modificar');
  END IF;
  IF p_fila->>'valor' ~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' AND p_fila->>'liquidacion' ~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
    AND (p_fila->>'valor')::NUMERIC <> (p_fila->>'liquidacion')::NUMERIC THEN
    v_e := array_append(v_e,'Liquidacion debe ser igual a Valor');
  END IF;
  IF p_etapa <> 'borrador' AND p_fila->'valor_confirmado' IS DISTINCT FROM 'true'::JSONB THEN
    v_e := array_append(v_e,'Educacion debe confirmar el importe');
  END IF;
  IF p_etapa = 'completo' AND p_fila->'tercero_confirmado' IS DISTINCT FROM 'true'::JSONB THEN
    v_e := array_append(v_e,'Presupuesto debe confirmar el tercero y los codigos en el sistema externo');
  END IF;
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_rp_cargue(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('estado',d.estado,'editado_en',d.editado_en,'terceros_id',d.rp_terceros_id,
    'convocatoria_id',d.convocatoria_id,'rp_anio',c.anio::TEXT,
    'filas',COALESCE((SELECT jsonb_agg(
      jsonb_set(jsonb_set(public.fila_rp(to_jsonb(v)),'{no_rp}',
        to_jsonb(public.formatear_numero_rp(public.fila_rp(to_jsonb(v))->>'no_rp',c.anio::TEXT))),
        '{no_cdp}',to_jsonb(public.formatear_numero_rp(public.fila_rp(to_jsonb(v))->>'no_cdp',c.anio::TEXT)))
      ORDER BY v.creado_en,v.id) FROM public.portal_valores_cargue v WHERE v.documento_id=d.id),'[]'::JSONB),
    'historial',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha DESC,t.id)
      FROM public.portal_transiciones_documento t WHERE t.documento_id=d.id),'[]'::JSONB))
  FROM public.portal_documentos_cargue d JOIN public.convocatorias c ON c.id=d.convocatoria_id
  WHERE d.id=p_documento_id AND d.tipo_documento='rp';
$$;

CREATE OR REPLACE FUNCTION public.guardar_rp_cargue(p_documento_id UUID, p_terceros_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_anio TEXT; v_es_edu BOOLEAN; v_f JSONB; v_old JSONB; v_id UUID; v_p JSONB;
  v_e TEXT[]; v_ids UUID[] := ARRAY[]::UUID[]; v_antes JSONB; v_despues JSONB; v_resultado JSONB;
  v_pre TEXT[] := ARRAY['no_rp','subconsecutivo','descripcion','fecha','no_cdp','subconsecutivo_cdp','fuente_financiacion','contrato','tercero_confirmado'];
  v_edu TEXT[] := ARRAY['valor','liquidacion','valor_confirmado'];
  v_todas TEXT[] := ARRAY['id','origen','nombre','modalidad','tercero_presupuestal','origen_legal_apropiacion','proyecto','entidad','rubro_presupuestal','firma_mecanica'];
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue d WHERE d.id=p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento<>'rp' THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  SELECT anio::TEXT INTO v_anio FROM public.convocatorias WHERE id=v_doc.convocatoria_id;
  v_es_edu := v_doc.estado='borrador' AND public.fn_tiene_rol('admin_educacion') IS TRUE;
  IF NOT v_es_edu AND NOT (v_doc.estado='enviado_para_revision' AND public.fn_tiene_rol('admin_presupuesto') IS TRUE) THEN
    RAISE EXCEPTION 'Solo Educacion en borrador o Presupuesto en revision puede editar RP';
  END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN RAISE EXCEPTION 'El documento cambio. Recargue antes de guardar para no sobrescribir otra edicion.'; END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas)<>'array' THEN RAISE EXCEPTION 'Las filas deben ser una lista'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue WHERE id=p_terceros_id
    AND tipo_documento='terceros' AND convocatoria_id=v_doc.convocatoria_id AND estado IN ('aprobado','finalizado') AND aprobado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'Seleccione un documento TERCEROS aprobado de esta convocatoria';
  END IF;
  IF v_doc.rp_terceros_id IS NOT NULL AND v_doc.rp_terceros_id IS DISTINCT FROM p_terceros_id THEN RAISE EXCEPTION 'No puede cambiar el documento TERCEROS de origen'; END IF;
  IF NOT v_es_edu AND v_doc.rp_terceros_id IS DISTINCT FROM p_terceros_id THEN RAISE EXCEPTION 'Solo Educacion puede vincular el documento de origen'; END IF;
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB) INTO v_antes
    FROM public.portal_valores_cargue v WHERE documento_id=p_documento_id;
  PERFORM set_config('app.guardando_rp',p_documento_id::TEXT,TRUE);
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
    IF jsonb_typeof(v_f)<>'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_f) k WHERE NOT k=ANY(v_todas||v_pre||v_edu)) THEN
      RAISE EXCEPTION 'La fila contiene campos no admitidos';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(v_f) WHERE key NOT IN ('id','valor_confirmado','tercero_confirmado') AND jsonb_typeof(value)<>'string')
      OR jsonb_typeof(v_f->'valor_confirmado') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_f->'tercero_confirmado') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Tipos de datos RP invalidos'; END IF;
    v_id := (v_f->>'id')::UUID; v_old := NULL;
    IF v_id IS NOT NULL THEN
      SELECT public.fila_rp(to_jsonb(v)) INTO v_old FROM public.portal_valores_cargue v WHERE id=v_id AND documento_id=p_documento_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Una fila no pertenece al documento'; END IF;
      v_old := jsonb_set(jsonb_set(v_old,'{no_rp}',to_jsonb(public.formatear_numero_rp(v_old->>'no_rp',v_anio))),
        '{no_cdp}',to_jsonb(public.formatear_numero_rp(v_old->>'no_cdp',v_anio)));
    END IF;
    IF v_es_edu THEN
      IF v_old IS NOT NULL AND COALESCE(v_old->>'origen','')<>'' AND v_old->>'origen' IS DISTINCT FROM v_f->>'origen' THEN
        RAISE EXCEPTION 'No puede sustituir la persona de una fila; quite la fila y agregue la persona correcta';
      END IF;
      IF v_old IS NOT NULL AND (v_f - (v_edu||ARRAY['origen','nombre','modalidad','tercero_presupuestal'])) IS DISTINCT FROM
        (v_old - (v_edu||ARRAY['origen','nombre','modalidad','tercero_presupuestal'])) THEN RAISE EXCEPTION 'Educacion no puede editar campos de Presupuesto ni codigos fijos'; END IF;
      IF v_old IS NULL AND (EXISTS (SELECT 1 FROM unnest(array_remove(v_pre,'tercero_confirmado')) k WHERE COALESCE(v_f->>k,'')<>'')
        OR v_f->'tercero_confirmado' IS DISTINCT FROM 'false'::JSONB) THEN RAISE EXCEPTION 'Educacion no puede completar campos de Presupuesto'; END IF;
      IF v_old IS NULL OR v_old->>'origen' IS DISTINCT FROM v_f->>'origen' THEN
        v_p := public.persona_origen_rp(v_f->>'origen',p_terceros_id);
        IF v_f->>'tercero_presupuestal' IS DISTINCT FROM v_p->>'identificacion' THEN RAISE EXCEPTION 'La identificacion no coincide con la fuente seleccionada'; END IF;
        v_f := v_f || jsonb_build_object('nombre',v_p->>'nombre','modalidad',v_p->>'modalidad');
      ELSIF (v_f - v_edu) IS DISTINCT FROM (v_old - v_edu) THEN
        RAISE EXCEPTION 'No puede alterar la persona ni sus datos de origen';
      END IF;
    ELSE
      IF v_old IS NULL OR (v_f - v_pre) IS DISTINCT FROM (v_old - v_pre) THEN RAISE EXCEPTION 'Presupuesto solo puede editar sus campos; no personas ni importes'; END IF;
    END IF;
    v_e := public.errores_fila_rp(v_f,'borrador');
    IF cardinality(v_e)>0 THEN RAISE EXCEPTION '%',array_to_string(v_e,'; '); END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.portal_valores_cargue(documento_id,identificacion,nombre_beneficiario,datos_rp,valor_bruto,valor_neto,numero_rp)
      VALUES(p_documento_id,v_f->>'tercero_presupuestal',CASE WHEN length(v_f->>'nombre')<=200 THEN v_f->>'nombre' END,v_f-'id',
        COALESCE(NULLIF(v_f->>'valor','')::NUMERIC,0),COALESCE(NULLIF(v_f->>'liquidacion','')::NUMERIC,0),NULLIF(v_f->>'no_rp','')) RETURNING id INTO v_id;
    ELSE
      UPDATE public.portal_valores_cargue SET identificacion=v_f->>'tercero_presupuestal',
        nombre_beneficiario=CASE WHEN length(v_f->>'nombre')<=200 THEN v_f->>'nombre' END,datos_rp=v_f-'id',
        valor_bruto=COALESCE(NULLIF(v_f->>'valor','')::NUMERIC,0),valor_neto=COALESCE(NULLIF(v_f->>'liquidacion','')::NUMERIC,0),
        numero_rp=NULLIF(v_f->>'no_rp','') WHERE id=v_id;
    END IF;
    IF v_id=ANY(v_ids) THEN RAISE EXCEPTION 'No puede repetir filas'; END IF;
    v_ids := array_append(v_ids,v_id);
  END LOOP;
  IF NOT v_es_edu AND EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=p_documento_id AND NOT id=ANY(v_ids)) THEN
    RAISE EXCEPTION 'Presupuesto no puede eliminar personas';
  END IF;
  DELETE FROM public.portal_valores_cargue WHERE documento_id=p_documento_id AND NOT id=ANY(v_ids);
  IF EXISTS (SELECT identificacion FROM public.portal_valores_cargue WHERE documento_id=p_documento_id GROUP BY identificacion HAVING count(*)>1) THEN RAISE EXCEPTION 'No puede repetir terceros'; END IF;
  UPDATE public.portal_documentos_cargue SET rp_terceros_id=p_terceros_id,editado_por=auth.uid(),
    editado_en=clock_timestamp(),cantidad_registros=cardinality(v_ids) WHERE id=p_documento_id;
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB) INTO v_despues
    FROM public.portal_valores_cargue v WHERE documento_id=p_documento_id;
  INSERT INTO public.portal_transiciones_documento(documento_id,estado_anterior,estado_nuevo,rol_quien_transiciona,usuario_id,comentario,datos_cambio)
    VALUES(p_documento_id,v_doc.estado,v_doc.estado,CASE WHEN v_es_edu THEN 'admin_educacion' ELSE 'admin_presupuesto' END,auth.uid(),
      'Datos RP guardados',jsonb_build_object('antes',v_antes,'despues',v_despues,'terceros_id',p_terceros_id));
  PERFORM set_config('app.guardando_rp','',TRUE);
  RETURN public.leer_rp_cargue(p_documento_id);
END;
$$;

CREATE FUNCTION public.validar_anio_consecutivo_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_anio TEXT; v_rp TEXT; v_cdp TEXT;
BEGIN
  SELECT c.anio::TEXT INTO v_anio FROM public.portal_documentos_cargue d
    JOIN public.convocatorias c ON c.id=d.convocatoria_id
    WHERE d.id=NEW.documento_id AND d.tipo_documento='rp';
  IF v_anio IS NULL THEN RETURN NEW; END IF;
  v_rp := COALESCE(NEW.datos_rp->>'no_rp','');
  v_cdp := COALESCE(NEW.datos_rp->>'no_cdp','');
  IF v_rp ~ '^[0-9]{4}\.ALC\.01\.[0-9]{6}$' AND split_part(v_rp,'.',1)<>v_anio THEN
    RAISE EXCEPTION 'El año del No. RP debe coincidir con la convocatoria (%)',v_anio;
  END IF;
  IF v_cdp ~ '^[0-9]{4}\.ALC\.01\.[0-9]{6}$' AND split_part(v_cdp,'.',1)<>v_anio THEN
    RAISE EXCEPTION 'El año del No. CDP debe coincidir con la convocatoria (%)',v_anio;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.formatear_numero_rp(TEXT,TEXT),public.validar_anio_consecutivo_rp() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.formatear_numero_rp(TEXT,TEXT) TO authenticated;
CREATE TRIGGER y_validar_anio_consecutivo_rp BEFORE INSERT OR UPDATE ON public.portal_valores_cargue
  FOR EACH ROW EXECUTE FUNCTION public.validar_anio_consecutivo_rp();
NOTIFY pgrst,'reload schema';
