CREATE OR REPLACE FUNCTION public.validar_rango_no_op(p_inicio TEXT, p_incremento BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_inicio ~ '^[0-9]{1,10}$'
      THEN p_inicio::NUMERIC + p_incremento BETWEEN 0 AND 9999999999
    WHEN length(p_inicio) <= 30
      AND p_inicio ~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)*[.-][0-9]{1,10}$'
      THEN substring(p_inicio FROM '([0-9]+)$')::NUMERIC + p_incremento BETWEEN 0 AND 9999999999
        AND length(regexp_replace(p_inicio, '[0-9]+$', ''))
          + greatest(
            length(substring(p_inicio FROM '([0-9]+)$')),
            length((substring(p_inicio FROM '([0-9]+)$')::NUMERIC + p_incremento)::TEXT)
          ) <= 30
    ELSE FALSE
  END;
$$;

ALTER TABLE public.portal_archivos_op
  ADD COLUMN estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'aprobado')),
  ADD COLUMN aprobado_por UUID REFERENCES auth.users(id),
  ADD COLUMN aprobado_en TIMESTAMPTZ;

ALTER TABLE public.portal_archivos_op
  ADD CONSTRAINT portal_archivos_op_estado_aprobacion_check
  CHECK (
    (estado = 'borrador' AND aprobado_por IS NULL AND aprobado_en IS NULL)
    OR (estado = 'aprobado' AND aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL)
  );

