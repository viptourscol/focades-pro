ALTER TABLE public.portal_valores_cargue
  ADD COLUMN IF NOT EXISTS datos_tercero JSONB NOT NULL DEFAULT '{}'::JSONB,
  ALTER COLUMN telefono TYPE VARCHAR(30),
  ALTER COLUMN direccion TYPE VARCHAR(500);

COMMENT ON COLUMN public.portal_valores_cargue.datos_tercero IS
  'Nombres separados, confirmacion de Educacion y datos bancarios del documento TERCEROS; no modifica el perfil fuente.';

CREATE OR REPLACE FUNCTION public.codigo_identificacion_tercero(p_valor TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE regexp_replace(lower(translate(trim(p_valor), 'áéíóú', 'aeiou')), '[^a-z0-9]', '', 'g')
    WHEN 'cc' THEN '13' WHEN 'ceduladeciudadania' THEN '13'
    WHEN 'rc' THEN '11' WHEN 'registro' THEN '11' WHEN 'registrocivil' THEN '11'
    WHEN 'ti' THEN '12' WHEN 'tarjetadeidentidad' THEN '12'
    WHEN 'te' THEN '21' WHEN 'tarjetadeextranjeria' THEN '21'
    WHEN 'ce' THEN '22' WHEN 'ceduladeextranjeria' THEN '22'
    WHEN 'cuenta' THEN '14' WHEN 'nit' THEN '31'
    WHEN 'pas' THEN '41' WHEN 'pa' THEN '41' WHEN 'pasaporte' THEN '41'
    WHEN 'tipodedocumentoextranjero' THEN '42'
    WHEN 'sinidentificaciondelexterior' THEN '43' WHEN 'otros' THEN '44'
    ELSE trim(p_valor) END;
$$;

CREATE FUNCTION public.tipo_cuenta_tercero(p_valor TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN lower(trim(p_valor)) IN ('ahorro','ahorros','cuenta de ahorro','cuenta de ahorros') THEN 'AHORROS'
    WHEN lower(trim(p_valor)) IN ('corriente','cuenta corriente') THEN 'CORRIENTE' ELSE trim(p_valor) END;
$$;

CREATE OR REPLACE FUNCTION public.exigir_terceros_aprobados(p_convocatoria UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_documentos_cargue
    WHERE convocatoria_id = p_convocatoria AND tipo_documento = 'terceros'
      AND estado IN ('aprobado', 'finalizado') AND aprobado_por IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Presupuesto debe aprobar un documento TERCEROS de esta convocatoria antes de continuar con RP';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.errores_fila_tercero(p_fila JSONB, p_completo BOOLEAN DEFAULT FALSE)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_d JSONB := COALESCE(p_fila->'datos_tercero', '{}'::JSONB);
  v_e TEXT[] := ARRAY[]::TEXT[];
  v_c TEXT;
  v_val TEXT;
  v_campos JSONB := jsonb_build_object(
    'C.C/NIT', p_fila->>'identificacion', 'Tipo Identificación', p_fila->>'tipo_identificacion',
    'Email', p_fila->>'email', 'Teléfono', p_fila->>'telefono', 'Dirección', p_fila->>'direccion',
    'Primer Nombre', v_d->>'primer_nombre', 'Primer Apellido', v_d->>'primer_apellido',
    'Segundo Apellido', v_d->>'segundo_apellido', 'Banco', v_d->>'banco',
    'Tipo Cuenta', v_d->>'tipo_cuenta', 'Numero cuenta', v_d->>'numero_cuenta'
  );
BEGIN
  IF p_completo THEN
    FOR v_c, v_val IN SELECT key, value FROM jsonb_each_text(v_campos) LOOP
      IF NULLIF(trim(v_val), '') IS NULL THEN v_e := array_append(v_e, v_c || ' es obligatorio'); END IF;
    END LOOP;
    IF v_d->'nombres_confirmados' IS DISTINCT FROM 'true'::JSONB THEN
      v_e := array_append(v_e, 'Educación debe confirmar los nombres y apellidos');
    END IF;
  END IF;
  IF NULLIF(p_fila->>'identificacion', '') IS NOT NULL
    AND (p_fila->>'identificacion' !~ '^[0-9]{1,15}$') THEN
    v_e := array_append(v_e, 'C.C/NIT debe contener entre 1 y 15 dígitos');
  END IF;
  FOREACH v_c IN ARRAY ARRAY['primer_nombre','segundo_nombre','primer_apellido','segundo_apellido'] LOOP
    IF length(v_d->>v_c) > 120 THEN v_e := array_append(v_e, v_c || ': máximo 120 caracteres'); END IF;
  END LOOP;
  IF length(p_fila->>'email') > 100 OR length(p_fila->>'telefono') > 30 OR length(p_fila->>'direccion') > 500 THEN
    v_e := array_append(v_e, 'Email, teléfono o dirección excede la longitud permitida');
  END IF;
  IF NULLIF(p_fila->>'email', '') IS NOT NULL AND p_fila->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    v_e := array_append(v_e, 'Email inválido');
  END IF;
  IF NULLIF(p_fila->>'tipo_identificacion', '') IS NOT NULL AND p_fila->>'tipo_identificacion'
    NOT IN ('13','11','12','21','22','14','31','41','42','43','44') THEN
    v_e := array_append(v_e, 'Tipo Identificación no admitido; debe seleccionar un código de Presupuesto');
  END IF;
  IF NULLIF(v_d->>'tipo_cuenta', '') IS NOT NULL AND v_d->>'tipo_cuenta' NOT IN ('AHORROS','CORRIENTE') THEN
    v_e := array_append(v_e, 'Tipo Cuenta debe ser AHORROS o CORRIENTE');
  END IF;
  IF NULLIF(v_d->>'numero_cuenta', '') IS NOT NULL AND v_d->>'numero_cuenta' !~ '^[0-9]+$' THEN
    v_e := array_append(v_e, 'Numero cuenta solo admite dígitos');
  END IF;
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_terceros_para_revision(p_documento UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fila RECORD; v_errores TEXT[]; v_total INTEGER := 0;
BEGIN
  FOR v_fila IN SELECT v.* FROM public.portal_valores_cargue v WHERE documento_id = p_documento ORDER BY creado_en, id LOOP
    v_total := v_total + 1;
    v_errores := public.errores_fila_tercero(to_jsonb(v_fila), TRUE);
    IF cardinality(v_errores) > 0 THEN
      RAISE EXCEPTION 'Fila %: %', v_total, array_to_string(v_errores, '; ');
    END IF;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'El documento no tiene terceros'; END IF;
  IF EXISTS (SELECT identificacion FROM public.portal_valores_cargue WHERE documento_id = p_documento GROUP BY identificacion HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Hay identificaciones duplicadas en el documento';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.datos_fuente_tercero(p_convocatoria UUID, p_identificacion TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH fuente AS (
    SELECT i.*, to_jsonb(p) AS persona
    FROM public.inscripciones i LEFT JOIN public.personas p ON p.id = i.persona_id
    WHERE i.convocatoria_id = p_convocatoria AND p_identificacion = COALESCE(
      NULLIF(trim(p.n_documento), ''), NULLIF(trim(i.n_documento), ''),
      NULLIF(trim(i.datos_formulario->>'n_documento'), ''), NULLIF(trim(i.datos_formulario->>'numero_documento'), ''))
    ORDER BY i.id LIMIT 1
  ), datos AS (
    SELECT f.*, to_jsonb(b) AS beneficiario
    FROM fuente f LEFT JOIN LATERAL (
      SELECT b.* FROM public.portal_beneficiarios b
      WHERE to_jsonb(b)->>'inscripcion_id' = f.id::TEXT
         OR to_jsonb(b)->>'inscripcion_pk' = f.id::TEXT
         OR (to_jsonb(b)->>'id' = to_jsonb(f)->>'beneficiario_portal_id')
         OR (to_jsonb(b)->>'persona_id' = f.persona_id::TEXT
             AND to_jsonb(b)->>'convocatoria_id' = p_convocatoria::TEXT)
      ORDER BY (to_jsonb(b)->>'inscripcion_id' = f.id::TEXT) DESC NULLS LAST,
        to_jsonb(b)->>'updated_at' DESC NULLS LAST, b.id LIMIT 1
    ) b ON TRUE
  )
  SELECT COALESCE((SELECT jsonb_strip_nulls(jsonb_build_object(
    'primer_nombre', COALESCE(NULLIF(persona->>'primer_nombre',''), NULLIF(datos_formulario->>'primer_nombre','')),
    'segundo_nombre', COALESCE(NULLIF(persona->>'segundo_nombre',''), NULLIF(datos_formulario->>'segundo_nombre','')),
    'primer_apellido', COALESCE(NULLIF(persona->>'primer_apellido',''), NULLIF(datos_formulario->>'primer_apellido','')),
    'segundo_apellido', COALESCE(NULLIF(persona->>'segundo_apellido',''), NULLIF(datos_formulario->>'segundo_apellido','')),
    'banco', COALESCE(NULLIF(datos_bancarios->>'banco',''), NULLIF(persona->>'banco',''),
      NULLIF(beneficiario->>'nombre_banco',''), NULLIF(beneficiario->>'banco','')),
    'tipo_cuenta', public.tipo_cuenta_tercero(COALESCE(NULLIF(datos_bancarios->>'tipo_cuenta',''), NULLIF(persona->>'tipo_cuenta',''),
      NULLIF(beneficiario->>'tipo_cuenta_bancaria',''), NULLIF(beneficiario->>'tipo_cuenta',''))),
    'numero_cuenta', COALESCE(NULLIF(datos_bancarios->>'numero_cuenta',''), NULLIF(persona->>'ncuenta_bancaria',''),
      NULLIF(beneficiario->>'numero_cuenta',''), NULLIF(beneficiario->>'cuenta_bancaria',''))
  )) FROM datos), '{}'::JSONB);
$$;

CREATE OR REPLACE FUNCTION public.completar_datos_terceros(p_documento_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_actualizadas INTEGER;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educación puede completar datos de terceros'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se completan datos de TERCEROS en borrador';
  END IF;
  UPDATE public.portal_valores_cargue v SET
    datos_tercero = public.datos_fuente_tercero(v_doc.convocatoria_id, v.identificacion) || v.datos_tercero,
    tipo_identificacion = public.codigo_identificacion_tercero(v.tipo_identificacion)
  WHERE v.documento_id = p_documento_id AND (
    v.datos_tercero IS DISTINCT FROM (public.datos_fuente_tercero(v_doc.convocatoria_id, v.identificacion) || v.datos_tercero)
    OR v.tipo_identificacion IS DISTINCT FROM public.codigo_identificacion_tercero(v.tipo_identificacion));
  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  IF v_actualizadas > 0 THEN
    UPDATE public.portal_documentos_cargue SET editado_en = clock_timestamp(), editado_por = auth.uid() WHERE id = p_documento_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_terceros_cargue(p_documento_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE;
  v_edicion TIMESTAMPTZ := clock_timestamp();
  v_filas JSONB;
  v_errores TEXT[];
  v_fila RECORD;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educación puede editar terceros'; END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN RAISE EXCEPTION 'Las filas deben ser una lista de terceros'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se pueden editar documentos TERCEROS en borrador';
  END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió. Recargue antes de guardar para no sobrescribir otra edición.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_filas) fila WHERE jsonb_typeof(fila) <> 'object') THEN
    RAISE EXCEPTION 'Cada fila debe contener los datos de un tercero';
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS tmp_terceros_completos (
    id UUID, identificacion TEXT, nombre_beneficiario TEXT, tipo_identificacion TEXT,
    email TEXT, telefono TEXT, direccion TEXT, ciudad TEXT, datos_tercero JSONB
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.tmp_terceros_completos;
  INSERT INTO pg_temp.tmp_terceros_completos
  SELECT (fila->>'id')::UUID, trim(COALESCE(fila->>'cc_nit','')), NULLIF(trim(fila->>'nombre_referencia'),''),
    public.codigo_identificacion_tercero(COALESCE(fila->>'tipo_identificacion','')),
    trim(COALESCE(fila->>'email','')), trim(COALESCE(fila->>'telefono','')), trim(COALESCE(fila->>'direccion','')),
    trim(COALESCE(fila->>'ciudad_residencia','')),
    jsonb_build_object('primer_nombre', trim(COALESCE(fila->>'primer_nombre','')),
      'segundo_nombre', trim(COALESCE(fila->>'segundo_nombre','')), 'primer_apellido', trim(COALESCE(fila->>'primer_apellido','')),
      'segundo_apellido', trim(COALESCE(fila->>'segundo_apellido','')),
      'banco', trim(COALESCE(fila->>'banco','')), 'tipo_cuenta', public.tipo_cuenta_tercero(COALESCE(fila->>'tipo_cuenta','')),
      'numero_cuenta', trim(COALESCE(fila->>'numero_cuenta','')), 'nombres_confirmados', fila->'nombres_confirmados' = 'true'::JSONB)
  FROM jsonb_array_elements(p_filas) fila;
  FOR v_fila IN SELECT * FROM pg_temp.tmp_terceros_completos LOOP
    v_errores := public.errores_fila_tercero(to_jsonb(v_fila));
    IF cardinality(v_errores) > 0 THEN RAISE EXCEPTION '%', array_to_string(v_errores, '; '); END IF;
  END LOOP;
  IF EXISTS (SELECT identificacion FROM pg_temp.tmp_terceros_completos WHERE identificacion <> '' GROUP BY identificacion HAVING COUNT(*) > 1)
    OR EXISTS (SELECT id FROM pg_temp.tmp_terceros_completos WHERE id IS NOT NULL GROUP BY id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'No puede repetir identificación o fila';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.tmp_terceros_completos t WHERE t.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.portal_valores_cargue v WHERE v.id = t.id AND v.documento_id = p_documento_id)) THEN
    RAISE EXCEPTION 'Una fila no pertenece al documento o fue eliminada';
  END IF;
  DELETE FROM public.portal_valores_cargue v WHERE documento_id = p_documento_id
    AND NOT EXISTS (SELECT 1 FROM pg_temp.tmp_terceros_completos t WHERE t.id = v.id);
  UPDATE public.portal_valores_cargue v SET
    identificacion = t.identificacion, nombre_beneficiario = t.nombre_beneficiario,
    tipo_identificacion = t.tipo_identificacion, email = t.email, telefono = t.telefono,
    direccion = t.direccion, ciudad = t.ciudad, datos_tercero = v.datos_tercero || t.datos_tercero
  FROM pg_temp.tmp_terceros_completos t WHERE v.id = t.id AND v.documento_id = p_documento_id;
  INSERT INTO public.portal_valores_cargue (documento_id, identificacion, nombre_beneficiario,
    tipo_identificacion, email, telefono, direccion, ciudad, datos_tercero)
  SELECT p_documento_id, identificacion, nombre_beneficiario, tipo_identificacion, email, telefono, direccion, ciudad, datos_tercero
  FROM pg_temp.tmp_terceros_completos WHERE id IS NULL;
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.creado_en, v.id), '[]'::JSONB)
  INTO v_filas FROM public.portal_valores_cargue v WHERE documento_id = p_documento_id;
  UPDATE public.portal_documentos_cargue SET cantidad_registros = jsonb_array_length(v_filas),
    editado_en = v_edicion, editado_por = auth.uid() WHERE id = p_documento_id;
  RETURN jsonb_build_object('filas', v_filas, 'editado_en', v_edicion);
END;
$$;

CREATE OR REPLACE FUNCTION public.proteger_filas_terceros_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.documento_id <> OLD.documento_id THEN
    RAISE EXCEPTION 'No puede trasladar filas entre documentos';
  END IF;
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = v_id FOR UPDATE;
  IF v_doc.tipo_documento = 'terceros' THEN
    IF v_doc.estado <> 'borrador' OR public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
      RAISE EXCEPTION 'Solo Educación puede modificar terceros en borrador';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      NEW.tipo_identificacion := public.codigo_identificacion_tercero(NEW.tipo_identificacion);
      IF TG_OP = 'INSERT' THEN
        NEW.datos_tercero := public.datos_fuente_tercero(v_doc.convocatoria_id, NEW.identificacion) || NEW.datos_tercero;
      END IF;
    END IF;
  ELSIF v_doc.tipo_documento = 'rp' AND TG_OP <> 'DELETE' AND v_doc.estado NOT IN ('aprobado','finalizado') THEN
    PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_filas_terceros_rp
BEFORE INSERT OR UPDATE OR DELETE ON public.portal_valores_cargue
FOR EACH ROW EXECUTE FUNCTION public.proteger_filas_terceros_rp();

CREATE OR REPLACE FUNCTION public.proteger_flujo_terceros_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tipo_documento IN ('terceros','rp')
    AND (NEW.tipo_documento <> OLD.tipo_documento OR NEW.convocatoria_id <> OLD.convocatoria_id) THEN
    RAISE EXCEPTION 'No puede cambiar el tipo ni la convocatoria del documento';
  END IF;
  IF NEW.tipo_documento NOT IN ('terceros','rp') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'borrador' OR public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
      RAISE EXCEPTION 'Solo Educación puede crear estos documentos en borrador';
    END IF;
    IF NEW.tipo_documento = 'rp' THEN PERFORM public.exigir_terceros_aprobados(NEW.convocatoria_id); END IF;
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
  ELSIF NEW.estado IN ('enviado_para_revision','aprobado') THEN
    PERFORM public.exigir_terceros_aprobados(NEW.convocatoria_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_flujo_terceros_rp BEFORE INSERT OR UPDATE
ON public.portal_documentos_cargue FOR EACH ROW EXECUTE FUNCTION public.proteger_flujo_terceros_rp();

CREATE OR REPLACE FUNCTION public.transicionar_documento_presupuesto(p_documento_id UUID, p_accion TEXT, p_comentario TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_estado TEXT; v_rol TEXT;
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento NOT IN ('terceros','rp') THEN RAISE EXCEPTION 'Documento TERCEROS/RP no encontrado'; END IF;
  IF p_accion IN ('enviar','reabrir') AND public.fn_tiene_rol('admin_educacion') THEN v_rol := 'admin_educacion';
  ELSIF p_accion IN ('aprobar','rechazar') AND public.fn_tiene_rol('admin_presupuesto') THEN v_rol := 'admin_presupuesto';
  ELSE RAISE EXCEPTION 'Su rol no puede realizar esta acción'; END IF;
  v_estado := CASE p_accion WHEN 'enviar' THEN 'enviado_para_revision' WHEN 'aprobar' THEN 'aprobado'
    WHEN 'rechazar' THEN 'rechazado' WHEN 'reabrir' THEN 'borrador' END;
  IF (p_accion = 'enviar' AND v_doc.estado <> 'borrador')
    OR (p_accion IN ('aprobar','rechazar') AND v_doc.estado <> 'enviado_para_revision')
    OR (p_accion = 'reabrir' AND v_doc.estado <> 'rechazado') THEN
    RAISE EXCEPTION 'La acción no corresponde al estado actual; recargue el documento';
  END IF;
  IF p_accion = 'rechazar' AND NULLIF(trim(p_comentario), '') IS NULL THEN RAISE EXCEPTION 'Indique el motivo del rechazo'; END IF;
  UPDATE public.portal_documentos_cargue SET estado = v_estado,
    comentarios_rechazo = CASE WHEN p_accion = 'rechazar' THEN p_comentario ELSE comentarios_rechazo END,
    aprobado_por = CASE WHEN p_accion = 'aprobar' THEN auth.uid() ELSE aprobado_por END,
    aprobado_en = CASE WHEN p_accion = 'aprobar' THEN clock_timestamp() ELSE aprobado_en END,
    editado_por = auth.uid(), editado_en = clock_timestamp()
  WHERE id = p_documento_id;
  INSERT INTO public.portal_transiciones_documento(documento_id, estado_anterior, estado_nuevo, rol_quien_transiciona, usuario_id, comentario)
  VALUES (p_documento_id, v_doc.estado, v_estado, v_rol, auth.uid(), COALESCE(NULLIF(trim(p_comentario),''), p_accion));
  RETURN jsonb_build_object('success', TRUE, 'documento_id', p_documento_id, 'nuevo_estado', v_estado, 'mensaje', 'Documento: ' || v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.datos_fuente_tercero(UUID,TEXT),
  public.exigir_terceros_aprobados(UUID), public.validar_terceros_para_revision(UUID),
  public.proteger_filas_terceros_rp(), public.proteger_flujo_terceros_rp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.completar_datos_terceros(UUID),
  public.guardar_terceros_cargue(UUID,JSONB,TIMESTAMPTZ),
  public.transicionar_documento_presupuesto(UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_datos_terceros(UUID),
  public.guardar_terceros_cargue(UUID,JSONB,TIMESTAMPTZ),
  public.transicionar_documento_presupuesto(UUID,TEXT,TEXT) TO authenticated;
ALTER FUNCTION public.precargar_rp_convocatoria(UUID,UUID,VARCHAR,VARCHAR) RENAME TO precargar_aspirantes_cargue_interno;
REVOKE ALL ON FUNCTION public.precargar_aspirantes_cargue_interno(UUID,UUID,VARCHAR,VARCHAR) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.precargar_rp_convocatoria(
  p_documento_id UUID, p_convocatoria_id UUID DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT 'admitido', p_modalidad_beca VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(cantidad_precargada INTEGER, mensaje TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educación puede precargar aspirantes'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
  IF v_doc.tipo_documento = 'rp' THEN PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id); END IF;
  RETURN QUERY SELECT * FROM public.precargar_aspirantes_cargue_interno(p_documento_id,p_convocatoria_id,p_estado,p_modalidad_beca);
END;
$$;
REVOKE ALL ON FUNCTION public.precargar_rp_convocatoria(UUID,UUID,VARCHAR,VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precargar_rp_convocatoria(UUID,UUID,VARCHAR,VARCHAR) TO authenticated;

CREATE FUNCTION public.verificar_rp_habilitado(p_documento_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE;
BEGIN
  IF (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Su rol no puede generar RP';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id AND tipo_documento = 'rp';
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id);
END;
$$;
REVOKE ALL ON FUNCTION public.verificar_rp_habilitado(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_rp_habilitado(UUID) TO authenticated;

CREATE FUNCTION public.obtener_terceros_exportacion(p_documento_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_filas JSONB;
BEGIN
  IF (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Su rol no puede exportar terceros';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id AND tipo_documento = 'terceros' FOR SHARE;
  IF NOT FOUND OR v_doc.estado NOT IN ('enviado_para_revision','aprobado','finalizado') THEN
    RAISE EXCEPTION 'Solo puede exportar TERCEROS enviados, aprobados o finalizados';
  END IF;
  PERFORM public.validar_terceros_para_revision(p_documento_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.creado_en,v.id),'[]'::JSONB)
  INTO v_filas FROM public.portal_valores_cargue v WHERE documento_id = p_documento_id;
  RETURN v_filas;
END;
$$;
REVOKE ALL ON FUNCTION public.obtener_terceros_exportacion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_terceros_exportacion(UUID) TO authenticated;

CREATE FUNCTION public.leer_terceros_cargue(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('estado', d.estado, 'editado_en', d.editado_en,
    'filas', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.creado_en,v.id)
      FROM public.portal_valores_cargue v WHERE v.documento_id = d.id), '[]'::JSONB))
  FROM public.portal_documentos_cargue d WHERE d.id = p_documento_id AND d.tipo_documento = 'terceros';
$$;
REVOKE ALL ON FUNCTION public.leer_terceros_cargue(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leer_terceros_cargue(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
