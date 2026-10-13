-- Precarga TERCEROS desde aspirantes promovidos a beneficiarios activos de la convocatoria del documento.

CREATE OR REPLACE FUNCTION public.precargar_terceros_convocatoria(p_documento_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
  v_insertados INTEGER := 0;
BEGIN
  IF NOT public.fn_tiene_rol('admin_educacion') THEN
    RAISE EXCEPTION 'Solo admin_educacion puede precargar terceros';
  END IF;

  SELECT id, convocatoria_id, tipo_documento, estado
    INTO v_doc
    FROM public.portal_documentos_cargue
   WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;

  IF v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede precargar un documento TERCEROS en borrador';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_precarga_terceros (
    beneficiario_id BIGINT PRIMARY KEY,
    identificacion VARCHAR(15) NOT NULL,
    nombre VARCHAR(200)
  ) ON COMMIT DROP;
  TRUNCATE tmp_precarga_terceros;

  INSERT INTO tmp_precarga_terceros (beneficiario_id, identificacion, nombre)
  SELECT DISTINCT ON (b.id)
         b.id,
         b.n_documento,
         LEFT(b.nombre_completo, 200)
    FROM public.inscripciones i
    JOIN public.portal_beneficiarios b ON b.inscripcion_pk = i.id
   WHERE i.convocatoria_id = v_doc.convocatoria_id
     AND i.promovido_a_beneficiario = TRUE
     AND b.estado_beneficiario = 'activo'
     AND b.n_documento ~ '^\d{1,15}$'
   ORDER BY b.id;

  INSERT INTO public.portal_cargue_beneficiarios_terceros (documento_cargue_id, beneficiario_id, numero_identificacion)
  SELECT p_documento_id, t.beneficiario_id, t.identificacion
    FROM tmp_precarga_terceros t
  ON CONFLICT (documento_cargue_id, beneficiario_id) DO NOTHING;

  INSERT INTO public.portal_valores_cargue (documento_id, identificacion, nombre_beneficiario)
  SELECT p_documento_id, t.identificacion, t.nombre
    FROM tmp_precarga_terceros t
   WHERE NOT EXISTS (
     SELECT 1 FROM public.portal_valores_cargue v
      WHERE v.documento_id = p_documento_id
        AND v.identificacion = t.identificacion
   );

  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  UPDATE public.portal_documentos_cargue
     SET cantidad_registros = (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = p_documento_id)
   WHERE id = p_documento_id;

  RETURN v_insertados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precargar_terceros_convocatoria(UUID) TO authenticated;
