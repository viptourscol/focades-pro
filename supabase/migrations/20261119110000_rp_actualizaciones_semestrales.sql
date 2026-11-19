ALTER TABLE public.portal_documentos_cargue
  ADD COLUMN rp_origen TEXT NOT NULL DEFAULT 'terceros'
    CHECK (rp_origen IN ('terceros', 'actualizaciones')),
  ADD COLUMN rp_ventana_id BIGINT REFERENCES public.portal_ventanas_actualizacion(id) ON DELETE RESTRICT,
  ADD CONSTRAINT rp_origen_ventana_check CHECK (
    (rp_origen = 'terceros' AND rp_ventana_id IS NULL)
    OR (tipo_documento = 'rp' AND rp_origen = 'actualizaciones' AND rp_ventana_id IS NOT NULL AND rp_terceros_id IS NULL)
  );

CREATE TABLE public.portal_rp_actualizaciones (
  fila_id UUID PRIMARY KEY REFERENCES public.portal_valores_cargue(id) ON DELETE CASCADE,
  rp_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  actualizacion_id BIGINT NOT NULL REFERENCES public.portal_actualizaciones(id) ON DELETE RESTRICT,
  beneficiario_id BIGINT NOT NULL REFERENCES public.portal_beneficiarios(id) ON DELETE RESTRICT,
  ventana_id BIGINT NOT NULL REFERENCES public.portal_ventanas_actualizacion(id) ON DELETE RESTRICT,
  incorporado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  incorporado_por UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE (rp_id, beneficiario_id)
);
CREATE INDEX portal_rp_actualizaciones_beneficiario_ventana
  ON public.portal_rp_actualizaciones(beneficiario_id, ventana_id);
