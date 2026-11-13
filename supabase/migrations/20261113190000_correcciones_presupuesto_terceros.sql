CREATE TABLE public.portal_correcciones_terceros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  fila_id UUID NOT NULL,
  identificacion TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  motivo TEXT NOT NULL CHECK (NULLIF(trim(motivo), '') IS NOT NULL),
  usuario_id UUID NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.portal_correcciones_terceros(documento_id, id DESC);
ALTER TABLE public.portal_correcciones_terceros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_correcciones_terceros FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_correcciones_terceros TO authenticated;
CREATE POLICY correcciones_lectura_documento ON public.portal_correcciones_terceros
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.portal_documentos_cargue d WHERE d.id = documento_id)
);

CREATE FUNCTION public.celdas_tercero(p_fila JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cc_nit', p_fila->>'identificacion', 'tipo_identificacion', p_fila->>'tipo_identificacion',
    'email', p_fila->>'email', 'telefono', p_fila->>'telefono', 'direccion', p_fila->>'direccion'
  ) || COALESCE(p_fila->'datos_tercero', '{}'::JSONB);
$$;
REVOKE ALL ON FUNCTION public.celdas_tercero(JSONB) FROM PUBLIC, anon, authenticated;

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
  ELSIF v_doc.tipo_documento = 'rp' AND TG_OP <> 'DELETE' AND v_doc.estado NOT IN ('aprobado','finalizado') THEN
    PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.corregir_tercero_presupuesto(
  p_documento_id UUID, p_fila_id UUID, p_cambios JSONB, p_motivo TEXT, p_editado_en TIMESTAMPTZ
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE;
  v_fila public.portal_valores_cargue%ROWTYPE;
  v_antes JSONB; v_despues JSONB; v_campo TEXT; v_nombres BOOLEAN;
  v_permitidos TEXT[] := ARRAY['cc_nit','tipo_identificacion','email','telefono','direccion',
    'primer_nombre','segundo_nombre','primer_apellido','segundo_apellido','banco','tipo_cuenta','numero_cuenta','nombres_confirmados'];
BEGIN
  IF public.fn_tiene_rol('admin_presupuesto') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Presupuesto puede registrar correcciones'; END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Debe indicar el motivo de la corrección'; END IF;
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' OR p_cambios = '{}'::JSONB THEN
    RAISE EXCEPTION 'Debe indicar las celdas a corregir';
  END IF;
  FOR v_campo IN SELECT jsonb_object_keys(p_cambios) LOOP
    IF NOT v_campo = ANY(v_permitidos) THEN RAISE EXCEPTION 'Campo no editable: %', v_campo; END IF;
    IF jsonb_typeof(p_cambios->v_campo) IS DISTINCT FROM (CASE WHEN v_campo = 'nombres_confirmados' THEN 'boolean' ELSE 'string' END) THEN
      RAISE EXCEPTION 'Tipo de dato no admitido para %', v_campo;
    END IF;
  END LOOP;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'enviado_para_revision' THEN
    RAISE EXCEPTION 'Solo puede corregir documentos TERCEROS pendientes de revisión';
  END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió. Recargue antes de guardar para no sobrescribir otra edición.';
  END IF;
  SELECT * INTO v_fila FROM public.portal_valores_cargue WHERE id = p_fila_id AND documento_id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La fila no pertenece al documento o fue eliminada'; END IF;
  v_antes := public.celdas_tercero(to_jsonb(v_fila));
  v_despues := v_antes || (SELECT jsonb_object_agg(key,
    CASE WHEN key = 'nombres_confirmados' THEN value ELSE to_jsonb(trim(value #>> '{}')) END) FROM jsonb_each(p_cambios));
  v_nombres := EXISTS (SELECT 1 FROM unnest(ARRAY['primer_nombre','segundo_nombre','primer_apellido','segundo_apellido']) c
    WHERE v_antes->c IS DISTINCT FROM v_despues->c);
  IF v_nombres AND p_cambios->'nombres_confirmados' IS DISTINCT FROM 'true'::JSONB THEN
    RAISE EXCEPTION 'Confirme los nombres y apellidos corregidos antes de guardar';
  END IF;
  IF v_antes = v_despues THEN RAISE EXCEPTION 'No hay cambios para guardar'; END IF;
  PERFORM set_config('app.motivo_correccion_tercero', trim(p_motivo), TRUE);
  UPDATE public.portal_valores_cargue SET
    identificacion = v_despues->>'cc_nit', tipo_identificacion = v_despues->>'tipo_identificacion',
    email = v_despues->>'email', telefono = v_despues->>'telefono', direccion = v_despues->>'direccion',
    datos_tercero = v_fila.datos_tercero || (v_despues - ARRAY['cc_nit','tipo_identificacion','email','telefono','direccion'])
  WHERE id = p_fila_id;
  PERFORM set_config('app.motivo_correccion_tercero', '', TRUE);
  UPDATE public.portal_documentos_cargue SET editado_en = clock_timestamp(), editado_por = auth.uid() WHERE id = p_documento_id;
  RETURN public.leer_terceros_cargue(p_documento_id);
END;
$$;
REVOKE ALL ON FUNCTION public.corregir_tercero_presupuesto(UUID,UUID,JSONB,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corregir_tercero_presupuesto(UUID,UUID,JSONB,TEXT,TIMESTAMPTZ) TO authenticated;

CREATE FUNCTION public.leer_correcciones_terceros(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id DESC), '[]'::JSONB)
  FROM public.portal_correcciones_terceros c WHERE documento_id = p_documento_id;
$$;
REVOKE ALL ON FUNCTION public.leer_correcciones_terceros(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leer_correcciones_terceros(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
