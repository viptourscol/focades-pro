ALTER TABLE public.portal_archivos_contabilidad
  ADD COLUMN estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado')),
  ADD COLUMN aprobado_por UUID REFERENCES auth.users(id),
  ADD COLUMN aprobado_en TIMESTAMPTZ,
  ADD COLUMN archivos_aprobados JSONB,
  ADD CONSTRAINT contabilidad_aprobacion_completa CHECK (
    (estado = 'borrador' AND aprobado_por IS NULL AND aprobado_en IS NULL AND archivos_aprobados IS NULL)
    OR (estado = 'aprobado' AND aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL
      AND archivos_aprobados IS NOT NULL)
  );

CREATE FUNCTION public.proteger_contabilizacion_aprobada()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.estado = 'aprobado' THEN
    RAISE EXCEPTION 'La contabilización aprobada no se puede modificar ni eliminar.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_contabilizacion_aprobada
BEFORE UPDATE OR DELETE ON public.portal_archivos_contabilidad
FOR EACH ROW EXECUTE FUNCTION public.proteger_contabilizacion_aprobada();

CREATE OR REPLACE FUNCTION public.leer_contabilizacion_op(p_convocatoria_id UUID, p_rp_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_op JSONB;
  v_datos JSONB;
  v_filas JSONB;
  v_suffix TEXT;
  v_prefijo TEXT;
  v_editado_en TIMESTAMPTZ;
  v_estado TEXT;
  v_aprobado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  v_op := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF v_op->>'estado_op' <> 'aprobado' OR v_op->>'op_aprobado_en' IS NULL THEN
    RAISE EXCEPTION 'Guarda y aprueba el Cargue de Información OP antes de iniciar la contabilización.';
  END IF;
  v_suffix := substring(v_op->'datos'->>'no_op' FROM '([0-9]+)$');
  v_prefijo := regexp_replace(v_op->'datos'->>'no_op', '[0-9]+$', '');
  SELECT datos, editado_en, estado, aprobado_en
  INTO v_datos, v_editado_en, v_estado, v_aprobado_en
  FROM public.portal_archivos_contabilidad WHERE rp_id = p_rp_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', origen.fila->>'id',
    'tipo', 'OP',
    'no_obligacion', v_prefijo || lpad(numero.valor, greatest(length(v_suffix), length(numero.valor)), '0'),
    'subconsecutivo', COALESCE(NULLIF(v_op->'datos'->>'subconsecutivo', ''), '1'),
    'clase', COALESCE(v_datos->'clases'->>(origen.fila->>'id'), ''),
    'codigo_entidad', origen.fila->>'codigo_entidad',
    'rubro_presupuestal', origen.fila->>'rubro_presupuestal',
    'fuente_financiacion', origen.fila->>'fuente_financiacion'
  ) ORDER BY origen.ordinalidad), '[]'::JSONB) INTO v_filas
  FROM jsonb_array_elements(v_op->'filas') WITH ORDINALITY AS origen(fila, ordinalidad)
  CROSS JOIN LATERAL (
    SELECT ((v_suffix::NUMERIC + origen.ordinalidad - 1)::BIGINT)::TEXT AS valor
  ) numero;
  RETURN jsonb_build_object(
    'filas', v_filas, 'datos', v_datos, 'editado_en', v_editado_en,
    'op_aprobado_en', v_op->'op_aprobado_en',
    'estado', COALESCE(v_estado, 'sin_guardar'), 'aprobado_en', v_aprobado_en
  );
END;
$$;

CREATE FUNCTION public.aprobar_contabilizacion_op(
  p_convocatoria_id UUID, p_rp_id UUID, p_editado_en TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archivo public.portal_archivos_contabilidad%ROWTYPE;
  v_contabilidad JSONB;
  v_op JSONB;
  v_fecha TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilizacion-op:' || p_rp_id::TEXT, 0));
  SELECT * INTO v_archivo FROM public.portal_archivos_contabilidad WHERE rp_id = p_rp_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guarda la contabilización antes de aprobarla.'; END IF;
  IF v_archivo.estado <> 'borrador' OR p_editado_en IS NULL
    OR v_archivo.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'La contabilización cambió o ya está aprobada. Recarga antes de continuar.';
  END IF;
  v_contabilidad := public.leer_contabilizacion_op(p_convocatoria_id, p_rp_id);
  v_op := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF jsonb_array_length(v_contabilidad->'filas') = 0
    OR v_archivo.datos->>'tipo' IS DISTINCT FROM 'OP'
    OR length(btrim(COALESCE(v_archivo.datos->>'cuenta_debito', ''))) NOT BETWEEN 1 AND 30
    OR length(btrim(COALESCE(v_archivo.datos->>'cuenta_credito', ''))) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Revisa las filas, el tipo y las cuentas antes de aprobar.';
  END IF;
  UPDATE public.portal_archivos_contabilidad
  SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = clock_timestamp(),
    archivos_aprobados = jsonb_build_object('op', v_op, 'contabilidad', v_contabilidad)
  WHERE rp_id = p_rp_id
  RETURNING aprobado_en INTO v_fecha;
  RETURN jsonb_build_object('ok', TRUE, 'estado', 'aprobado', 'aprobado_en', v_fecha);
END;
$$;

CREATE FUNCTION public.exigir_pagos_cargue()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
      AND (u.raw_app_meta_data->'roles' @> '["admin_pagos"]'::JSONB
        OR u.raw_app_meta_data->>'role' = 'admin_pagos')
  ) THEN
    RAISE EXCEPTION 'Se requiere un administrador activo con rol Pagos.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.listar_contabilizaciones_para_pagos(p_convocatoria_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_resultado JSONB;
BEGIN
  PERFORM public.exigir_pagos_cargue();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rp_id', c.rp_id, 'aprobado_en', c.aprobado_en,
    'no_op', c.archivos_aprobados->'op'->'datos'->>'no_op',
    'resolucion', d.datos_generales_rp->>'numero_resolucion',
    'cantidad', jsonb_array_length(c.archivos_aprobados->'contabilidad'->'filas')
  ) ORDER BY c.aprobado_en DESC, c.rp_id), '[]'::JSONB) INTO v_resultado
  FROM public.portal_archivos_contabilidad c
  JOIN public.portal_documentos_cargue d ON d.id = c.rp_id
  WHERE d.convocatoria_id = p_convocatoria_id AND c.estado = 'aprobado';
  RETURN v_resultado;
END;
$$;

CREATE FUNCTION public.leer_archivos_aprobados_pagos(p_convocatoria_id UUID, p_rp_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_resultado JSONB;
BEGIN
  PERFORM public.exigir_pagos_cargue();
  SELECT c.archivos_aprobados INTO v_resultado
  FROM public.portal_archivos_contabilidad c
  JOIN public.portal_documentos_cargue d ON d.id = c.rp_id
  WHERE c.rp_id = p_rp_id AND d.convocatoria_id = p_convocatoria_id AND c.estado = 'aprobado';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El archivo no está aprobado para Pagos en esta convocatoria.';
  END IF;
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_contabilizacion_aprobada(),
  public.exigir_pagos_cargue(), public.leer_contabilizacion_op(UUID, UUID),
  public.aprobar_contabilizacion_op(UUID, UUID, TIMESTAMPTZ),
  public.listar_contabilizaciones_para_pagos(UUID),
  public.leer_archivos_aprobados_pagos(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leer_contabilizacion_op(UUID, UUID),
  public.aprobar_contabilizacion_op(UUID, UUID, TIMESTAMPTZ),
  public.listar_contabilizaciones_para_pagos(UUID),
  public.leer_archivos_aprobados_pagos(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
