CREATE TABLE public.portal_pago_trazabilidad (
  pago_id bigint PRIMARY KEY REFERENCES public.portal_beneficiario_pagos(id) ON DELETE RESTRICT,
  fila_rp_id uuid NOT NULL UNIQUE REFERENCES public.portal_valores_cargue(id) ON DELETE RESTRICT,
  rp_id uuid NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE RESTRICT,
  numero_rp text NOT NULL,
  fecha_rp date NOT NULL,
  numero_op text NOT NULL,
  fecha_op date NOT NULL,
  numero_egreso text NOT NULL UNIQUE CHECK (numero_egreso = upper(btrim(numero_egreso)) AND numero_egreso <> ''),
  fecha_egreso date NOT NULL,
  registrado_por uuid NOT NULL REFERENCES auth.users(id),
  registrado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_pago_trazabilidad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_pago_trazabilidad FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.proteger_pago_con_trazabilidad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (EXISTS(SELECT 1 FROM focades_importacion.pagos_historicos WHERE pago_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.portal_pago_trazabilidad WHERE pago_id=OLD.id))
    AND (NEW.beneficiario_id,NEW.concepto,NEW.periodo,NEW.monto,NEW.fecha_efectiva,NEW.estado)
      IS DISTINCT FROM (OLD.beneficiario_id,OLD.concepto,OLD.periodo,OLD.monto,OLD.fecha_efectiva,OLD.estado) THEN
    RAISE EXCEPTION 'El pago tiene trazabilidad contable; requiere corrección controlada.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_pago_con_trazabilidad BEFORE UPDATE ON public.portal_beneficiario_pagos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_pago_con_trazabilidad();
REVOKE ALL ON FUNCTION public.proteger_pago_con_trazabilidad() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.trazabilidad_beneficiario(p_beneficiario_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado jsonb;
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Se requiere un administrador activo.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pago_id),'[]'::jsonb) INTO resultado
  FROM (
    SELECT h.pago_id, 'historico' AS origen, h.numero_rp, h.fecha_rp, h.numero_op, h.fecha_op,
      h.numero_egreso, h.fecha_egreso
    FROM focades_importacion.pagos_historicos h WHERE h.beneficiario_id=p_beneficiario_id
    UNION ALL
    SELECT t.pago_id, 'hacienda', t.numero_rp, t.fecha_rp, t.numero_op, t.fecha_op,
      t.numero_egreso, t.fecha_egreso
    FROM public.portal_pago_trazabilidad t JOIN public.portal_beneficiario_pagos p ON p.id=t.pago_id
    WHERE p.beneficiario_id=p_beneficiario_id
  ) t;
  RETURN resultado;
END;
$$;

CREATE FUNCTION public.buscar_trazabilidad_pagos(p_documento text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b record;
BEGIN
  IF public.is_portal_admin(auth.uid()) IS NOT TRUE OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND (
      u.raw_app_meta_data->'roles' ?| ARRAY['admin_presupuesto','admin_contabilidad','admin_pagos']
      OR u.raw_app_meta_data->>'role' IN ('admin_presupuesto','admin_contabilidad','admin_pagos')
    )
  ) THEN RAISE EXCEPTION 'Se requiere un administrador activo de Hacienda.' USING ERRCODE='42501'; END IF;
  IF coalesce(p_documento,'') !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Ingrese un documento completo válido.'; END IF;
  IF (SELECT count(*) FROM public.portal_beneficiarios WHERE n_documento=p_documento) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.portal_beneficiarios WHERE n_documento=p_documento AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Documento no encontrado o con más de una ficha. Revise la identidad.';
  END IF;
  SELECT id,nombre_completo,n_documento INTO STRICT b FROM public.portal_beneficiarios
    WHERE n_documento=p_documento AND deleted_at IS NULL;
  RETURN jsonb_build_object('nombre',b.nombre_completo,'documento',b.n_documento,'pagos',
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'concepto',p.concepto,'periodo',p.periodo,'monto',p.monto,'estado',p.estado,
      'fecha_efectiva',p.fecha_efectiva,'soporte',s.valor) ORDER BY p.fecha_efectiva DESC NULLS LAST,p.id DESC),'[]'::jsonb)
     FROM public.portal_beneficiario_pagos p
     LEFT JOIN LATERAL (
       SELECT x AS valor FROM jsonb_array_elements(public.trazabilidad_beneficiario(b.id)) x
       WHERE (x->>'pago_id')::bigint=p.id
     ) s ON true WHERE p.beneficiario_id=b.id));