ALTER TABLE public.portal_rp_actualizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_rp_actualizaciones FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.exigir_educacion_rp_actualizacion()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
      AND (u.raw_app_meta_data->'roles' @> '["admin_educacion"]'::JSONB
        OR u.raw_app_meta_data->>'role' = 'admin_educacion')
  ) OR public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
    RAISE EXCEPTION 'Se requiere un administrador activo con rol Educación.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_flujo_terceros_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tipo_documento IN ('terceros','rp')
    AND (NEW.tipo_documento <> OLD.tipo_documento OR NEW.convocatoria_id <> OLD.convocatoria_id
      OR NEW.rp_origen IS DISTINCT FROM OLD.rp_origen OR NEW.rp_ventana_id IS DISTINCT FROM OLD.rp_ventana_id) THEN
    RAISE EXCEPTION 'No puede cambiar el tipo, convocatoria ni origen del documento';
  END IF;
  IF NEW.tipo_documento NOT IN ('terceros','rp') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.rp_origen = 'actualizaciones' AND (
    public.is_portal_admin(auth.uid()) IS NOT TRUE OR NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND (
        (public.fn_tiene_rol('admin_educacion') IS TRUE AND
          (u.raw_app_meta_data->'roles' @> '["admin_educacion"]'::JSONB OR u.raw_app_meta_data->>'role'='admin_educacion'))
        OR (public.fn_tiene_rol('admin_presupuesto') IS TRUE AND
          (u.raw_app_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB OR u.raw_app_meta_data->>'role'='admin_presupuesto'))
      )
    )) THEN RAISE EXCEPTION 'Se requiere un administrador activo de Educación o Presupuesto.' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador' OR public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
      RAISE EXCEPTION 'Solo Educación puede crear estos documentos en borrador';
    END IF;
    IF NEW.tipo_documento = 'rp' THEN
      IF NEW.rp_origen = 'terceros' THEN
        PERFORM public.exigir_terceros_aprobados(NEW.convocatoria_id);
      ELSE
        PERFORM public.exigir_educacion_rp_actualizacion();
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    IF NEW.aprobado_por IS DISTINCT FROM OLD.aprobado_por OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en THEN
      RAISE EXCEPTION 'La aprobación solo se registra durante la transición correspondiente';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.tipo_documento = 'terceros' THEN
    IF OLD.estado = 'borrador' AND NEW.estado = 'enviado_para_revision' AND public.fn_tiene_rol('admin_educacion') THEN
      PERFORM public.validar_terceros_para_revision(NEW.id);
    ELSIF OLD.estado = 'enviado_para_revision' AND NEW.estado = 'aprobado' AND public.fn_tiene_rol('admin_presupuesto') THEN
      PERFORM public.validar_terceros_para_revision(NEW.id);
      NEW.aprobado_por := auth.uid(); NEW.aprobado_en := clock_timestamp();
    ELSIF OLD.estado = 'enviado_para_revision' AND NEW.estado = 'rechazado' AND public.fn_tiene_rol('admin_presupuesto')
      AND NULLIF(trim(NEW.comentarios_rechazo), '') IS NOT NULL THEN
      NULL;
    ELSIF OLD.estado = 'rechazado' AND NEW.estado = 'borrador' AND public.fn_tiene_rol('admin_educacion') THEN
      NULL;
    ELSE RAISE EXCEPTION 'Transición TERCEROS no permitida para su rol: % → %', OLD.estado, NEW.estado;
    END IF;
  ELSIF NEW.estado IN ('enviado_para_revision','aprobado') AND NEW.rp_origen = 'terceros' THEN
    PERFORM public.exigir_terceros_aprobados(NEW.convocatoria_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_filas_terceros_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_id UUID; v_celda RECORD;
  v_antes JSONB; v_despues JSONB; v_motivo TEXT; v_errores TEXT[];
  v_columnas TEXT[] := ARRAY['identificacion','tipo_identificacion','email','telefono','direccion','datos_tercero'];
  v_datos TEXT[] := ARRAY['primer_nombre','segundo_nombre','primer_apellido','segundo_apellido','banco','tipo_cuenta','numero_cuenta','nombres_confirmados'];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.documento_id <> OLD.documento_id THEN
    RAISE EXCEPTION 'No puede trasladar filas entre documentos';
  END IF;
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = v_id FOR UPDATE;
  IF v_doc.tipo_documento = 'terceros' THEN
    IF v_doc.estado = 'enviado_para_revision' AND public.fn_tiene_rol('admin_presupuesto') IS TRUE THEN
      IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Presupuesto no puede agregar ni eliminar personas'; END IF;
      v_motivo := NULLIF(trim(current_setting('app.motivo_correccion_tercero', TRUE)), '');
      IF v_motivo IS NULL THEN RAISE EXCEPTION 'Use la corrección auditada con un motivo obligatorio'; END IF;
      IF (to_jsonb(NEW) - v_columnas) IS DISTINCT FROM (to_jsonb(OLD) - v_columnas)
        OR (NEW.datos_tercero - v_datos) IS DISTINCT FROM (OLD.datos_tercero - v_datos) THEN
        RAISE EXCEPTION 'Solo puede corregir celdas editables; no los datos de origen, financieros o fijos';
      END IF;
      v_errores := public.errores_fila_tercero(to_jsonb(NEW), TRUE);
      IF cardinality(v_errores) > 0 THEN RAISE EXCEPTION '%', array_to_string(v_errores, '; '); END IF;
      IF EXISTS (SELECT 1 FROM public.portal_valores_cargue
        WHERE documento_id = v_id AND id <> NEW.id AND identificacion = NEW.identificacion) THEN
        RAISE EXCEPTION 'La identificación ya existe en este documento';
      END IF;
      v_antes := public.celdas_tercero(to_jsonb(OLD));
      v_despues := public.celdas_tercero(to_jsonb(NEW));
      FOR v_celda IN SELECT key, value FROM jsonb_each(v_despues)
        WHERE value IS DISTINCT FROM v_antes->key LOOP
        INSERT INTO public.portal_correcciones_terceros(documento_id,fila_id,identificacion,campo,valor_anterior,valor_nuevo,motivo,usuario_id)
        VALUES (v_id,NEW.id,NEW.identificacion,v_celda.key,v_antes->>v_celda.key,v_celda.value #>> '{}',v_motivo,auth.uid());
      END LOOP;
    ELSE
      IF v_doc.estado <> 'borrador' OR public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
        RAISE EXCEPTION 'Solo Educación puede modificar terceros en borrador';
      END IF;
      IF TG_OP <> 'DELETE' THEN
        NEW.tipo_identificacion := public.codigo_identificacion_tercero(NEW.tipo_identificacion);
        IF TG_OP = 'INSERT' THEN
          NEW.datos_tercero := public.datos_fuente_tercero(v_doc.convocatoria_id, NEW.identificacion) || NEW.datos_tercero;
        END IF;
      END IF;
    END IF;
  ELSIF v_doc.tipo_documento = 'rp' AND v_doc.rp_origen = 'terceros'
    AND TG_OP <> 'DELETE' AND v_doc.estado NOT IN ('aprobado','finalizado') THEN
    PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.crear_rp_actualizaciones(p_convocatoria_id UUID, p_ventana_id BIGINT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.exigir_educacion_rp_actualizacion();
  IF NOT EXISTS (SELECT 1 FROM public.portal_ventanas_actualizacion WHERE id = p_ventana_id) THEN
    RAISE EXCEPTION 'Seleccione una ventana de actualización válida.';
  END IF;
  INSERT INTO public.portal_documentos_cargue
    (convocatoria_id, tipo_documento, estado, cantidad_registros, creado_por, rp_origen, rp_ventana_id)
  VALUES (p_convocatoria_id, 'rp', 'borrador', 0, auth.uid(), 'actualizaciones', p_ventana_id)
  RETURNING id INTO v_id;
  PERFORM public.fn_registrar_transicion_documento(v_id, 'borrador', 'sistema', 'RP de actualizaciones creado');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_rp_cargue(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('estado',d.estado,'editado_en',d.editado_en,'terceros_id',d.rp_terceros_id,
    'origen_rp',d.rp_origen,'ventana_id',d.rp_ventana_id,
    'ventana_nombre',(SELECT nombre FROM public.portal_ventanas_actualizacion WHERE id=d.rp_ventana_id),
    'convocatoria_id',d.convocatoria_id,'convocatoria_anio',c.anio::TEXT,
    'datos_generales_rp',d.datos_generales_rp,
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

CREATE FUNCTION public.listar_actualizaciones_rp(p_documento_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_resultado JSONB;
BEGIN
  PERFORM public.exigir_educacion_rp_actualizacion();
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id;
  IF NOT FOUND OR v_doc.tipo_documento <> 'rp' OR v_doc.rp_origen <> 'actualizaciones'
    OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Seleccione un RP de actualizaciones en borrador.';
  END IF;
  WITH candidatos AS (
    SELECT DISTINCT ON (b.id) a.id, b.id AS beneficiario_id, b.nombre_completo AS nombre,
      b.n_documento AS identificacion, COALESCE(b.modalidad_beca, '') AS modalidad
    FROM public.portal_actualizaciones a
    JOIN public.portal_beneficiarios b ON b.id = a.beneficiario_id
    LEFT JOIN public.inscripciones i ON i.id = b.inscripcion_pk
    WHERE a.ventana_id = v_doc.rp_ventana_id AND a.estado = 'aprobada'
      AND b.estado_beneficiario = 'activo' AND b.deleted_at IS NULL
      AND COALESCE(b.convocatoria_id, i.convocatoria_id) = v_doc.convocatoria_id
      AND NOT EXISTS (SELECT 1 FROM public.portal_rp_actualizaciones r
        WHERE r.rp_id = v_doc.id AND r.beneficiario_id = b.id)
    ORDER BY b.id, a.created_at DESC, a.id DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'beneficiario_id', c.beneficiario_id, 'nombre', c.nombre,
    'identificacion', c.identificacion, 'modalidad', c.modalidad,
    'valido', COALESCE(c.identificacion, '') ~ '^[0-9]{1,15}$' AND NULLIF(btrim(c.nombre), '') IS NOT NULL,
    'anteriores', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'estado', d.estado) ORDER BY d.id)
      FROM public.portal_rp_actualizaciones r JOIN public.portal_documentos_cargue d ON d.id = r.rp_id
      WHERE r.beneficiario_id = c.beneficiario_id AND r.ventana_id = v_doc.rp_ventana_id AND d.id <> v_doc.id), '[]'::JSONB)
  ) ORDER BY c.nombre, c.id), '[]'::JSONB) INTO v_resultado FROM candidatos c;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_edicion_rp()
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
    IF v_doc.rp_origen = 'actualizaciones' AND TG_OP = 'INSERT'
      AND current_setting('app.incorporando_actualizacion',TRUE) IS DISTINCT FROM v_doc.id::TEXT THEN
      RAISE EXCEPTION 'Incorpore beneficiarios desde las actualizaciones aprobadas.';
    END IF;
    IF v_doc.rp_origen = 'actualizaciones' AND TG_OP = 'DELETE' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('rp-actualizacion:' || r.ventana_id::TEXT || ':' || r.beneficiario_id::TEXT, 0))
        FROM public.portal_rp_actualizaciones r WHERE r.fila_id=OLD.id;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.incorporar_actualizaciones_rp(
  p_documento_id UUID, p_editado_en TIMESTAMPTZ, p_seleccion JSONB,
  p_valor_suenos TEXT, p_valor_merito TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_elegibles JSONB; v_seleccion JSONB;
  v_item JSONB; v_persona JSONB; v_fila JSONB; v_valor TEXT; v_modalidad TEXT;
  v_fila_id UUID; v_beneficiario BIGINT; v_previos JSONB; v_antes JSONB; v_despues JSONB;
BEGIN
  PERFORM public.exigir_educacion_rp_actualizacion();
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'rp' OR v_doc.rp_origen <> 'actualizaciones' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Seleccione un RP de actualizaciones en borrador.';
  END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió. Recargue antes de incorporar personas.';
  END IF;
  IF jsonb_typeof(p_seleccion) IS DISTINCT FROM 'array' OR jsonb_array_length(p_seleccion) = 0 THEN
    RAISE EXCEPTION 'Seleccione al menos una actualización.';
  END IF;
  IF COALESCE(p_valor_suenos, '') !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
    OR p_valor_suenos::NUMERIC <= 0
    OR COALESCE(p_valor_merito, '') !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
    OR p_valor_merito::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'Indique valores positivos para Sueños y Mérito, con hasta 13 enteros y 2 decimales.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_seleccion) s
    WHERE jsonb_typeof(s) <> 'object' OR COALESCE(s->>'id', '') !~ '^[0-9]+$'
      OR jsonb_typeof(s->'anteriores') IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'La selección de actualizaciones no es válida.';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_seleccion)) <>
     (SELECT count(DISTINCT s->>'id') FROM jsonb_array_elements(p_seleccion) s) THEN
    RAISE EXCEPTION 'No puede repetir actualizaciones.';
  END IF;
  FOR v_beneficiario IN
    SELECT DISTINCT a.beneficiario_id FROM public.portal_actualizaciones a
    WHERE a.id IN (SELECT (s->>'id')::BIGINT FROM jsonb_array_elements(p_seleccion) s)
    ORDER BY a.beneficiario_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('rp-actualizacion:' || v_doc.rp_ventana_id::TEXT || ':' || v_beneficiario::TEXT, 0));
  END LOOP;
  PERFORM 1 FROM public.portal_actualizaciones a
    WHERE a.id IN (SELECT (s->>'id')::BIGINT FROM jsonb_array_elements(p_seleccion) s)
    ORDER BY a.id FOR SHARE;
  PERFORM 1 FROM public.portal_beneficiarios b
    WHERE b.id IN (SELECT a.beneficiario_id FROM public.portal_actualizaciones a
      WHERE a.id IN (SELECT (s->>'id')::BIGINT FROM jsonb_array_elements(p_seleccion) s))
    ORDER BY b.id FOR SHARE;
  PERFORM 1 FROM public.inscripciones i
    WHERE i.id IN (SELECT b.inscripcion_pk FROM public.portal_beneficiarios b
      JOIN public.portal_actualizaciones a ON a.beneficiario_id=b.id
      WHERE a.id IN (SELECT (s->>'id')::BIGINT FROM jsonb_array_elements(p_seleccion) s)
        AND b.convocatoria_id IS NULL)
    ORDER BY i.id FOR SHARE;
  PERFORM 1 FROM public.portal_documentos_cargue d WHERE d.id IN (
    SELECT r.rp_id FROM public.portal_rp_actualizaciones r
    WHERE r.ventana_id=v_doc.rp_ventana_id AND r.rp_id<>p_documento_id
      AND r.beneficiario_id IN (SELECT a.beneficiario_id FROM public.portal_actualizaciones a
        WHERE a.id IN (SELECT (s->>'id')::BIGINT FROM jsonb_array_elements(p_seleccion) s))
  ) ORDER BY d.id FOR SHARE;
  v_elegibles := public.listar_actualizaciones_rp(p_documento_id);
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_antes FROM public.portal_valores_cargue v WHERE v.documento_id = p_documento_id;
  PERFORM set_config('app.guardando_rp',p_documento_id::TEXT,TRUE);
  PERFORM set_config('app.incorporando_actualizacion',p_documento_id::TEXT,TRUE);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_seleccion) ORDER BY (value->>'id')::BIGINT LOOP
    SELECT f INTO v_persona FROM jsonb_array_elements(v_elegibles) f WHERE f->>'id' = v_item->>'id';
    IF v_persona IS NULL OR v_persona->'valido' IS DISTINCT FROM 'true'::JSONB THEN
      RAISE EXCEPTION 'Una actualización dejó de ser elegible o tiene identificación o nombre inválidos. Recargue la lista.';
    END IF;
    SELECT COALESCE(jsonb_agg(a ORDER BY a->>'id'), '[]'::JSONB) INTO v_previos
      FROM jsonb_array_elements(v_persona->'anteriores') a;
    SELECT COALESCE(jsonb_agg(a ORDER BY a->>'id'), '[]'::JSONB) INTO v_seleccion
      FROM jsonb_array_elements(v_item->'anteriores') a;
    IF v_previos IS DISTINCT FROM v_seleccion THEN
      RAISE EXCEPTION 'Cambió la lista de RP anteriores. Recargue y confirme los duplicados nuevamente.';
    END IF;
    IF jsonb_array_length(v_previos)>0 AND v_item->'confirmado' IS DISTINCT FROM 'true'::JSONB THEN
      RAISE EXCEPTION 'Debe confirmar expresamente cada beneficiario que ya figura en otro RP.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.portal_valores_cargue v
      WHERE v.documento_id = p_documento_id AND v.identificacion = v_persona->>'identificacion') THEN
      RAISE EXCEPTION 'La identificación % ya está en este RP.', v_persona->>'identificacion';
    END IF;
    v_modalidad := upper(translate(v_persona->>'modalidad', 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNAEIOUN'));
    v_valor := CASE WHEN v_modalidad LIKE '%SUENO%' THEN p_valor_suenos
      WHEN v_modalidad LIKE '%MERITO%' THEN p_valor_merito ELSE '' END;
    v_fila := jsonb_build_object(
      'origen','actualizacion:' || (v_persona->>'id'), 'nombre',v_persona->>'nombre',
      'modalidad',v_persona->>'modalidad', 'tercero_presupuestal',v_persona->>'identificacion',
      'no_rp','','subconsecutivo','','descripcion','','fecha','','no_cdp','','subconsecutivo_cdp','',
      'origen_legal_apropiacion','5','proyecto','841','entidad','9901','rubro_presupuestal','2.3.2.02.02.009',
      'fuente_financiacion','','valor',v_valor,'liquidacion',v_valor,'contrato','','firma_mecanica','NO',
      'valor_confirmado',false,'tercero_confirmado',false
    );
    INSERT INTO public.portal_valores_cargue(documento_id, identificacion, nombre_beneficiario, datos_rp, valor_bruto, valor_neto)
    VALUES (p_documento_id, v_persona->>'identificacion',
      CASE WHEN length(v_persona->>'nombre') <= 200 THEN v_persona->>'nombre' END,
      v_fila, COALESCE(NULLIF(v_valor,'')::NUMERIC,0), COALESCE(NULLIF(v_valor,'')::NUMERIC,0))
    RETURNING id INTO v_fila_id;
    INSERT INTO public.portal_rp_actualizaciones(fila_id,rp_id,actualizacion_id,beneficiario_id,ventana_id,incorporado_por)
    VALUES (v_fila_id,p_documento_id,(v_persona->>'id')::BIGINT,(v_persona->>'beneficiario_id')::BIGINT,v_doc.rp_ventana_id,auth.uid());
  END LOOP;
  PERFORM set_config('app.incorporando_actualizacion','',TRUE);
  PERFORM set_config('app.guardando_rp','',TRUE);
  UPDATE public.portal_documentos_cargue SET editado_por = auth.uid(), editado_en = clock_timestamp(),
    cantidad_registros = (SELECT count(*) FROM public.portal_valores_cargue WHERE documento_id = p_documento_id)
    WHERE id = p_documento_id;
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_despues FROM public.portal_valores_cargue v WHERE v.documento_id = p_documento_id;
  INSERT INTO public.portal_transiciones_documento(documento_id,estado_anterior,estado_nuevo,rol_quien_transiciona,usuario_id,comentario,datos_cambio)
    VALUES (p_documento_id, 'borrador', 'borrador', 'admin_educacion', auth.uid(),
      'Actualizaciones incorporadas', jsonb_build_object('antes',v_antes,'despues',v_despues,
        'ventana_id',v_doc.rp_ventana_id,'duplicados_confirmados',p_seleccion));
  RETURN public.leer_rp_cargue(p_documento_id);
END;
$$;

ALTER FUNCTION public.guardar_rp_cargue(UUID, UUID, JSONB, TIMESTAMPTZ) RENAME TO guardar_rp_cargue_terceros_interno;
REVOKE ALL ON FUNCTION public.guardar_rp_cargue_terceros_interno(UUID, UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guardar_rp_cargue(p_documento_id UUID, p_terceros_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_educacion BOOLEAN; v_f JSONB; v_old JSONB;
  v_id UUID; v_ids UUID[] := ARRAY[]::UUID[]; v_errores TEXT[]; v_antes JSONB; v_despues JSONB;
  v_pre TEXT[] := ARRAY['no_rp','subconsecutivo','descripcion','fecha','no_cdp','subconsecutivo_cdp','fuente_financiacion','contrato','tercero_confirmado'];
  v_edu TEXT[] := ARRAY['valor','liquidacion','valor_confirmado'];
  v_todas TEXT[] := ARRAY['id','origen','nombre','modalidad','tercero_presupuestal','origen_legal_apropiacion','proyecto','entidad','rubro_presupuestal','firma_mecanica'];
  v_anio TEXT;
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'rp' THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  IF v_doc.rp_origen = 'terceros' THEN
    RETURN public.guardar_rp_cargue_terceros_interno(p_documento_id,p_terceros_id,p_filas,p_editado_en);
  END IF;
  v_educacion := v_doc.estado='borrador' AND public.fn_tiene_rol('admin_educacion') IS TRUE;
  IF v_educacion THEN
    PERFORM public.exigir_educacion_rp_actualizacion();
  ELSIF v_doc.estado <> 'enviado_para_revision' OR public.fn_tiene_rol('admin_presupuesto') IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo Educación en borrador o Presupuesto en revisión puede editar RP.';
  END IF;
  IF p_terceros_id IS NOT NULL THEN RAISE EXCEPTION 'Este RP no tiene documento TERCEROS de origen.'; END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN RAISE EXCEPTION 'El documento cambió. Recargue antes de guardar.'; END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Las filas deben ser una lista.'; END IF;
  SELECT anio::TEXT INTO v_anio FROM public.convocatorias WHERE id=v_doc.convocatoria_id;
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_antes FROM public.portal_valores_cargue v WHERE v.documento_id=p_documento_id;
  PERFORM set_config('app.guardando_rp',p_documento_id::TEXT,TRUE);
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_filas) LOOP
    IF jsonb_typeof(v_f) IS DISTINCT FROM 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_f) k WHERE NOT k=ANY(v_todas||v_pre||v_edu)
    ) OR EXISTS (SELECT 1 FROM jsonb_each(v_f) WHERE key NOT IN ('id','valor_confirmado','tercero_confirmado') AND jsonb_typeof(value)<>'string')
      OR jsonb_typeof(v_f->'valor_confirmado') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_f->'tercero_confirmado') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Campos o tipos de datos RP inválidos.';
    END IF;
    v_id := (v_f->>'id')::UUID;
    SELECT public.fila_rp(to_jsonb(v)) INTO v_old FROM public.portal_valores_cargue v
      JOIN public.portal_rp_actualizaciones r ON r.fila_id=v.id AND r.rp_id=p_documento_id
      WHERE v.id=v_id AND v.documento_id=p_documento_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Solo puede editar filas incorporadas desde actualizaciones aprobadas.'; END IF;
    v_old := jsonb_set(jsonb_set(v_old,'{no_rp}',to_jsonb(public.formatear_numero_rp(v_old->>'no_rp',v_anio))),
      '{no_cdp}',to_jsonb(public.formatear_numero_rp(v_old->>'no_cdp',v_anio)));
    IF v_educacion AND (v_f-v_edu) IS DISTINCT FROM (v_old-v_edu) THEN
      RAISE EXCEPTION 'Educación solo puede editar el importe y su confirmación.';
    ELSIF NOT v_educacion AND (v_f-v_pre) IS DISTINCT FROM (v_old-v_pre) THEN
      RAISE EXCEPTION 'Presupuesto solo puede editar sus campos; no personas ni importes.';
    END IF;
    v_errores := public.errores_fila_rp(v_f,'borrador');
    IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
    IF v_id=ANY(v_ids) THEN RAISE EXCEPTION 'No puede repetir filas.'; END IF;
    v_ids := array_append(v_ids,v_id);
    UPDATE public.portal_valores_cargue SET datos_rp=v_f-'id',
      valor_bruto=COALESCE(NULLIF(v_f->>'valor','')::NUMERIC,0),
      valor_neto=COALESCE(NULLIF(v_f->>'liquidacion','')::NUMERIC,0),
      numero_rp=NULLIF(v_f->>'no_rp','') WHERE id=v_id;
  END LOOP;
  IF NOT v_educacion AND EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=p_documento_id AND NOT id=ANY(v_ids)) THEN
    RAISE EXCEPTION 'Presupuesto no puede eliminar personas.';
  END IF;
  DELETE FROM public.portal_valores_cargue WHERE documento_id=p_documento_id AND NOT id=ANY(v_ids);
  UPDATE public.portal_documentos_cargue SET editado_por=auth.uid(), editado_en=clock_timestamp(),
    cantidad_registros=cardinality(v_ids) WHERE id=p_documento_id;
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_despues FROM public.portal_valores_cargue v WHERE v.documento_id=p_documento_id;
  INSERT INTO public.portal_transiciones_documento(documento_id,estado_anterior,estado_nuevo,rol_quien_transiciona,usuario_id,comentario,datos_cambio)
    VALUES(p_documento_id,v_doc.estado,v_doc.estado,CASE WHEN v_educacion THEN 'admin_educacion' ELSE 'admin_presupuesto' END,
      auth.uid(),'Datos RP guardados',jsonb_build_object('antes',v_antes,'despues',v_despues,'ventana_id',v_doc.rp_ventana_id));
  PERFORM set_config('app.guardando_rp','',TRUE);
  RETURN public.leer_rp_cargue(p_documento_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_rp_documento(p_documento_id UUID, p_etapa TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_f RECORD; v_e TEXT[];
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id AND tipo_documento='rp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  IF v_doc.rp_origen='terceros' AND NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue
    WHERE id=v_doc.rp_terceros_id AND convocatoria_id=v_doc.convocatoria_id AND tipo_documento='terceros'
      AND estado IN ('aprobado','finalizado') AND aprobado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'Seleccione un documento TERCEROS aprobado de esta convocatoria';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.portal_valores_cargue WHERE documento_id=p_documento_id) THEN RAISE EXCEPTION 'Agregue al menos una persona'; END IF;
  FOR v_f IN SELECT * FROM public.portal_valores_cargue WHERE documento_id=p_documento_id LOOP
    IF COALESCE(v_f.datos_rp->>'origen','') = '' THEN RAISE EXCEPTION 'Vincule el origen de la persona % antes de enviar',v_f.identificacion; END IF;
    IF v_doc.rp_origen='actualizaciones' AND NOT EXISTS
      (SELECT 1 FROM public.portal_rp_actualizaciones r WHERE r.fila_id=v_f.id AND r.rp_id=p_documento_id) THEN
      RAISE EXCEPTION 'Falta la trazabilidad de la actualización de %',v_f.identificacion;
    END IF;
    v_e := public.errores_fila_rp(public.fila_rp(to_jsonb(v_f)),p_etapa);
    IF cardinality(v_e)>0 THEN RAISE EXCEPTION 'Tercero %: %',v_f.identificacion,array_to_string(v_e,'; '); END IF;
  END LOOP;
  IF EXISTS (SELECT identificacion FROM public.portal_valores_cargue WHERE documento_id=p_documento_id GROUP BY identificacion HAVING count(*)>1) THEN
    RAISE EXCEPTION 'No puede repetir terceros en RP';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verificar_rp_habilitado(p_documento_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE;
BEGIN
  IF (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Su rol no puede generar RP';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id AND tipo_documento='rp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  IF v_doc.rp_origen='terceros' THEN PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id); END IF;
END;
$$;

CREATE FUNCTION public.registrar_cambio_actualizacion_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_r RECORD;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    FOR v_r IN SELECT r.rp_id, r.ventana_id FROM public.portal_rp_actualizaciones r
      WHERE r.actualizacion_id=NEW.id LOOP
      PERFORM public.registrar_evento_bitacora(
        p_beneficiario_id => NEW.beneficiario_id, p_actualizacion_id => NEW.id,
        p_tipo_evento => 'actualizacion_cambio_estado_rp', p_categoria => 'actualizaciones',
        p_accion => 'update', p_campo_cambio => 'estado',
        p_estado_anterior => to_jsonb(OLD.estado), p_estado_nuevo => to_jsonb(NEW.estado),
        p_nota => 'Cambio de estado de actualización incorporada a RP',
        p_metadata => jsonb_build_object('rp_id',v_r.rp_id,'ventana_id',v_r.ventana_id));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER z_cambio_actualizacion_rp AFTER UPDATE OF estado ON public.portal_actualizaciones
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_actualizacion_rp();

CREATE FUNCTION public.alertas_actualizaciones_rp(p_rp_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_roles JSONB; v_role TEXT; v_resultado JSONB;
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501'; END IF;
  SELECT raw_app_meta_data->'roles', raw_app_meta_data->>'role' INTO v_roles, v_role
    FROM auth.users WHERE id=auth.uid();
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_rp_id AND tipo_documento='rp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento RP no encontrado.'; END IF;
  IF NOT (
    (v_roles @> '["admin_educacion"]'::JSONB OR v_role='admin_educacion')
    OR (v_roles @> '["admin_presupuesto"]'::JSONB OR v_role='admin_presupuesto')
    OR ((v_roles @> '["admin_contabilidad"]'::JSONB OR v_role='admin_contabilidad') AND v_doc.estado IN ('aprobado','finalizado') AND v_doc.aprobado_por IS NOT NULL)
    OR ((v_roles @> '["admin_pagos"]'::JSONB OR v_role='admin_pagos') AND EXISTS
      (SELECT 1 FROM public.portal_archivos_contabilidad c WHERE c.rp_id=p_rp_id AND c.estado='aprobado'))
  ) IS TRUE THEN RAISE EXCEPTION 'Su rol no puede consultar estas alertas.' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'actualizacion_id', b.actualizacion_id, 'beneficiario', v.datos_rp->>'nombre',
    'identificacion', v.identificacion, 'estado_anterior', b.estado_anterior,
    'estado_nuevo', b.estado_nuevo, 'estado_actual', a.estado, 'fecha', b.created_at
  ) ORDER BY b.created_at DESC, b.id DESC),'[]'::JSONB)
  INTO v_resultado FROM public.portal_beneficiario_bitacora b
    JOIN public.portal_rp_actualizaciones r ON r.rp_id=p_rp_id AND r.actualizacion_id=b.actualizacion_id
    JOIN public.portal_valores_cargue v ON v.id=r.fila_id
    JOIN public.portal_actualizaciones a ON a.id=r.actualizacion_id
    WHERE b.tipo_evento='actualizacion_cambio_estado_rp' AND b.metadata->>'rp_id'=p_rp_id::TEXT;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_educacion_rp_actualizacion(), public.registrar_cambio_actualizacion_rp(),
  public.crear_rp_actualizaciones(UUID,BIGINT), public.listar_actualizaciones_rp(UUID),
  public.incorporar_actualizaciones_rp(UUID,TIMESTAMPTZ,JSONB,TEXT,TEXT),
  public.guardar_rp_cargue(UUID,UUID,JSONB,TIMESTAMPTZ), public.alertas_actualizaciones_rp(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_rp_actualizaciones(UUID,BIGINT), public.listar_actualizaciones_rp(UUID),
  public.incorporar_actualizaciones_rp(UUID,TIMESTAMPTZ,JSONB,TEXT,TEXT),
  public.guardar_rp_cargue(UUID,UUID,JSONB,TIMESTAMPTZ), public.alertas_actualizaciones_rp(UUID) TO authenticated;
NOTIFY pgrst,'reload schema';
