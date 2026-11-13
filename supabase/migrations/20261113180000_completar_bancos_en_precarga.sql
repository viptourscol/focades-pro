CREATE OR REPLACE FUNCTION public.completar_datos_terceros(p_documento_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_actualizadas INTEGER;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educación puede completar datos de terceros'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento <> 'terceros' OR v_doc.estado <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se completan datos de TERCEROS en borrador';
  END IF;
  WITH completadas AS (
    SELECT v.id, v.datos_tercero || COALESCE((
      SELECT jsonb_object_agg(f.key, f.value)
      FROM jsonb_each(public.datos_fuente_tercero(v_doc.convocatoria_id, v.identificacion)) f
      WHERE NULLIF(trim(v.datos_tercero->>f.key), '') IS NULL
        AND NULLIF(trim(f.value #>> '{}'), '') IS NOT NULL
    ), '{}'::JSONB) AS datos
    FROM public.portal_valores_cargue v WHERE v.documento_id = p_documento_id
  )
  UPDATE public.portal_valores_cargue v SET
    datos_tercero = c.datos,
    tipo_identificacion = public.codigo_identificacion_tercero(v.tipo_identificacion)
  FROM completadas c WHERE v.id = c.id AND (
    v.datos_tercero IS DISTINCT FROM c.datos
    OR v.tipo_identificacion IS DISTINCT FROM public.codigo_identificacion_tercero(v.tipo_identificacion));
  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  IF v_actualizadas > 0 THEN
    UPDATE public.portal_documentos_cargue SET editado_en = clock_timestamp(), editado_por = auth.uid() WHERE id = p_documento_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.precargar_rp_convocatoria(
  p_documento_id UUID, p_convocatoria_id UUID DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT 'admitido', p_modalidad_beca VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(cantidad_precargada INTEGER, mensaje TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_resultado RECORD;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN RAISE EXCEPTION 'Solo Educación puede precargar aspirantes'; END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado'; END IF;
  IF v_doc.tipo_documento = 'rp' THEN PERFORM public.exigir_terceros_aprobados(v_doc.convocatoria_id); END IF;
  SELECT * INTO STRICT v_resultado FROM public.precargar_aspirantes_cargue_interno(p_documento_id,p_convocatoria_id,p_estado,p_modalidad_beca);
  IF v_doc.tipo_documento = 'terceros' THEN
    PERFORM public.completar_datos_terceros(p_documento_id);
  END IF;
  RETURN QUERY SELECT v_resultado.cantidad_precargada::INTEGER,
    v_resultado.mensaje::TEXT || CASE WHEN v_doc.tipo_documento = 'terceros'
      THEN ' Se revisaron los campos faltantes, incluidos banco, tipo y número de cuenta, sin reemplazar los datos diligenciados.'
      ELSE '' END;
END;
$$;