END;
$$;

CREATE FUNCTION public.leer_obligaciones_egreso(p_convocatoria_id uuid, p_rp_id uuid, p_periodo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; salida jsonb := '[]'::jsonb; b_id bigint; b_nombre text; b_baja timestamptz;
  cantidad integer; v_periodo text; opciones jsonb; archivos jsonb; esperadas integer; encontradas integer;
BEGIN
  PERFORM public.exigir_pagos_cargue();
  IF NOT EXISTS (SELECT 1 FROM public.portal_archivos_contabilidad c
    JOIN public.portal_documentos_cargue d ON d.id=c.rp_id
    WHERE c.rp_id=p_rp_id AND d.convocatoria_id=p_convocatoria_id AND c.estado='aprobado'
      AND c.archivos_aprobados IS NOT NULL) THEN
    RAISE EXCEPTION 'La contabilización no está aprobada para esta convocatoria.';
  END IF;
  SELECT archivos_aprobados INTO STRICT archivos FROM public.portal_archivos_contabilidad WHERE rp_id=p_rp_id;
  IF jsonb_typeof(archivos->'op'->'filas') IS DISTINCT FROM 'array'
    OR jsonb_typeof(archivos->'contabilidad'->'filas') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Los archivos aprobados no contienen filas verificables.';
  END IF;
  esperadas := jsonb_array_length(archivos->'op'->'filas');
  SELECT count(*) INTO encontradas
    FROM jsonb_array_elements(archivos->'op'->'filas') o(fila)
    JOIN jsonb_array_elements(archivos->'contabilidad'->'filas') c(fila) ON c.fila->>'id'=o.fila->>'id'
    JOIN public.portal_valores_cargue v ON v.id::text=o.fila->>'id' AND v.documento_id=p_rp_id;
  IF esperadas=0 OR esperadas<>jsonb_array_length(archivos->'contabilidad'->'filas')
    OR encontradas<>esperadas
    OR (SELECT count(DISTINCT fila->>'id') FROM jsonb_array_elements(archivos->'op'->'filas') fila)<>esperadas
    OR (SELECT count(DISTINCT fila->>'id') FROM jsonb_array_elements(archivos->'contabilidad'->'filas') fila)<>esperadas THEN
    RAISE EXCEPTION 'Las filas aprobadas no coinciden con sus documentos de origen.';
  END IF;
  FOR r IN
    SELECT v.id, v.identificacion, v.nombre_beneficiario, op.fila AS op, ct.fila AS ct,
      c.archivos_aprobados->'op'->'datos' AS op_datos, d.datos_generales_rp,
      w.nombre AS ventana, ra.beneficiario_id AS beneficiario_vinculado
    FROM public.portal_archivos_contabilidad c
    JOIN public.portal_documentos_cargue d ON d.id=c.rp_id
    CROSS JOIN LATERAL jsonb_array_elements(c.archivos_aprobados->'op'->'filas') op(fila)
    JOIN LATERAL jsonb_array_elements(c.archivos_aprobados->'contabilidad'->'filas') ct(fila)
      ON ct.fila->>'id'=op.fila->>'id'
    JOIN public.portal_valores_cargue v ON v.id=(op.fila->>'id')::uuid AND v.documento_id=d.id
    LEFT JOIN public.portal_rp_actualizaciones ra ON ra.fila_id=v.id AND ra.rp_id=d.id
    LEFT JOIN public.portal_ventanas_actualizacion w ON w.id=d.rp_ventana_id
    WHERE c.rp_id=p_rp_id
  LOOP
    SELECT count(*) INTO cantidad FROM public.portal_beneficiarios
      WHERE n_documento=r.identificacion;
    b_id := NULL; b_nombre := NULL; b_baja := NULL;
    IF cantidad=1 THEN
      SELECT id,nombre_completo,deleted_at INTO b_id,b_nombre,b_baja FROM public.portal_beneficiarios WHERE n_documento=r.identificacion;
      IF b_baja IS NOT NULL OR (r.beneficiario_vinculado IS NOT NULL AND b_id<>r.beneficiario_vinculado) THEN
        b_id := NULL; b_nombre := NULL;
      END IF;
    END IF;
    v_periodo := coalesce(nullif(btrim(r.ventana),''),nullif(btrim(p_periodo),''));
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'estado',p.estado,'monto',p.monto,
      'fecha_efectiva',p.fecha_efectiva) ORDER BY p.id),'[]'::jsonb) INTO opciones
    FROM public.portal_beneficiario_pagos p WHERE p.beneficiario_id=b_id AND v_periodo IS NOT NULL
      AND upper(btrim(p.periodo))=upper(v_periodo);
    salida := salida || jsonb_build_array(jsonb_build_object(
      'fila_id',r.id,'documento',r.identificacion,'nombre',b_nombre,'beneficiario_id',b_id,
      'periodo',v_periodo,'ventana',r.ventana,'numero_rp',r.op->>'no_rp',
      'fecha_rp',r.datos_generales_rp->>'fecha_rp','numero_op',r.ct->>'no_obligacion',
      'fecha_op',r.op_datos->>'fecha','monto',r.op->>'valor','coincidencias',opciones,
      'confirmado',EXISTS(SELECT 1 FROM public.portal_pago_trazabilidad t WHERE t.fila_rp_id=r.id)));
  END LOOP;
  RETURN salida;
