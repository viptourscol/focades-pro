CREATE SCHEMA focades_importacion;
REVOKE ALL ON SCHEMA focades_importacion FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE focades_importacion.pagos_historicos (
  pago_id bigint PRIMARY KEY REFERENCES public.portal_beneficiario_pagos(id)
    DEFERRABLE INITIALLY DEFERRED,
  lote uuid NOT NULL,
  beneficiario_id bigint NOT NULL REFERENCES public.portal_beneficiarios(id),
  archivo_sha256 text NOT NULL,
  fila integer NOT NULL,
  fecha_rp date,
  numero_rp text,
  fecha_op date,
  numero_op text,
  fecha_egreso date NOT NULL,
  numero_egreso text NOT NULL,
  registrado_por name NOT NULL DEFAULT session_user,
  registrado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (archivo_sha256, fila),
  UNIQUE (beneficiario_id, fecha_egreso, numero_egreso)
);

CREATE TABLE focades_importacion.lotes_pagos (
  id uuid PRIMARY KEY,
  manifiesto_sha256 text NOT NULL,
  resultado jsonb NOT NULL,
  registrado_at timestamptz NOT NULL DEFAULT now()
);

ALTER FUNCTION public.crear_o_actualizar_condonacion_semestral_por_pago(bigint)
  SET SCHEMA focades_importacion;
