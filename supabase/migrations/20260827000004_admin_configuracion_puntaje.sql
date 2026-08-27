-- Separa el motor de cálculo (recibe reglas explícitas) de la resolución de
-- configuración, para que el admin pueda simular reglas antes de guardarlas.

CREATE OR REPLACE FUNCTION public.calcular_puntaje_con_reglas(
  p_datos  jsonb,
  p_reglas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
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
  v_key_padre   text;
  v_key_madre   text;
  v_tiene_ing   boolean;
  v_ingresos    numeric;
BEGIN
  v_smlv_map  := COALESCE(p_reglas -> 'smlv_por_rango_ingreso', '{}'::jsonb);
  v_key_padre := NULLIF(btrim(COALESCE(p_datos ->> 'ingresos_padre', '')), '');
  v_key_madre := NULLIF(btrim(COALESCE(p_datos ->> 'ingresos_madre', '')), '');

  v_tiene_ing := (v_smlv_map ? v_key_padre) OR (v_smlv_map ? v_key_madre);
  v_ingresos  := COALESCE((v_smlv_map ->> v_key_padre)::numeric, 0)
               + COALESCE((v_smlv_map ->> v_key_madre)::numeric, 0);

  FOR v_criterio IN SELECT * FROM jsonb_array_elements(COALESCE(p_reglas -> 'criterios', '[]'::jsonb))
  LOOP
    v_campo  := v_criterio ->> 'campo';
    v_tipo   := v_criterio ->> 'tipo';
    v_max    := COALESCE((v_criterio ->> 'max')::numeric, 0);
    v_puntos := COALESCE((v_criterio ->> 'default_puntos')::numeric, 0);

    IF v_campo = '__ingresos_familiares_smlv' THEN
      IF v_tiene_ing THEN
        v_valor_num := v_ingresos;
        v_valor_txt := v_ingresos::text || ' SMLV';
      ELSE
        v_valor_num := NULL;
        v_valor_txt := NULL;
      END IF;
    ELSE
      v_valor_txt := NULLIF(btrim(COALESCE(p_datos ->> v_campo, '')), '');
      v_valor_num := NULL;
      IF v_tipo = 'rango' AND v_valor_txt IS NOT NULL THEN
        BEGIN
          v_valor_num := v_valor_txt::numeric;
        EXCEPTION WHEN others THEN
          v_valor_num := NULL;
        END;
      END IF;
    END IF;

    IF v_tipo = 'exacto' AND v_valor_txt IS NOT NULL THEN
      FOR v_regla IN SELECT * FROM jsonb_array_elements(COALESCE(v_criterio -> 'reglas', '[]'::jsonb))
      LOOP
        IF lower(btrim(v_regla ->> 'valor')) = lower(v_valor_txt) THEN
          v_puntos := COALESCE((v_regla ->> 'puntos')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_tipo = 'rango' AND v_valor_num IS NOT NULL THEN
      FOR v_regla IN SELECT * FROM jsonb_array_elements(COALESCE(v_criterio -> 'reglas', '[]'::jsonb))
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
                FROM jsonb_array_elements(COALESCE(p_reglas -> 'criterios', '[]'::jsonb)) c),
    'detalle', v_detalle
  );
END;
$$;

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
  v_config record;
BEGIN
  SELECT * INTO v_config
  FROM portal_configuracion_puntaje
  WHERE (p_version IS NULL AND is_active) OR version = p_version
  LIMIT 1;

  IF v_config IS NULL THEN
    RAISE EXCEPTION 'No hay configuración de puntaje activa.';
  END IF;

  RETURN calcular_puntaje_con_reglas(p_datos, v_config.reglas)
         || jsonb_build_object('version', v_config.version);
END;
$$;

-- Guarda una nueva versión de la configuración y la activa.
CREATE OR REPLACE FUNCTION public.admin_guardar_configuracion_puntaje(
  p_reglas jsonb,
  p_nota   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suma        numeric;
  v_nueva       integer;
  v_num_criterios integer;
BEGIN
  IF NOT is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden modificar la configuración de puntaje.';
  END IF;

  SELECT COUNT(*), COALESCE(SUM((c ->> 'max')::numeric), 0)
    INTO v_num_criterios, v_suma
  FROM jsonb_array_elements(COALESCE(p_reglas -> 'criterios', '[]'::jsonb)) c;

  IF v_num_criterios = 0 THEN
    RAISE EXCEPTION 'La configuración debe tener al menos un criterio.';
  END IF;

  IF v_suma <> 100 THEN
    RAISE EXCEPTION 'La suma de los puntajes máximos debe ser exactamente 100 (actual: %).', v_suma;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_nueva FROM portal_configuracion_puntaje;

  UPDATE portal_configuracion_puntaje SET is_active = false WHERE is_active;

  INSERT INTO portal_configuracion_puntaje (version, reglas, is_active, nota, created_by)
  VALUES (v_nueva, p_reglas, true, p_nota, auth.uid());

  RETURN jsonb_build_object('version', v_nueva, 'maximo', v_suma);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_puntaje_con_reglas(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_puntaje_inscripcion(jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_guardar_configuracion_puntaje(jsonb, text) TO authenticated;