CREATE TABLE public.portal_archivos_contabilidad (
  rp_id UUID PRIMARY KEY REFERENCES public.portal_archivos_op(rp_id) ON DELETE CASCADE,
  datos JSONB NOT NULL,
  editado_por UUID NOT NULL REFERENCES auth.users(id),
  editado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_archivos_contabilidad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_archivos_contabilidad FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.listar_rp_para_op(p_convocatoria_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_resultado JSONB;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'aprobado_en', d.aprobado_en,
    'resolucion', d.datos_generales_rp->>'numero_resolucion',
    'numero_rp', origen.numero_rp,
    'cantidad', d.cantidad_registros,
    'preparado', a.rp_id IS NOT NULL,
    'estado_op', COALESCE(a.estado, 'sin_guardar'),
    'op_aprobado_en', a.aprobado_en
  ) ORDER BY d.aprobado_en DESC NULLS LAST, d.id), '[]'::JSONB)
  INTO v_resultado
  FROM public.portal_documentos_cargue d
  LEFT JOIN public.portal_archivos_op a ON a.rp_id = d.id
  LEFT JOIN LATERAL (
    SELECT public.fila_rp(to_jsonb(v))->>'no_rp' AS numero_rp
    FROM public.portal_valores_cargue v
    WHERE v.documento_id = d.id
    ORDER BY v.creado_en, v.id
    LIMIT 1
  ) origen ON TRUE
  WHERE d.convocatoria_id = p_convocatoria_id
    AND d.tipo_documento = 'rp'
    AND d.estado IN ('aprobado', 'finalizado')
    AND d.aprobado_por IS NOT NULL;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_op_desde_rp(p_convocatoria_id UUID, p_rp_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_filas JSONB;
  v_datos JSONB;
  v_editado_en TIMESTAMPTZ;
  v_estado TEXT;
  v_aprobado_en TIMESTAMPTZ;
  v_aprobado_por UUID;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM 1
  FROM public.portal_documentos_cargue d
  WHERE d.id = p_rp_id
    AND d.convocatoria_id = p_convocatoria_id
    AND d.tipo_documento = 'rp'
    AND d.estado IN ('aprobado', 'finalizado')
    AND d.aprobado_por IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selecciona un RP aprobado por Presupuesto de esta convocatoria.';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', v.id,
    'descripcion', f.fila->>'descripcion',
    'no_rp', f.fila->>'no_rp',
    'subconsecutivo_rp', COALESCE(NULLIF(f.fila->>'subconsecutivo', ''), '1'),
    'codigo_entidad', f.fila->>'entidad',
    'rubro_presupuestal', f.fila->>'rubro_presupuestal',
    'fuente_financiacion', f.fila->>'fuente_financiacion',
    'valor', f.fila->>'valor'
  ) ORDER BY v.creado_en, v.id)
  INTO v_filas
  FROM public.portal_valores_cargue v
  CROSS JOIN LATERAL (SELECT public.fila_rp(to_jsonb(v)) AS fila) f
  WHERE v.documento_id = p_rp_id;
  IF v_filas IS NULL THEN
    RAISE EXCEPTION 'El RP aprobado no tiene filas de origen.';
  END IF;

  SELECT a.datos, a.editado_en, a.estado, a.aprobado_en, a.aprobado_por
  INTO v_datos, v_editado_en, v_estado, v_aprobado_en, v_aprobado_por
  FROM public.portal_archivos_op a
  WHERE a.rp_id = p_rp_id;
  RETURN jsonb_build_object(
    'filas', v_filas,
    'datos', v_datos,
    'editado_en', v_editado_en,
    'estado_op', COALESCE(v_estado, 'sin_guardar'),
    'op_aprobado_en', v_aprobado_en,
    'op_aprobado_por', v_aprobado_por
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_op_desde_rp(
  p_convocatoria_id UUID,
  p_rp_id UUID,
  p_fecha DATE,
  p_no_op TEXT,
  p_subconsecutivo TEXT,
  p_opcionales JSONB,
  p_editado_en TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen JSONB;
  v_datos JSONB;
  v_editado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM pg_advisory_xact_lock(hashtextextended('cargue-op:' || p_rp_id::TEXT, 0));
  v_origen := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF (v_origen->>'editado_en')::TIMESTAMPTZ IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El archivo OP cambió. Vuelve a abrir el RP antes de guardar.';
  END IF;
  IF v_origen->>'estado_op' = 'aprobado' THEN
    RAISE EXCEPTION 'El OP aprobado no se puede editar. Contacta al administrador si requiere una corrección.';
  END IF;
  IF p_fecha IS NULL
    OR p_no_op IS NULL
    OR NOT public.validar_rango_no_op(p_no_op, jsonb_array_length(v_origen->'filas') - 1)
    OR COALESCE(p_subconsecutivo, '') !~ '^[0-9]{0,4}$' THEN
    RAISE EXCEPTION 'Indica una fecha válida, un No. OP inicial válido y un SubConsecutivo de hasta 4 dígitos.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_origen->'filas') AS filas(f)
    WHERE COALESCE(f->>'descripcion', '') = ''
      OR length(f->>'descripcion') > 500
      OR COALESCE(f->>'no_rp', '') !~ '^([0-9]{1,10}|[A-Za-z0-9]+([.-][A-Za-z0-9]+)+)$'
      OR length(f->>'no_rp') > 30
      OR COALESCE(f->>'subconsecutivo_rp', '') !~ '^[0-9]{1,4}$'
      OR COALESCE(f->>'codigo_entidad', '') !~ '^[0-9]{1,4}$'
      OR length(btrim(COALESCE(f->>'rubro_presupuestal', ''))) NOT BETWEEN 1 AND 30
      OR COALESCE(f->>'fuente_financiacion', '') !~ '^[0-9]{1,4}$'
      OR COALESCE(f->>'valor', '') !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
  ) THEN
    RAISE EXCEPTION 'El RP aprobado contiene campos incompletos o inválidos para OP. Verifica los datos con Presupuesto.';
  END IF;
  IF jsonb_typeof(p_opcionales) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Estado y Clase deben asociarse a las filas del RP.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_opcionales) AS e(id, campos)
    WHERE jsonb_typeof(e.campos) IS DISTINCT FROM 'object'
      OR jsonb_typeof(e.campos->'estado') IS DISTINCT FROM 'string'
      OR jsonb_typeof(e.campos->'clase') IS DISTINCT FROM 'string'
      OR length(e.campos->>'estado') > 32767
      OR length(e.campos->>'clase') > 32767
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_origen->'filas') AS filas(f)
        WHERE f->>'id' = e.id
      )
  ) THEN
    RAISE EXCEPTION 'Estado o Clase contiene una fila no válida.';
  END IF;

  v_datos := jsonb_build_object(
    'fecha', p_fecha,
    'no_op', p_no_op,
    'subconsecutivo', COALESCE(p_subconsecutivo, ''),
    'opcionales', p_opcionales
  );
  INSERT INTO public.portal_archivos_op (rp_id, datos, editado_por, editado_en, estado, aprobado_por, aprobado_en)
  VALUES (p_rp_id, v_datos, auth.uid(), clock_timestamp(), 'borrador', NULL, NULL)
  ON CONFLICT (rp_id) DO UPDATE
    SET datos = EXCLUDED.datos,
        editado_por = EXCLUDED.editado_por,
        editado_en = EXCLUDED.editado_en,
        estado = 'borrador',
        aprobado_por = NULL,
        aprobado_en = NULL
  RETURNING editado_en INTO v_editado_en;
  RETURN v_editado_en;