REVOKE ALL ON FUNCTION focades_importacion.crear_o_actualizar_condonacion_semestral_por_pago(bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.crear_o_actualizar_condonacion_semestral_por_pago(p_pago_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
BEGIN
  IF EXISTS (SELECT 1 FROM focades_importacion.pagos_historicos WHERE pago_id = p_pago_id) THEN
    SELECT id, estado_condonacion INTO STRICT c FROM public.portal_condonacion_semestral WHERE pago_id = p_pago_id;
    RETURN jsonb_build_object('ok', true, 'condonacion_id', c.id, 'pago_id', p_pago_id, 'estado', c.estado_condonacion);
  END IF;
  RETURN focades_importacion.crear_o_actualizar_condonacion_semestral_por_pago(p_pago_id);
END;
$$;
REVOKE ALL ON FUNCTION public.crear_o_actualizar_condonacion_semestral_por_pago(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_o_actualizar_condonacion_semestral_por_pago(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_beneficiario_pago_rights()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rights record;
BEGIN
  IF coalesce(NEW.estado, 'programado') <> 'efectuado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1 FROM focades_importacion.pagos_historicos h
    WHERE h.pago_id = NEW.id AND h.beneficiario_id = NEW.beneficiario_id
  ) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_rights FROM public.compute_beneficiario_payment_rights(
    NEW.beneficiario_id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END);
  IF NOT v_rights.es_elegible THEN
    RAISE EXCEPTION '%', coalesce(v_rights.motivo_bloqueo, 'Beneficiario sin elegibilidad para registrar pagos efectuados.');
  END IF;
  IF coalesce(v_rights.pagos_restantes, 0) < 1 THEN
    RAISE EXCEPTION 'El beneficiario no tiene cupos de pago restantes.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_condonacion_handle_pago_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.estado = 'efectuado' THEN
    IF EXISTS (SELECT 1 FROM focades_importacion.pagos_historicos h WHERE h.pago_id = NEW.id) THEN
      INSERT INTO public.portal_condonacion_semestral (
        beneficiario_id, pago_id, actualizacion_id, semestre_texto,
        monto_desembolsado, promedio_reportado, estado_condonacion
      ) VALUES (NEW.beneficiario_id, NEW.id, NULL, coalesce(nullif(NEW.periodo, ''), 'Periodo no informado'),
        NEW.monto, NULL, 'pendiente_admin');
    ELSE
      PERFORM public.crear_o_actualizar_condonacion_semestral_por_pago(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'efectuado' AND coalesce(OLD.estado, '') <> 'efectuado' THEN
    IF NOT EXISTS (SELECT 1 FROM focades_importacion.pagos_historicos h WHERE h.pago_id = NEW.id) THEN
      PERFORM public.crear_o_actualizar_condonacion_semestral_por_pago(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION focades_importacion.aplicar_piloto(
  p_lote uuid, p_archivo_sha256 text, p_filas jsonb
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  f record;
  cupo record;
  beneficiario record;
  lote_anterior record;
  nuevo_pago bigint;
  ajuste integer;
  aumentos integer := 0;
  monto_total numeric := 0;
  huella text;
  resultado jsonb;
BEGIN
  IF p_lote IS NULL OR p_archivo_sha256 IS NULL OR p_archivo_sha256 !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Manifiesto historico invalido';
  END IF;
  IF jsonb_array_length(p_filas) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'El piloto admite entre 1 y 10 pagos';
  END IF;
  huella := encode(sha256(convert_to(jsonb_build_array(p_archivo_sha256, p_filas)::text, 'UTF8')), 'hex');

  LOCK TABLE public.portal_beneficiarios, public.portal_beneficiario_pago_ajustes,
    public.portal_beneficiario_pagos, public.pagos, public.portal_valores_cargue,
    public.portal_archivos_op, focades_importacion.lotes_pagos IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO lote_anterior FROM focades_importacion.lotes_pagos WHERE id = p_lote;
  IF FOUND THEN
    IF lote_anterior.manifiesto_sha256 <> huella THEN
      RAISE EXCEPTION 'El ID de lote ya fue utilizado con otro manifiesto';
    END IF;
    RETURN lote_anterior.resultado || jsonb_build_object('repetido', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos) THEN
    RAISE EXCEPTION 'Aparecieron pagos en la fuente anterior; conciliar de nuevo';
  END IF;

  FOR f IN SELECT * FROM jsonb_to_recordset(p_filas) AS r(
    fila integer, beneficiario_id bigint, documento text, concepto text, periodo text,
    referencia text, monto numeric, fecha_rp date, numero_rp text, fecha_op date,
    numero_op text, fecha_egreso date, numero_egreso text, observacion text
  ) LOOP
    IF f.fila IS NULL OR f.fila < 2 OR f.documento IS NULL OR f.documento !~ '^[0-9]+$'
      OR nullif(btrim(f.concepto), '') IS NULL OR nullif(btrim(f.periodo), '') IS NULL
      OR nullif(btrim(f.numero_egreso), '') IS NULL OR f.fecha_egreso IS NULL
      OR f.fecha_egreso > current_date OR f.fecha_egreso < f.fecha_rp OR f.fecha_egreso < f.fecha_op
      OR f.monto IS NULL OR f.monto <= 0 OR f.monto > 9999999999.99 OR f.monto <> round(f.monto, 2) THEN
      RAISE EXCEPTION 'Fila %: faltan datos o hay evidencia inconsistente', f.fila;
    END IF;
    SELECT id, deleted_at INTO beneficiario FROM public.portal_beneficiarios
    WHERE regexp_replace(btrim(n_documento), '[[:space:].-]', '', 'g') = f.documento
      AND id = f.beneficiario_id;
    IF NOT FOUND OR beneficiario.deleted_at IS NOT NULL OR (
      SELECT count(*) FROM public.portal_beneficiarios
      WHERE regexp_replace(btrim(n_documento), '[[:space:].-]', '', 'g') = f.documento
    ) <> 1 THEN
      RAISE EXCEPTION 'Fila %: identidad inconsistente, ambigua o dada de baja', f.fila;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.portal_beneficiario_pagos p
      WHERE p.beneficiario_id = f.beneficiario_id AND p.monto = f.monto
        AND (p.fecha_efectiva = f.fecha_egreso OR upper(btrim(p.periodo)) = upper(btrim(f.periodo)))
    ) OR EXISTS (
      SELECT 1 FROM public.portal_valores_cargue v LEFT JOIN public.portal_archivos_op o ON o.rp_id = v.documento_id
      WHERE regexp_replace(btrim(v.identificacion), '[[:space:].-]', '', 'g') = f.documento
        AND (f.monto IN (v.valor_bruto,v.valor_neto) OR upper(btrim(f.numero_rp)) = upper(btrim(v.numero_rp))
          OR upper(btrim(f.numero_op)) IN (upper(btrim(v.numero_op)),upper(btrim(o.datos->>'no_op')))
          OR upper(btrim(f.numero_egreso)) = upper(btrim(v.numero_egreso)))
    ) THEN
      RAISE EXCEPTION 'Fila %: posible pago ya registrado; revisar', f.fila;
    END IF;
    nuevo_pago := nextval(pg_get_serial_sequence('public.portal_beneficiario_pagos', 'id'));
    INSERT INTO focades_importacion.pagos_historicos (
      pago_id, lote, beneficiario_id, archivo_sha256, fila, fecha_rp, numero_rp,
      fecha_op, numero_op, fecha_egreso, numero_egreso
    ) VALUES (nuevo_pago, p_lote, f.beneficiario_id, p_archivo_sha256, f.fila, f.fecha_rp,
      nullif(upper(btrim(f.numero_rp)), ''), f.fecha_op, nullif(upper(btrim(f.numero_op)), ''),
      f.fecha_egreso, upper(btrim(f.numero_egreso)));
    INSERT INTO public.portal_beneficiario_pagos (
      id, beneficiario_id, concepto, periodo, referencia, monto, fecha_efectiva, estado, observacion
    ) VALUES (nuevo_pago, f.beneficiario_id, btrim(f.concepto), btrim(f.periodo),
      nullif(btrim(f.referencia), ''), f.monto, f.fecha_egreso, 'efectuado', f.observacion);
    IF NOT EXISTS (SELECT 1 FROM public.portal_condonacion_semestral
      WHERE pago_id = nuevo_pago AND estado_condonacion = 'pendiente_admin'
      AND promedio_reportado IS NULL AND actualizacion_id IS NULL) THEN
      RAISE EXCEPTION 'Fila %: no se pudo verificar la condonacion pendiente', f.fila;
    END IF;
    monto_total := monto_total + f.monto;
  END LOOP;

  FOR beneficiario IN SELECT DISTINCT beneficiario_id AS id
    FROM focades_importacion.pagos_historicos WHERE lote = p_lote
  LOOP
    SELECT * INTO STRICT cupo FROM public.compute_beneficiario_payment_rights(beneficiario.id);
    ajuste := greatest(0, cupo.pagos_efectuados - (cupo.derecho_inicial + cupo.ajustes_netos));
    IF ajuste > 0 THEN
      INSERT INTO public.portal_beneficiario_pago_ajustes (beneficiario_id, ajuste_pagos, motivo, nota)
      VALUES (beneficiario.id, ajuste, 'importacion_historica', 'Lote ' || p_lote::text);
      aumentos := aumentos + ajuste;
    END IF;
  END LOOP;
  resultado := jsonb_build_object('lote', p_lote, 'pagos', jsonb_array_length(p_filas),
    'condonaciones_pendientes', jsonb_array_length(p_filas), 'monto', monto_total,
    'incrementos_cupo', aumentos, 'repetido', false);
  INSERT INTO focades_importacion.lotes_pagos VALUES (p_lote, huella, resultado);
  RETURN resultado;
END;
$$;

REVOKE ALL ON FUNCTION focades_importacion.aplicar_piloto(uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
