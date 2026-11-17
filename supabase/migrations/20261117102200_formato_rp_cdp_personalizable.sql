CREATE OR REPLACE FUNCTION public.errores_fila_rp(p_fila JSONB, p_etapa TEXT DEFAULT 'borrador')
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_e TEXT[] := ARRAY[]::TEXT[]; v_c TEXT; v_v TEXT; v_max INTEGER;
  v_edu TEXT[] := ARRAY['tercero_presupuestal','origen_legal_apropiacion','proyecto','entidad','rubro_presupuestal','valor','liquidacion','firma_mecanica'];
  v_pre TEXT[] := ARRAY['no_rp','subconsecutivo','descripcion','fecha','no_cdp','subconsecutivo_cdp','fuente_financiacion'];
  v_fecha DATE;
BEGIN
  FOREACH v_c IN ARRAY v_edu || v_pre || ARRAY['contrato'] LOOP
    v_v := COALESCE(p_fila->>v_c,'');
    IF p_fila ? v_c AND jsonb_typeof(p_fila->v_c) <> 'string' THEN
      v_e := array_append(v_e,v_c || ': debe ser texto'); CONTINUE;
    END IF;
    IF v_v = '' THEN
      IF (p_etapa = 'completo' AND v_c <> 'contrato') OR (p_etapa = 'educacion' AND v_c = ANY(v_edu)) THEN
        v_e := array_append(v_e,v_c || ': obligatorio');
      END IF;
      CONTINUE;
    END IF;
    v_max := CASE WHEN v_c = 'tercero_presupuestal' THEN 15
      WHEN v_c IN ('subconsecutivo','subconsecutivo_cdp','origen_legal_apropiacion','proyecto','entidad','fuente_financiacion') THEN 4 ELSE NULL END;
    IF v_max IS NOT NULL AND v_v !~ ('^[0-9]{1,' || v_max || '}$') THEN
      v_e := array_append(v_e,v_c || ': maximo ' || v_max || ' digitos');
    END IF;
    IF v_c IN ('no_rp','no_cdp') AND (length(v_v) > 30 OR v_v !~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$' OR v_v !~ '[0-9]+$') THEN
      v_e := array_append(v_e,v_c || ': use hasta 30 caracteres alfanumericos separados por punto o guion y terminados en digitos');
    END IF;
    IF (v_c = 'descripcion' AND length(v_v) > 500) OR (v_c = 'rubro_presupuestal' AND length(v_v) > 30) THEN
      v_e := array_append(v_e,v_c || ': excede el limite de caracteres');
    END IF;
    IF v_c IN ('valor','liquidacion') THEN
      IF v_v !~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' THEN v_e := array_append(v_e,v_c || ': hasta 13 enteros y 2 decimales');
      ELSIF v_v::NUMERIC <= 0 THEN v_e := array_append(v_e,v_c || ': debe ser mayor que cero'); END IF;
    END IF;
    IF v_c = 'fecha' THEN
      BEGIN
        IF v_v !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'Formato'; END IF;
        v_fecha := make_date(substring(v_v,5,4)::INTEGER,substring(v_v,3,2)::INTEGER,substring(v_v,1,2)::INTEGER);
      EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN v_e := array_append(v_e,'fecha: fecha invalida, use DDMMYYYY');
      END;
    END IF;
  END LOOP;
  IF p_fila->>'origen_legal_apropiacion' IS DISTINCT FROM '5'
    OR p_fila->>'proyecto' IS DISTINCT FROM '841' OR p_fila->>'entidad' IS DISTINCT FROM '9901'
    OR p_fila->>'rubro_presupuestal' IS DISTINCT FROM '2.3.2.02.02.009' OR p_fila->>'firma_mecanica' IS DISTINCT FROM 'NO' THEN
    v_e := array_append(v_e,'Los codigos fijos RP no se pueden modificar');
  END IF;
  IF p_fila->>'valor' ~ '^[0-9]{1,13}(\.[0-9]{1,2})?$' AND p_fila->>'liquidacion' ~ '^[0-9]{1,13}(\.[0-9]{1,2})?$'
    AND (p_fila->>'valor')::NUMERIC <> (p_fila->>'liquidacion')::NUMERIC THEN
    v_e := array_append(v_e,'Liquidacion debe ser igual a Valor');
  END IF;
  IF p_etapa <> 'borrador' AND p_fila->'valor_confirmado' IS DISTINCT FROM 'true'::JSONB THEN
    v_e := array_append(v_e,'Educacion debe confirmar el importe');
  END IF;
  IF p_etapa = 'completo' AND p_fila->'tercero_confirmado' IS DISTINCT FROM 'true'::JSONB THEN
    v_e := array_append(v_e,'Presupuesto debe confirmar el tercero y los codigos en el sistema externo');
  END IF;
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_anio_consecutivo_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rp TEXT; v_cdp TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.portal_documentos_cargue d WHERE d.id=NEW.documento_id AND d.tipo_documento='rp') THEN
    RETURN NEW;
  END IF;
  v_rp := COALESCE(NEW.datos_rp->>'no_rp','');
  v_cdp := COALESCE(NEW.datos_rp->>'no_cdp','');
  IF v_rp <> '' AND (length(v_rp) > 30 OR v_rp !~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$' OR v_rp !~ '[0-9]+$') THEN
    RAISE EXCEPTION 'El No. RP debe tener hasta 30 caracteres alfanumericos separados por punto o guion y terminar en digitos';
  END IF;
  IF v_cdp <> '' AND (length(v_cdp) > 30 OR v_cdp !~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$' OR v_cdp !~ '[0-9]+$') THEN
    RAISE EXCEPTION 'El No. CDP debe tener hasta 30 caracteres alfanumericos separados por punto o guion y terminar en digitos';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst,'reload schema';