END;
$$;

CREATE FUNCTION public.aprobar_op_desde_rp(
  p_convocatoria_id UUID,
  p_rp_id UUID,
  p_editado_en TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen JSONB;
  v_aprobado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM pg_advisory_xact_lock(hashtextextended('cargue-op:' || p_rp_id::TEXT, 0));
  v_origen := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF (v_origen->>'editado_en')::TIMESTAMPTZ IS DISTINCT FROM p_editado_en
    OR v_origen->>'estado_op' <> 'borrador' THEN
    RAISE EXCEPTION 'El OP debe estar guardado y sin cambios para aprobarlo.';
  END IF;
  IF NOT (v_origen->'datos' ? 'fecha')
    OR NOT (v_origen->'datos' ? 'no_op') THEN
    RAISE EXCEPTION 'El OP no tiene todos sus datos generales guardados.';
  END IF;
  UPDATE public.portal_archivos_op
  SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_en = clock_timestamp()
  WHERE rp_id = p_rp_id AND estado = 'borrador'
  RETURNING aprobado_en INTO v_aprobado_en;
  IF NOT FOUND THEN RAISE EXCEPTION 'El OP cambió durante la aprobación. Recarga e intenta de nuevo.'; END IF;
  RETURN jsonb_build_object('ok', TRUE, 'estado_op', 'aprobado', 'aprobado_en', v_aprobado_en);
END;
$$;

CREATE FUNCTION public.leer_contabilizacion_op(p_convocatoria_id UUID, p_rp_id UUID)
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
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  v_op := public.leer_op_desde_rp(p_convocatoria_id, p_rp_id);
  IF v_op->>'estado_op' <> 'aprobado' OR v_op->>'op_aprobado_en' IS NULL THEN
    RAISE EXCEPTION 'Guarda y aprueba el Cargue de Información OP antes de iniciar la contabilización.';
  END IF;

  v_suffix := substring(v_op->'datos'->>'no_op' FROM '([0-9]+)$');
  v_prefijo := regexp_replace(v_op->'datos'->>'no_op', '[0-9]+$', '');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', origen.fila->>'id',
    'tipo', 'OP',
    'no_obligacion', v_prefijo || lpad(
      ((v_suffix::NUMERIC + origen.ordinalidad - 1)::BIGINT)::TEXT,
      length(v_suffix), '0'
    ),
    'subconsecutivo', COALESCE(NULLIF(v_op->'datos'->>'subconsecutivo', ''), '1'),
    'clase', COALESCE(guardado.datos->'clases'->>(origen.fila->>'id'), ''),
    'codigo_entidad', origen.fila->>'codigo_entidad',
    'rubro_presupuestal', origen.fila->>'rubro_presupuestal',
    'fuente_financiacion', origen.fila->>'fuente_financiacion'
  ) ORDER BY origen.ordinalidad), '[]'::JSONB)
  INTO v_filas
  FROM jsonb_array_elements(v_op->'filas') WITH ORDINALITY AS origen(fila, ordinalidad)
  LEFT JOIN public.portal_archivos_contabilidad guardado ON guardado.rp_id = p_rp_id;

  SELECT datos, editado_en INTO v_datos, v_editado_en
  FROM public.portal_archivos_contabilidad
  WHERE rp_id = p_rp_id;
  RETURN jsonb_build_object(
    'filas', v_filas,
    'datos', v_datos,
    'editado_en', v_editado_en,
    'op_aprobado_en', v_op->'op_aprobado_en'
  );
