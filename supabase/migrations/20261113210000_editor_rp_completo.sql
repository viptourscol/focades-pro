ALTER TABLE public.portal_documentos_cargue ADD COLUMN rp_terceros_id UUID
  REFERENCES public.portal_documentos_cargue(id) ON DELETE RESTRICT;
ALTER TABLE public.portal_valores_cargue ADD COLUMN datos_rp JSONB NOT NULL DEFAULT '{}'::JSONB;
COMMENT ON COLUMN public.portal_documentos_cargue.rp_terceros_id IS 'Documento TERCEROS aprobado de la misma convocatoria que inicia RP.';
COMMENT ON COLUMN public.portal_valores_cargue.datos_rp IS 'Copia RP de 16 campos, origen y confirmaciones por rol; no modifica perfiles.';

CREATE FUNCTION public.fila_rp(p_fila JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'no_rp',COALESCE(p_fila->>'numero_rp',''),'subconsecutivo','','descripcion','','fecha','','no_cdp','','subconsecutivo_cdp','',
    'fuente_financiacion','','valor',CASE WHEN (p_fila->>'valor_bruto')::NUMERIC > 0 THEN p_fila->>'valor_bruto' ELSE '' END,
    'liquidacion',CASE WHEN (p_fila->>'valor_neto')::NUMERIC > 0 THEN p_fila->>'valor_neto' ELSE '' END,'contrato','',
    'origen_legal_apropiacion','5','proyecto','841','entidad','9901',
    'rubro_presupuestal','2.3.2.02.02.009','firma_mecanica','NO',
    'valor_confirmado',FALSE,'tercero_confirmado',FALSE,'origen','',
    'tercero_presupuestal',p_fila->>'identificacion',
    'nombre',COALESCE(p_fila->>'nombre_beneficiario',''),'modalidad',''
  ) || COALESCE(p_fila->'datos_rp','{}'::JSONB) || jsonb_build_object('id',p_fila->'id');
$$;

CREATE FUNCTION public.errores_fila_rp(p_fila JSONB, p_etapa TEXT DEFAULT 'borrador')
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
    v_max := CASE WHEN v_c IN ('no_rp','no_cdp') THEN 10 WHEN v_c = 'tercero_presupuestal' THEN 15
      WHEN v_c IN ('subconsecutivo','subconsecutivo_cdp','origen_legal_apropiacion','proyecto','entidad','fuente_financiacion') THEN 4 ELSE NULL END;
    IF v_max IS NOT NULL AND v_v !~ ('^[0-9]{1,' || v_max || '}$') THEN v_e := array_append(v_e,v_c || ': maximo ' || v_max || ' digitos'); END IF;
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

CREATE FUNCTION public.leer_rp_cargue(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('estado',d.estado,'editado_en',d.editado_en,'terceros_id',d.rp_terceros_id,
    'convocatoria_id',d.convocatoria_id,
    'filas',COALESCE((SELECT jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id)
      FROM public.portal_valores_cargue v WHERE v.documento_id=d.id),'[]'::JSONB),
    'historial',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha DESC,t.id)
      FROM public.portal_transiciones_documento t WHERE t.documento_id=d.id),'[]'::JSONB))
  FROM public.portal_documentos_cargue d WHERE d.id=p_documento_id AND d.tipo_documento='rp';
$$;

