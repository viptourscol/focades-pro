CREATE OR REPLACE FUNCTION public.validar_rango_no_op(p_inicio TEXT, p_incremento BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_inicio ~ '^[0-9]{1,10}$' THEN p_inicio::NUMERIC + p_incremento BETWEEN 0 AND 9999999999
    WHEN length(p_inicio) <= 30
      AND p_inicio ~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)*[.-][0-9]{1,10}$'
      THEN substring(p_inicio FROM '([0-9]+)$')::NUMERIC + p_incremento BETWEEN 0 AND 9999999999
    ELSE FALSE
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
  INSERT INTO public.portal_archivos_op (rp_id, datos, editado_por, editado_en)
  VALUES (p_rp_id, v_datos, auth.uid(), clock_timestamp())
  ON CONFLICT (rp_id) DO UPDATE
    SET datos = EXCLUDED.datos,
        editado_por = EXCLUDED.editado_por,
        editado_en = EXCLUDED.editado_en
  RETURNING editado_en INTO v_editado_en;
  RETURN v_editado_en;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_rango_no_op(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
