-- Motor de cálculo de puntaje. Única fuente de verdad: el cliente nunca
-- decide su propio puntaje, solo envía los datos del formulario.

CREATE OR REPLACE FUNCTION public.calcular_puntaje_inscripcion(
  p_datos   jsonb,
  p_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config      record;
  v_criterio    jsonb;
  v_regla       jsonb;
  v_campo       text;
  v_tipo        text;
  v_max         numeric;
  v_puntos      numeric;
  v_valor_txt   text;
  v_valor_num   numeric;
  v_total       numeric := 0;
  v_detalle     jsonb := '[]'::jsonb;
  v_smlv_map    jsonb;
  v_smlv_padre  numeric;
  v_smlv_madre  numeric;
  v_ingresos    numeric;
BEGIN
  SELECT * INTO v_config
  FROM portal_configuracion_puntaje
  WHERE (p_version IS NULL AND is_active) OR version = p_version
  LIMIT 1;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'No hay configuración de puntaje activa.';
  END IF;

  v_smlv_map := COALESCE(v_config.reglas -> 'smlv_por_rango_ingreso', '{}'::jsonb);

  -- Ingresos familiares: suma de los puntos medios en SMLV de padre y madre.
  v_smlv_padre := COALESCE((v_smlv_map ->> COALESCE(p_datos ->> 'ingresos_padre', ''))::numeric, 0);
  v_smlv_madre := COALESCE((v_smlv_map ->> COALESCE(p_datos ->> 'ingresos_madre', ''))::numeric, 0);
  v_ingresos := v_smlv_padre + v_smlv_madre;

  FOR v_criterio IN SELECT * FROM jsonb_array_elements(v_config.reglas -> 'criterios')
  LOOP
    v_campo  := v_criterio ->> 'campo';
    v_tipo   := v_criterio ->> 'tipo';
    v_max    := COALESCE((v_criterio ->> 'max')::numeric, 0);
    v_puntos := COALESCE((v_criterio ->> 'default_puntos')::numeric, 0);

    IF v_campo = '__ingresos_familiares_smlv' THEN
      v_valor_num := v_ingresos;
      v_valor_txt := v_ingresos::text || ' SMLV';
    ELSE
      v_valor_txt := NULLIF(btrim(COALESCE(p_datos ->> v_campo, '')), '');
      v_valor_num := NULL;
      IF v_tipo = 'rango' THEN
        BEGIN
          v_valor_num := v_valor_txt::numeric;
        EXCEPTION WHEN others THEN
          v_valor_num := NULL;
        END;
      END IF;
    END IF;

    IF v_tipo = 'exacto' AND v_valor_txt IS NOT NULL THEN
      FOR v_regla IN SELECT * FROM jsonb_array_elements(v_criterio -> 'reglas')
      LOOP
        IF lower(btrim(v_regla ->> 'valor')) = lower(v_valor_txt) THEN
          v_puntos := COALESCE((v_regla ->> 'puntos')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_tipo = 'rango' AND v_valor_num IS NOT NULL THEN
      FOR v_regla IN SELECT * FROM jsonb_array_elements(v_criterio -> 'reglas')
      LOOP
        IF v_valor_num >= COALESCE((v_regla ->> 'desde')::numeric, '-Infinity'::numeric)
           AND v_valor_num <= COALESCE((v_regla ->> 'hasta')::numeric, 'Infinity'::numeric) THEN
          v_puntos := COALESCE((v_regla ->> 'puntos')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;
    END IF;

    v_puntos := LEAST(GREATEST(v_puntos, 0), v_max);
    v_total := v_total + v_puntos;

    v_detalle := v_detalle || jsonb_build_object(
      'clave',  v_criterio ->> 'clave',
      'label',  v_criterio ->> 'label',
      'valor',  COALESCE(v_valor_txt, 'Sin dato'),
      'puntos', v_puntos,
      'max',    v_max
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total',   ROUND(v_total),
    'maximo',  (SELECT COALESCE(SUM((c ->> 'max')::numeric), 0)
                FROM jsonb_array_elements(v_config.reglas -> 'criterios') c),
    'version', v_config.version,
    'detalle', v_detalle
  );
END;
$$;

COMMENT ON FUNCTION public.calcular_puntaje_inscripcion(jsonb, integer) IS
'Calcula el puntaje de una inscripción a partir de datos_formulario usando la configuración activa (o una versión específica). Retorna {total, maximo, version, detalle}.';

GRANT EXECUTE ON FUNCTION public.calcular_puntaje_inscripcion(jsonb, integer) TO authenticated, service_role;