END;
$$;

CREATE FUNCTION public.confirmar_egreso_beneficiario(
  p_convocatoria_id uuid,p_rp_id uuid,p_fila_id uuid,p_periodo text,
  p_numero_egreso text,p_fecha_egreso date,p_pago_existente_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fila jsonb; candidato record; pago bigint; egreso text := upper(btrim(p_numero_egreso)); importe numeric;
BEGIN
  PERFORM public.exigir_pagos_cargue();
  IF egreso IS NULL OR length(egreso) NOT BETWEEN 1 AND 100 OR p_fecha_egreso IS NULL
    OR p_fecha_egreso>current_date THEN RAISE EXCEPTION 'Indique número y fecha válidos del egreso.'; END IF;
  LOCK TABLE public.portal_beneficiarios, public.portal_beneficiario_pagos, public.portal_valores_cargue,
    focades_importacion.pagos_historicos, public.portal_pago_trazabilidad IN SHARE ROW EXCLUSIVE MODE;
  SELECT value INTO fila FROM jsonb_array_elements(public.leer_obligaciones_egreso(
    p_convocatoria_id,p_rp_id,p_periodo)) WHERE value->>'fila_id'=p_fila_id::text;
  IF fila IS NULL OR fila->>'beneficiario_id' IS NULL OR fila->>'periodo' IS NULL THEN
    RAISE EXCEPTION 'No hay beneficiario inequívoco o falta indicar el período.';
  END IF;
  IF length(fila->>'periodo')>100 OR nullif(btrim(fila->>'numero_rp'),'') IS NULL
    OR nullif(btrim(fila->>'numero_op'),'') IS NULL THEN
    RAISE EXCEPTION 'Falta el número de RP u OP, o el período es demasiado largo.';
  END IF;
  IF (fila->>'confirmado')::boolean THEN RAISE EXCEPTION 'La obligación ya fue confirmada; consulte el pago registrado.'; END IF;
  IF EXISTS(SELECT 1 FROM public.portal_pago_trazabilidad WHERE numero_egreso=egreso)
    OR EXISTS(SELECT 1 FROM focades_importacion.pagos_historicos WHERE upper(btrim(numero_egreso))=egreso)
    OR EXISTS(SELECT 1 FROM public.portal_valores_cargue WHERE id<>p_fila_id AND upper(btrim(numero_egreso))=egreso) THEN
    RAISE EXCEPTION 'El número de egreso ya existe; revise antes de continuar.';
  END IF;
  IF (fila->>'fecha_rp') IS NULL OR (fila->>'fecha_op') IS NULL OR p_fecha_egreso<(fila->>'fecha_rp')::date
    OR p_fecha_egreso<(fila->>'fecha_op')::date THEN RAISE EXCEPTION 'Verifique las fechas del RP, OP y egreso.'; END IF;
  importe := (fila->>'monto')::numeric;
  IF importe<=0 OR importe>9999999999.99 OR importe<>round(importe,2) THEN RAISE EXCEPTION 'Valor bruto del RP inválido.'; END IF;
  IF p_pago_existente_id IS NULL THEN
    IF jsonb_array_length(fila->'coincidencias')>0 THEN
      RAISE EXCEPTION 'Hay pagos en este período; seleccione uno existente o concilie la diferencia.';
    END IF;
    INSERT INTO public.portal_beneficiario_pagos(beneficiario_id,concepto,periodo,referencia,monto,fecha_efectiva,estado,
      created_by_user_id,updated_by_user_id)
    VALUES ((fila->>'beneficiario_id')::bigint,'Desembolso',fila->>'periodo',fila->>'numero_op',importe,
      p_fecha_egreso,'efectuado',auth.uid(),auth.uid()) RETURNING id INTO pago;
  ELSE
    SELECT * INTO candidato FROM public.portal_beneficiario_pagos WHERE id=p_pago_existente_id FOR UPDATE;
    IF NOT FOUND OR candidato.beneficiario_id<>(fila->>'beneficiario_id')::bigint
      OR upper(btrim(coalesce(candidato.periodo,'')))<>upper(fila->>'periodo') OR candidato.monto<>importe
      OR candidato.estado NOT IN ('programado','pendiente','efectuado')
      OR (candidato.estado='efectuado' AND candidato.fecha_efectiva IS DISTINCT FROM p_fecha_egreso)
      OR EXISTS(SELECT 1 FROM public.portal_pago_trazabilidad WHERE pago_id=p_pago_existente_id)
      OR EXISTS(SELECT 1 FROM focades_importacion.pagos_historicos WHERE pago_id=p_pago_existente_id) THEN
      RAISE EXCEPTION 'El pago elegido no coincide o ya tiene trazabilidad; concilie manualmente.';
    END IF;
    pago := candidato.id;
    IF candidato.estado<>'efectuado' THEN
      UPDATE public.portal_beneficiario_pagos SET estado='efectuado',fecha_efectiva=p_fecha_egreso,
        updated_by_user_id=auth.uid(),updated_at=now() WHERE id=pago;
    END IF;
  END IF;
  INSERT INTO public.portal_pago_trazabilidad(pago_id,fila_rp_id,rp_id,numero_rp,fecha_rp,
    numero_op,fecha_op,numero_egreso,fecha_egreso,registrado_por)
  VALUES (pago,p_fila_id,p_rp_id,fila->>'numero_rp',(fila->>'fecha_rp')::date,
    fila->>'numero_op',(fila->>'fecha_op')::date,egreso,p_fecha_egreso,auth.uid());
  RETURN jsonb_build_object('ok',true,'pago_id',pago);
END;
$$;

REVOKE ALL ON FUNCTION public.trazabilidad_beneficiario(bigint),public.buscar_trazabilidad_pagos(text),
  public.leer_obligaciones_egreso(uuid,uuid,text),
  public.confirmar_egreso_beneficiario(uuid,uuid,uuid,text,text,date,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.trazabilidad_beneficiario(bigint),public.buscar_trazabilidad_pagos(text),
  public.leer_obligaciones_egreso(uuid,uuid,text),
  public.confirmar_egreso_beneficiario(uuid,uuid,uuid,text,text,date,bigint) TO authenticated;