END;
$$;

CREATE FUNCTION public.guardar_contabilizacion_op(
  p_convocatoria_id UUID,
  p_rp_id UUID,
  p_tipo TEXT,
  p_cuenta_debito TEXT,
  p_cuenta_credito TEXT,
  p_clases JSONB,
  p_editado_en TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origen JSONB;
  v_datos JSONB;
  v_editado_en TIMESTAMPTZ;
BEGIN
  PERFORM public.exigir_contabilidad_cargue();
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilizacion-op:' || p_rp_id::TEXT, 0));
  v_origen := public.leer_contabilizacion_op(p_convocatoria_id, p_rp_id);
  IF (v_origen->>'editado_en')::TIMESTAMPTZ IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'La contabilización cambió. Recarga antes de guardar.';
  END IF;
  IF p_tipo IS DISTINCT FROM 'OP'
    OR length(btrim(COALESCE(p_cuenta_debito, ''))) NOT BETWEEN 1 AND 30
    OR length(btrim(COALESCE(p_cuenta_credito, ''))) NOT BETWEEN 1 AND 30
    OR jsonb_typeof(p_clases) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Selecciona TIPO OP e indica cuentas débito y crédito de hasta 30 caracteres.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_origen->'filas') AS filas(f)
    WHERE COALESCE(f->>'no_obligacion', '') !~ '^([0-9]{1,10}|[A-Za-z0-9]+([.-][A-Za-z0-9]+)+)$'
      OR length(f->>'no_obligacion') > 30
      OR COALESCE(f->>'subconsecutivo', '') !~ '^[0-9]{1,4}$'
      OR COALESCE(f->>'codigo_entidad', '') !~ '^[0-9]{1,4}$'
      OR length(btrim(COALESCE(f->>'rubro_presupuestal', ''))) NOT BETWEEN 1 AND 60
      OR COALESCE(f->>'fuente_financiacion', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'El OP aprobado contiene datos incompletos o inválidos para contabilización.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_clases) AS e(id, clase)
    WHERE jsonb_typeof(e.clase) IS DISTINCT FROM 'string'
      OR length(e.clase #>> '{}') > 32767
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_origen->'filas') AS filas(f)
        WHERE f->>'id' = e.id
      )
  ) THEN
    RAISE EXCEPTION 'Clase contiene una fila no válida.';
  END IF;

  v_datos := jsonb_build_object(
    'tipo', p_tipo,
    'cuenta_debito', btrim(p_cuenta_debito),
    'cuenta_credito', btrim(p_cuenta_credito),
    'clases', p_clases
  );
  INSERT INTO public.portal_archivos_contabilidad (rp_id, datos, editado_por, editado_en)
  VALUES (p_rp_id, v_datos, auth.uid(), clock_timestamp())
  ON CONFLICT (rp_id) DO UPDATE
    SET datos = EXCLUDED.datos,
        editado_por = EXCLUDED.editado_por,
        editado_en = EXCLUDED.editado_en
  RETURNING editado_en INTO v_editado_en;
  RETURN v_editado_en;
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_op_desde_rp(UUID, UUID, TIMESTAMPTZ),
  public.leer_contabilizacion_op(UUID, UUID),
  public.guardar_contabilizacion_op(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_op_desde_rp(UUID, UUID, TIMESTAMPTZ),
  public.leer_contabilizacion_op(UUID, UUID),
  public.guardar_contabilizacion_op(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
