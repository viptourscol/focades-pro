CREATE TABLE public.portal_archivos_op (
  rp_id UUID PRIMARY KEY REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  datos JSONB NOT NULL,
  editado_por UUID NOT NULL REFERENCES auth.users(id),
  editado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_archivos_op ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_archivos_op FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.exigir_contabilidad_cargue()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
      AND (u.raw_app_meta_data->'roles' @> '["admin_contabilidad"]'::JSONB
        OR u.raw_app_meta_data->>'role' = 'admin_contabilidad')
  ) THEN
    RAISE EXCEPTION 'Se requiere el rol Contabilidad asignado desde Usuarios y roles.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.listar_rp_para_op(p_convocatoria_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_resultado JSONB;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'aprobado_en', d.aprobado_en,
    'resolucion', d.datos_generales_rp->>'numero_resolucion',
    'descripcion', d.datos_generales_rp->>'descripcion',
    'cantidad', d.cantidad_registros, 'preparado', a.rp_id IS NOT NULL
  ) ORDER BY d.aprobado_en DESC NULLS LAST, d.id), '[]'::JSONB)
  INTO v_resultado
  FROM public.portal_documentos_cargue d
  LEFT JOIN public.portal_archivos_op a ON a.rp_id = d.id
  WHERE d.convocatoria_id = p_convocatoria_id AND d.tipo_documento = 'rp'
    AND d.estado IN ('aprobado', 'finalizado') AND d.aprobado_por IS NOT NULL;
  RETURN v_resultado;
END;
$$;

CREATE FUNCTION public.leer_op_desde_rp(p_convocatoria_id UUID, p_rp_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_filas JSONB; v_datos JSONB; v_editado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM 1 FROM public.portal_documentos_cargue d
    WHERE d.id = p_rp_id AND d.convocatoria_id = p_convocatoria_id
      AND d.tipo_documento = 'rp' AND d.estado IN ('aprobado', 'finalizado')
      AND d.aprobado_por IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecciona un RP aprobado por Presupuesto de esta convocatoria.'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', v.id, 'descripcion', f.fila->>'descripcion', 'no_rp', f.fila->>'no_rp',
    'subconsecutivo_rp', COALESCE(NULLIF(f.fila->>'subconsecutivo', ''), '1'),
    'codigo_entidad', f.fila->>'entidad', 'rubro_presupuestal', f.fila->>'rubro_presupuestal',
    'fuente_financiacion', f.fila->>'fuente_financiacion', 'valor', f.fila->>'valor'
  ) ORDER BY v.creado_en, v.id) INTO v_filas
  FROM public.portal_valores_cargue v
  CROSS JOIN LATERAL (SELECT public.fila_rp(to_jsonb(v)) AS fila) f
  WHERE v.documento_id = p_rp_id;
  IF v_filas IS NULL THEN RAISE EXCEPTION 'El RP aprobado no tiene filas de origen.'; END IF;

  SELECT datos, editado_en INTO v_datos, v_editado_en FROM public.portal_archivos_op WHERE rp_id = p_rp_id;
  RETURN jsonb_build_object('filas', v_filas, 'datos', v_datos, 'editado_en', v_editado_en);
END;
$$;

CREATE FUNCTION public.guardar_op_desde_rp(
  p_convocatoria_id UUID, p_rp_id UUID, p_fecha DATE, p_no_op TEXT, p_subconsecutivo TEXT,
  p_opcionales JSONB, p_editado_en TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_origen JSONB; v_datos JSONB; v_editado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  -- Serializa la creación y edición del archivo sin cambiar el RP.
  PERFORM pg_advisory_xact_lock(hashtextextended('cargue-op:' || p_rp_id::TEXT, 0));
  v_origen := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF (v_origen->>'editado_en')::TIMESTAMPTZ IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El archivo OP cambió. Vuelve a abrir el RP antes de guardar.';
  END IF;
  IF p_fecha IS NULL OR p_fecha NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    OR p_no_op IS NULL OR p_no_op !~ '^[0-9]{1,10}$'
    OR COALESCE(p_subconsecutivo, '') !~ '^[0-9]{0,4}$' THEN
    RAISE EXCEPTION 'Indica una fecha válida, un No. OP inicial de hasta 10 dígitos y un SubConsecutivo de hasta 4 dígitos.';
  END IF;
  IF p_no_op::BIGINT + jsonb_array_length(v_origen->'filas') - 1 > 9999999999 THEN
    RAISE EXCEPTION 'El último No. OP superaría los 10 dígitos permitidos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_origen->'filas') AS filas(f)
    WHERE COALESCE(f->>'descripcion', '') = '' OR length(f->>'descripcion') > 500
      OR COALESCE(f->>'no_rp', '') !~ '^([0-9]{1,10}|[A-Za-z0-9]+([.-][A-Za-z0-9]+)+)$'
      OR length(f->>'no_rp') > 30 OR COALESCE(f->>'subconsecutivo_rp', '') !~ '^[0-9]{1,4}$'
      OR COALESCE(f->>'codigo_entidad', '') !~ '^[0-9]{1,4}$'
      OR length(btrim(COALESCE(f->>'rubro_presupuestal', ''))) NOT BETWEEN 1 AND 30
      OR COALESCE(f->>'fuente_financiacion', '') !~ '^[0-9]{1,4}$'
      OR COALESCE(f->>'valor', '') !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
  ) THEN RAISE EXCEPTION 'El RP aprobado contiene campos incompletos o inválidos para OP. Verifica los datos con Presupuesto.'; END IF;

  IF jsonb_typeof(p_opcionales) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Estado y Clase deben asociarse a las filas del RP.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_opcionales) AS e(id, campos)
    WHERE jsonb_typeof(e.campos) IS DISTINCT FROM 'object'
      OR jsonb_typeof(e.campos->'estado') IS DISTINCT FROM 'string'
      OR jsonb_typeof(e.campos->'clase') IS DISTINCT FROM 'string'
      OR length(e.campos->>'estado') > 32767 OR length(e.campos->>'clase') > 32767
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_origen->'filas') AS filas(f) WHERE f->>'id' = e.id)
  ) THEN RAISE EXCEPTION 'Estado o Clase contiene una fila no válida.'; END IF;

  v_datos := jsonb_build_object('fecha', p_fecha, 'no_op', p_no_op,
    'subconsecutivo', COALESCE(p_subconsecutivo, ''), 'opcionales', p_opcionales);
  INSERT INTO public.portal_archivos_op (rp_id, datos, editado_por, editado_en)
  VALUES (p_rp_id, v_datos, auth.uid(), clock_timestamp())
  ON CONFLICT (rp_id) DO UPDATE SET datos = EXCLUDED.datos, editado_por = EXCLUDED.editado_por,
    editado_en = EXCLUDED.editado_en
  RETURNING editado_en INTO v_editado_en;
  RETURN v_editado_en;
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_contabilidad_cargue(), public.listar_rp_para_op(UUID),
  public.leer_op_desde_rp(UUID, UUID), public.guardar_op_desde_rp(UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_rp_para_op(UUID), public.leer_op_desde_rp(UUID, UUID),
  public.guardar_op_desde_rp(UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