CREATE FUNCTION public.persona_origen_rp(p_origen TEXT, p_terceros_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_f JSONB; v_r JSONB; v_modalidad TEXT; v_tipo TEXT := split_part(p_origen,':',1); v_id TEXT := split_part(p_origen,':',2);
BEGIN
  IF v_tipo = 'tercero' THEN
    SELECT to_jsonb(v) INTO v_f FROM public.portal_valores_cargue v
      JOIN public.portal_documentos_cargue d ON d.id=v.documento_id
      WHERE v.id::TEXT=v_id AND d.id=p_terceros_id AND d.tipo_documento='terceros'
        AND d.estado IN ('aprobado','finalizado') AND d.aprobado_por IS NOT NULL;
    v_r := jsonb_build_object('identificacion',v_f->>'identificacion','nombre',
      COALESCE(NULLIF(trim(concat_ws(' ',NULLIF(v_f->'datos_tercero'->>'primer_nombre',''),NULLIF(v_f->'datos_tercero'->>'segundo_nombre',''),
        NULLIF(v_f->'datos_tercero'->>'primer_apellido',''),NULLIF(v_f->'datos_tercero'->>'segundo_apellido',''))),''),v_f->>'nombre_beneficiario'));
    SELECT COALESCE(i.datos_formulario->>'modalidad',i.modalidad) INTO v_modalidad
      FROM public.inscripciones i LEFT JOIN public.personas p ON p.id=i.persona_id
      WHERE i.convocatoria_id=(SELECT convocatoria_id FROM public.portal_documentos_cargue WHERE id=p_terceros_id)
        AND COALESCE(NULLIF(p.n_documento,''),NULLIF(i.n_documento,''),i.datos_formulario->>'n_documento')=v_r->>'identificacion'
      ORDER BY i.id LIMIT 1;
  ELSIF v_tipo = 'persona' THEN
    SELECT to_jsonb(p) INTO v_f FROM public.personas p WHERE p.id::TEXT=v_id;
    v_r := jsonb_build_object('identificacion',v_f->>'n_documento','nombre',v_f->>'nombre_completo');
  ELSIF v_tipo = 'inscripcion' THEN
    SELECT to_jsonb(i) INTO v_f FROM public.inscripciones i WHERE i.id::TEXT=v_id;
    v_r := jsonb_build_object('identificacion',COALESCE(NULLIF(v_f->>'n_documento',''),v_f->'datos_formulario'->>'n_documento'),
      'nombre',COALESCE(NULLIF(v_f->>'nombre_completo',''),v_f->'datos_formulario'->>'nombre_completo'));
  ELSIF v_tipo = 'beneficiario' THEN
    SELECT to_jsonb(b) INTO v_f FROM public.portal_beneficiarios b WHERE b.id::TEXT=v_id;
    v_r := jsonb_build_object('identificacion',COALESCE(NULLIF(v_f->>'numero_documento',''),NULLIF(v_f->>'n_documento',''),v_f->>'identificacion'),
      'nombre',COALESCE(NULLIF(v_f->>'nombre_completo',''),NULLIF(v_f->>'nombre_beneficiario',''),v_f->>'nombres'));
  END IF;
  IF v_f IS NULL OR NULLIF(trim(v_r->>'nombre'),'') IS NULL OR COALESCE(v_r->>'identificacion','') !~ '^[0-9]{1,15}$' THEN
    RAISE EXCEPTION 'La persona de origen no existe o no tiene nombre e identificacion numerica validos';
  END IF;
  RETURN v_r || jsonb_build_object('origen',p_origen,'modalidad',COALESCE(v_modalidad,v_f->>'modalidad_beca',v_f->'datos_formulario'->>'modalidad',v_f->>'modalidad',''));
END;
$$;

CREATE FUNCTION public.personas_terceros_rp(p_terceros_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_personas JSONB;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educacion puede incorporar personas'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue WHERE id=p_terceros_id AND tipo_documento='terceros'
    AND estado IN ('aprobado','finalizado') AND aprobado_por IS NOT NULL) THEN RAISE EXCEPTION 'Documento TERCEROS no aprobado'; END IF;
  SELECT COALESCE(jsonb_agg(public.persona_origen_rp('tercero:'||v.id::TEXT,p_terceros_id) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_personas FROM public.portal_valores_cargue v WHERE v.documento_id=p_terceros_id;
  RETURN v_personas;
END;
$$;

CREATE FUNCTION public.buscar_personas_rp(p_busqueda TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_resultado JSONB;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educacion puede buscar personas para RP'; END IF;
  IF p_busqueda IS NULL OR length(trim(p_busqueda)) < 3 THEN RAISE EXCEPTION 'Escriba al menos 3 caracteres'; END IF;
  WITH candidatos AS (
    SELECT 'persona:'||p.id::TEXT AS origen,p.n_documento AS identificacion,p.nombre_completo AS nombre,''::TEXT AS modalidad FROM public.personas p
    UNION ALL SELECT 'inscripcion:'||i.id::TEXT,COALESCE(NULLIF(i.n_documento,''),i.datos_formulario->>'n_documento'),
      COALESCE(NULLIF(i.nombre_completo,''),i.datos_formulario->>'nombre_completo'),COALESCE(i.datos_formulario->>'modalidad',i.modalidad,'') FROM public.inscripciones i
    UNION ALL SELECT 'beneficiario:'||b.id::TEXT,
      COALESCE(NULLIF(to_jsonb(b)->>'numero_documento',''),NULLIF(to_jsonb(b)->>'n_documento',''),to_jsonb(b)->>'identificacion'),
      COALESCE(NULLIF(to_jsonb(b)->>'nombre_completo',''),NULLIF(to_jsonb(b)->>'nombre_beneficiario',''),to_jsonb(b)->>'nombres'),
      COALESCE(b.modalidad_beca,'') FROM public.portal_beneficiarios b
  ), encontrados AS (
    SELECT DISTINCT ON (identificacion) * FROM candidatos
    WHERE identificacion ~ '^[0-9]{1,15}$' AND NULLIF(trim(nombre),'') IS NOT NULL
      AND (position(lower(trim(p_busqueda)) IN lower(nombre)) > 0 OR position(trim(p_busqueda) IN identificacion) > 0)
    ORDER BY identificacion,origen LIMIT 30
  ) SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY identificacion),'[]'::JSONB) INTO v_resultado FROM encontrados e;
  RETURN v_resultado;
END;
$$;

CREATE FUNCTION public.validar_rp_documento(p_documento_id UUID, p_etapa TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_f RECORD; v_e TEXT[];
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id AND tipo_documento='rp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue
    WHERE id=v_doc.rp_terceros_id AND convocatoria_id=v_doc.convocatoria_id AND tipo_documento='terceros'
      AND estado IN ('aprobado','finalizado') AND aprobado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'Seleccione un documento TERCEROS aprobado de esta convocatoria';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=p_documento_id) THEN RAISE EXCEPTION 'Agregue al menos una persona'; END IF;
  FOR v_f IN SELECT * FROM public.portal_valores_cargue WHERE documento_id=p_documento_id LOOP
    IF COALESCE(v_f.datos_rp->>'origen','') = '' THEN RAISE EXCEPTION 'Vincule el origen de la persona % antes de enviar',v_f.identificacion; END IF;
    v_e := public.errores_fila_rp(public.fila_rp(to_jsonb(v_f)),p_etapa);
    IF cardinality(v_e)>0 THEN RAISE EXCEPTION 'Tercero %: %',v_f.identificacion,array_to_string(v_e,'; '); END IF;
  END LOOP;
  IF EXISTS (SELECT identificacion FROM public.portal_valores_cargue WHERE documento_id=p_documento_id GROUP BY identificacion HAVING count(*)>1) THEN
    RAISE EXCEPTION 'No puede repetir terceros en RP';
  END IF;
END;
$$;

CREATE FUNCTION public.guardar_rp_cargue(p_documento_id UUID, p_terceros_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_es_edu BOOLEAN; v_f JSONB; v_old JSONB; v_id UUID; v_p JSONB;
  v_e TEXT[]; v_ids UUID[] := ARRAY[]::UUID[]; v_antes JSONB; v_despues JSONB; v_resultado JSONB;
  v_pre TEXT[] := ARRAY['no_rp','subconsecutivo','descripcion','fecha','no_cdp','subconsecutivo_cdp','fuente_financiacion','contrato','tercero_confirmado'];
  v_edu TEXT[] := ARRAY['valor','liquidacion','valor_confirmado'];
  v_todas TEXT[] := ARRAY['id','origen','nombre','modalidad','tercero_presupuestal','origen_legal_apropiacion','proyecto','entidad','rubro_presupuestal','firma_mecanica'];
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento<>'rp' THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
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
      -- El nombre completo vive en datos_rp; la referencia heredada admite solo 200 caracteres.
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
  v_resultado := public.leer_rp_cargue(p_documento_id);
  RETURN v_resultado;
END;
$$;

CREATE FUNCTION public.proteger_edicion_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.documento_id ELSE NEW.documento_id END FOR UPDATE;
  IF v_doc.tipo_documento='rp' THEN
    IF current_setting('app.guardando_rp',TRUE) IS DISTINCT FROM v_doc.id::TEXT
      OR NOT ((v_doc.estado='borrador' AND public.fn_tiene_rol('admin_educacion') IS TRUE)
        OR (v_doc.estado='enviado_para_revision' AND public.fn_tiene_rol('admin_presupuesto') IS TRUE)) THEN
      RAISE EXCEPTION 'Use el editor RP autorizado; el documento esta bloqueado para cambios directos';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER z_proteger_edicion_rp BEFORE INSERT OR UPDATE OR DELETE ON public.portal_valores_cargue
  FOR EACH ROW EXECUTE FUNCTION public.proteger_edicion_rp();

CREATE FUNCTION public.proteger_transicion_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo_documento<>'rp' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.rp_terceros_id IS NOT NULL THEN RAISE EXCEPTION 'Vincule TERCEROS desde el editor RP'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.rp_terceros_id IS DISTINCT FROM OLD.rp_terceros_id
    AND current_setting('app.guardando_rp',TRUE) IS DISTINCT FROM NEW.id::TEXT THEN
    RAISE EXCEPTION 'Vincule TERCEROS desde el editor RP';
  END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  IF OLD.estado='borrador' AND NEW.estado='enviado_para_revision' AND public.fn_tiene_rol('admin_educacion') IS TRUE THEN
    PERFORM public.validar_rp_documento(NEW.id,'educacion');
  ELSIF OLD.estado='enviado_para_revision' AND NEW.estado='aprobado' AND public.fn_tiene_rol('admin_presupuesto') IS TRUE THEN
    PERFORM public.validar_rp_documento(NEW.id,'completo');
    NEW.aprobado_por:=auth.uid(); NEW.aprobado_en:=clock_timestamp();
  ELSIF OLD.estado='enviado_para_revision' AND NEW.estado='rechazado' AND public.fn_tiene_rol('admin_presupuesto') IS TRUE
    AND NULLIF(trim(NEW.comentarios_rechazo),'') IS NOT NULL THEN NULL;
  ELSIF OLD.estado='rechazado' AND NEW.estado='borrador' AND public.fn_tiene_rol('admin_educacion') IS TRUE THEN NULL;
  ELSE RAISE EXCEPTION 'Transicion RP no permitida para su rol'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER z_proteger_transicion_rp BEFORE INSERT OR UPDATE ON public.portal_documentos_cargue
  FOR EACH ROW EXECUTE FUNCTION public.proteger_transicion_rp();

CREATE FUNCTION public.obtener_rp_exportacion(p_documento_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_filas JSONB;
BEGIN
  IF (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) IS NOT TRUE THEN RAISE EXCEPTION 'Su rol no puede exportar RP'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id AND tipo_documento='rp' FOR SHARE;
  IF NOT FOUND OR v_doc.estado NOT IN ('enviado_para_revision','aprobado','finalizado') THEN RAISE EXCEPTION 'Solo puede exportar RP enviados y completos o aprobados'; END IF;
  PERFORM public.validar_rp_documento(p_documento_id,'completo');
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB) INTO v_filas
    FROM public.portal_valores_cargue v WHERE documento_id=p_documento_id;
  RETURN v_filas;
END;
$$;

REVOKE ALL ON FUNCTION public.persona_origen_rp(TEXT,UUID), public.validar_rp_documento(UUID,TEXT),
  public.proteger_edicion_rp(),public.proteger_transicion_rp() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fila_rp(JSONB),public.errores_fila_rp(JSONB,TEXT),public.leer_rp_cargue(UUID),
  public.personas_terceros_rp(UUID),public.buscar_personas_rp(TEXT),public.guardar_rp_cargue(UUID,UUID,JSONB,TIMESTAMPTZ),public.obtener_rp_exportacion(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fila_rp(JSONB),public.errores_fila_rp(JSONB,TEXT),public.leer_rp_cargue(UUID),
  public.personas_terceros_rp(UUID),public.buscar_personas_rp(TEXT),public.guardar_rp_cargue(UUID,UUID,JSONB,TIMESTAMPTZ),public.obtener_rp_exportacion(UUID) TO authenticated;
NOTIFY pgrst,'reload schema';
