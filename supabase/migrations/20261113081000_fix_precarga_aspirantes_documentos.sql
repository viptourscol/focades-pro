-- Mantener la firma publicada para los clientes existentes (RP y TERCEROS).
CREATE OR REPLACE FUNCTION public.precargar_rp_convocatoria(
  p_documento_id UUID,
  p_convocatoria_id UUID DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT 'admitido',
  p_modalidad_beca VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(cantidad_precargada INTEGER, mensaje TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE;
  v_convocatoria_id UUID;
  v_estado TEXT := NULLIF(LOWER(TRIM(p_estado)), '');
  v_modalidad TEXT := NULLIF(LOWER(TRIM(p_modalidad_beca)), '');
  v_encontrados INTEGER;
  v_insertados INTEGER;
BEGIN
  IF NOT public.fn_tiene_rol('admin_educacion') THEN
    RAISE EXCEPTION 'Solo admin_educacion puede precargar aspirantes';
  END IF;

  SELECT * INTO v_doc
  FROM public.portal_documentos_cargue
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
  IF v_doc.tipo_documento NOT IN ('terceros', 'rp') THEN
    RAISE EXCEPTION 'La precarga solo admite documentos TERCEROS o RP (tipo actual: %)', v_doc.tipo_documento;
  END IF;
  IF v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'El documento debe estar en borrador para precargar (estado actual: %)', v_doc.estado;
  END IF;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Debe seleccionar un estado del aspirante';
  END IF;

  v_convocatoria_id := COALESCE(p_convocatoria_id, v_doc.convocatoria_id);
  IF v_convocatoria_id <> v_doc.convocatoria_id THEN
    RAISE EXCEPTION 'La convocatoria seleccionada no corresponde al documento. Cree un documento en esa convocatoria para precargar sus aspirantes.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_precarga_aspirantes (
    inscripcion_id UUID PRIMARY KEY,
    identificacion TEXT,
    nombre TEXT,
    tipo_identificacion TEXT,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    ciudad TEXT
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.tmp_precarga_aspirantes;

  -- Misma prioridad que la ficha del aspirante: persona, inscripcion, formulario.
  INSERT INTO pg_temp.tmp_precarga_aspirantes
  SELECT i.id,
    COALESCE(NULLIF(TRIM(p.n_documento), ''), NULLIF(TRIM(i.n_documento), ''),
      NULLIF(TRIM(i.datos_formulario->>'n_documento'), ''),
      NULLIF(TRIM(i.datos_formulario->>'numero_documento'), '')),
    COALESCE(NULLIF(TRIM(p.nombre_completo), ''), NULLIF(TRIM(i.nombre_completo), ''),
      NULLIF(TRIM(i.datos_formulario->>'nombre_completo'), '')),
    COALESCE(NULLIF(TRIM(p.tipo_documento), ''), NULLIF(TRIM(i.tipo_documento), ''),
      NULLIF(TRIM(i.datos_formulario->>'tipo_documento'), '')),
    COALESCE(NULLIF(TRIM(p.email), ''), NULLIF(TRIM(i.email), ''),
      NULLIF(TRIM(i.datos_formulario->>'email'), '')),
    COALESCE(NULLIF(TRIM(p.n_celular), ''), NULLIF(TRIM(i.n_celular), ''),
      NULLIF(TRIM(i.datos_formulario->>'n_celular'), ''),
      NULLIF(TRIM(i.datos_formulario->>'telefono'), '')),
    COALESCE(NULLIF(TRIM(p.direccion_residencia), ''), NULLIF(TRIM(i.direccion_residencia), ''),
      NULLIF(TRIM(i.datos_formulario->>'direccion_residencia'), ''),
      NULLIF(TRIM(i.datos_formulario->>'direccion'), '')),
    COALESCE(NULLIF(TRIM(p.municipio_residencia), ''), NULLIF(TRIM(i.municipio_residencia), ''),
      NULLIF(TRIM(i.datos_formulario->>'municipio_residencia'), ''),
      NULLIF(TRIM(i.datos_formulario->>'ciudad'), ''))
  FROM public.inscripciones i
  LEFT JOIN public.personas p ON p.id = i.persona_id
  WHERE i.convocatoria_id = v_convocatoria_id
    AND LOWER(TRIM(i.estado)) = v_estado
    AND (v_modalidad IS NULL OR LOWER(TRIM(COALESCE(
      NULLIF(TRIM(i.modalidad), ''), i.datos_formulario->>'modalidad'
    ))) = v_modalidad);

  GET DIAGNOSTICS v_encontrados = ROW_COUNT;
  IF v_encontrados = 0 THEN
    RETURN QUERY SELECT 0, FORMAT(
      'No hay aspirantes en estado "%s" en esta convocatoria con la modalidad seleccionada.', p_estado
    );
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.tmp_precarga_aspirantes
    WHERE identificacion IS NULL OR nombre IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay aspirantes sin identificacion o nombre. Complete su ficha antes de precargar.';
  END IF;

  INSERT INTO public.portal_valores_cargue (
    documento_id, identificacion, nombre_beneficiario,
    tipo_identificacion, email, telefono, direccion, ciudad
  )
  SELECT p_documento_id, t.identificacion, t.nombre,
    t.tipo_identificacion, t.email, t.telefono, t.direccion, t.ciudad
  FROM (
    SELECT DISTINCT ON (identificacion) *
    FROM pg_temp.tmp_precarga_aspirantes
    ORDER BY identificacion, inscripcion_id
  ) t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.portal_valores_cargue v
    WHERE v.documento_id = p_documento_id AND v.identificacion = t.identificacion
  );
  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  UPDATE public.portal_documentos_cargue
  SET cantidad_registros = (
    SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = p_documento_id
  ), editado_por = auth.uid(), editado_en = NOW()
  WHERE id = p_documento_id;

  RETURN QUERY SELECT v_insertados, CASE WHEN v_insertados = 0
    THEN 'Los aspirantes seleccionados ya estan cargados en este documento.'
    ELSE FORMAT('Se precargaron %s aspirantes en estado "%s".', v_insertados, p_estado)
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.precargar_rp_convocatoria(UUID, UUID, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precargar_rp_convocatoria(UUID, UUID, VARCHAR, VARCHAR) TO authenticated;

NOTIFY pgrst, 'reload schema';
