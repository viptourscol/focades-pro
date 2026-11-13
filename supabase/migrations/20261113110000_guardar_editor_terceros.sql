-- Guardado atomico del editor de terceros. No modifica datos del aspirante.
CREATE OR REPLACE FUNCTION public.guardar_terceros_cargue(
  p_documento_id UUID,
  p_filas JSONB,
  p_editado_en TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE;
  v_edicion TIMESTAMPTZ := clock_timestamp();
  v_filas JSONB;
BEGIN
  IF NOT (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) THEN
    RAISE EXCEPTION 'No tiene permiso para editar terceros';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Las filas deben ser una lista de terceros';
  END IF;

  SELECT * INTO v_doc FROM public.portal_documentos_cargue
  WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
  IF v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se pueden editar documentos TERCEROS en borrador';
  END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió desde que lo abrió. Recargue antes de guardar para no sobrescribir cambios de otra persona.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_filas) fila WHERE jsonb_typeof(fila) <> 'object') THEN
    RAISE EXCEPTION 'Cada fila debe contener los datos de un tercero';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_editor_terceros (
    id UUID,
    identificacion TEXT,
    nombre TEXT,
    tipo_identificacion TEXT,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    ciudad TEXT
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.tmp_editor_terceros;

  INSERT INTO pg_temp.tmp_editor_terceros
  SELECT id, NULLIF(TRIM(cc_nit), ''), NULLIF(TRIM(nombre_razon_social), ''),
    NULLIF(TRIM(tipo_identificacion), ''), NULLIF(TRIM(email), ''),
    NULLIF(TRIM(telefono), ''), NULLIF(TRIM(direccion), ''), NULLIF(TRIM(ciudad), '')
  FROM jsonb_to_recordset(p_filas) AS fila(
    id UUID, cc_nit TEXT, nombre_razon_social TEXT, tipo_identificacion TEXT,
    email TEXT, telefono TEXT, direccion TEXT, ciudad TEXT
  );

  IF EXISTS (SELECT 1 FROM pg_temp.tmp_editor_terceros WHERE identificacion IS NULL OR nombre IS NULL) THEN
    RAISE EXCEPTION 'Cada tercero debe tener identificacion y nombre';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.tmp_editor_terceros
    WHERE LENGTH(identificacion) > 15 OR LENGTH(nombre) > 200 OR LENGTH(tipo_identificacion) > 10
      OR LENGTH(email) > 100 OR LENGTH(telefono) > 20 OR LENGTH(direccion) > 255 OR LENGTH(ciudad) > 100
  ) THEN
    RAISE EXCEPTION 'Hay campos que superan la longitud permitida. Revise las indicaciones del editor.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.tmp_editor_terceros
    WHERE email IS NOT NULL AND email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) THEN
    RAISE EXCEPTION 'Hay un correo electronico con formato invalido';
  END IF;
  IF EXISTS (
    SELECT identificacion FROM pg_temp.tmp_editor_terceros GROUP BY identificacion HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT id FROM pg_temp.tmp_editor_terceros WHERE id IS NOT NULL GROUP BY id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No puede repetir la identificacion o la fila de un tercero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.tmp_editor_terceros t
    WHERE t.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.portal_valores_cargue v WHERE v.id = t.id AND v.documento_id = p_documento_id
    )
  ) THEN
    RAISE EXCEPTION 'Una fila no pertenece al documento o ya fue eliminada. Recargue antes de guardar.';
  END IF;

  DELETE FROM public.portal_valores_cargue v
  WHERE v.documento_id = p_documento_id
    AND NOT EXISTS (SELECT 1 FROM pg_temp.tmp_editor_terceros t WHERE t.id = v.id);

  UPDATE public.portal_valores_cargue v
  SET identificacion = t.identificacion, nombre_beneficiario = t.nombre,
    tipo_identificacion = t.tipo_identificacion, email = t.email,
    telefono = t.telefono, direccion = t.direccion, ciudad = t.ciudad
  FROM pg_temp.tmp_editor_terceros t
  WHERE v.id = t.id AND v.documento_id = p_documento_id;

  INSERT INTO public.portal_valores_cargue (
    documento_id, identificacion, nombre_beneficiario, tipo_identificacion, email, telefono, direccion, ciudad
  )
  SELECT p_documento_id, identificacion, nombre, tipo_identificacion, email, telefono, direccion, ciudad
  FROM pg_temp.tmp_editor_terceros WHERE id IS NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(fila) ORDER BY fila.nombre_beneficiario, fila.id), '[]'::JSONB)
  INTO v_filas
  FROM (
    SELECT id, identificacion, nombre_beneficiario, tipo_identificacion, email, telefono, direccion, ciudad
    FROM public.portal_valores_cargue WHERE documento_id = p_documento_id
  ) fila;

  UPDATE public.portal_documentos_cargue
  SET cantidad_registros = jsonb_array_length(v_filas), editado_en = v_edicion, editado_por = auth.uid()
  WHERE id = p_documento_id;

  RETURN jsonb_build_object('filas', v_filas, 'editado_en', v_edicion);
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_terceros_cargue(UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_terceros_cargue(UUID, JSONB, TIMESTAMPTZ) TO authenticated;
NOTIFY pgrst, 'reload schema';
