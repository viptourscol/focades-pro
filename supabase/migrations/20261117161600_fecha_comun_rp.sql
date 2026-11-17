CREATE OR REPLACE FUNCTION public.errores_datos_generales_rp_con_fecha(
  p_datos JSONB, p_anio_convocatoria TEXT, p_etapa TEXT DEFAULT 'borrador'
)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_e TEXT[]; v_fecha DATE; v_fecha_rp TEXT;
BEGIN
  v_e:=public.errores_datos_generales_rp(p_datos-'fecha_rp',p_anio_convocatoria,p_etapa);
  IF p_datos ? 'fecha_rp' AND jsonb_typeof(p_datos->'fecha_rp') IS DISTINCT FROM 'string' THEN
    RETURN array_append(v_e,'La fecha del RP debe ser texto');
  END IF;
  v_fecha_rp:=COALESCE(p_datos->>'fecha_rp','');
  IF p_etapa='completo' AND v_fecha_rp='' THEN
    v_e:=array_append(v_e,'Seleccione la fecha común del RP');
  END IF;
  IF v_fecha_rp<>'' THEN
    BEGIN
      IF v_fecha_rp !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Formato'; END IF;
      v_fecha:=make_date(substring(v_fecha_rp,1,4)::INTEGER,
        substring(v_fecha_rp,6,2)::INTEGER,substring(v_fecha_rp,9,2)::INTEGER);
    EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN
      v_e:=array_append(v_e,'La fecha común del RP no es válida');
    END;
  END IF;
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_rp_cargue_generales(
  p_documento_id UUID, p_terceros_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ, p_datos_generales JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_datos JSONB; v_filas JSONB;
  v_descripcion TEXT; v_contrato TEXT; v_fuente TEXT; v_fecha_resolucion DATE; v_fecha_rp DATE;
  v_fecha_fila TEXT; v_errores TEXT[];
BEGIN
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id FOR UPDATE;
  IF NOT FOUND OR v_doc.tipo_documento<>'rp' THEN RAISE EXCEPTION 'Documento RP no encontrado'; END IF;
  IF v_doc.editado_en IS DISTINCT FROM p_editado_en THEN RAISE EXCEPTION 'El documento cambio. Recargue antes de guardar para no sobrescribir otra edicion.'; END IF;
  IF v_doc.estado='borrador' AND public.fn_tiene_rol('admin_educacion') IS TRUE THEN
    RETURN public.guardar_rp_cargue(p_documento_id,p_terceros_id,p_filas,p_editado_en);
  END IF;
  IF v_doc.estado<>'enviado_para_revision' OR public.fn_tiene_rol('admin_presupuesto') IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo Presupuesto puede editar los datos generales del RP en revision';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas)<>'array' OR jsonb_typeof(p_datos_generales) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Los datos del RP deben ser una lista de filas y un objeto de datos generales';
  END IF;
  v_datos:=p_datos_generales;
  IF v_datos ? 'numero_resolucion' AND COALESCE(v_datos->>'numero_resolucion','')<>'' AND v_datos->>'numero_resolucion' !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'El número de resolución debe contener solo dígitos';
  END IF;
  IF v_datos ? 'fecha_resolucion' AND COALESCE(v_datos->>'fecha_resolucion','')<>'' THEN
    BEGIN
      IF v_datos->>'fecha_resolucion' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Formato'; END IF;
      v_fecha_resolucion:=make_date(substring(v_datos->>'fecha_resolucion',1,4)::INTEGER,
        substring(v_datos->>'fecha_resolucion',6,2)::INTEGER,substring(v_datos->>'fecha_resolucion',9,2)::INTEGER);
    EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN RAISE EXCEPTION 'La fecha de resolución no es válida';
    END;
  END IF;
  IF COALESCE(v_datos->>'fecha_rp','')<>'' THEN
    BEGIN
      IF v_datos->>'fecha_rp' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Formato'; END IF;
      v_fecha_rp:=make_date(substring(v_datos->>'fecha_rp',1,4)::INTEGER,
        substring(v_datos->>'fecha_rp',6,2)::INTEGER,substring(v_datos->>'fecha_rp',9,2)::INTEGER);
    EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN RAISE EXCEPTION 'La fecha común del RP no es válida';
    END;
    v_fecha_fila:=to_char(v_fecha_rp,'DDMMYYYY');
  ELSE
    v_fecha_fila:='';
  END IF;
  v_descripcion:=CASE WHEN v_datos->'descripcion_manual'='true'::JSONB THEN COALESCE(v_datos->>'descripcion','')
    ELSE public.descripcion_automatica_rp(v_datos,(SELECT anio::TEXT FROM public.convocatorias WHERE id=v_doc.convocatoria_id)) END;
  v_contrato:='';
  IF COALESCE(v_datos->>'numero_resolucion','') ~ '^[0-9]+$' AND v_fecha_resolucion IS NOT NULL THEN
    v_contrato:='RESOLUCION ' || (v_datos->>'numero_resolucion') || ' ' || to_char(v_fecha_resolucion,'DDMMYYYY');
  END IF;
  v_fuente:=COALESCE(v_datos->>'fuente_financiacion','');
  v_datos:=v_datos||jsonb_build_object('fecha_rp',COALESCE(v_datos->>'fecha_rp',''),
    'descripcion',v_descripcion,'contrato',v_contrato);
  v_errores:=public.errores_datos_generales_rp_con_fecha(v_datos,
    (SELECT anio::TEXT FROM public.convocatorias WHERE id=v_doc.convocatoria_id),'borrador');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_set(jsonb_set(jsonb_set(jsonb_set(fila,'{descripcion}',to_jsonb(v_descripcion)),
      '{fecha}',to_jsonb(v_fecha_fila)),'{fuente_financiacion}',to_jsonb(v_fuente)),'{contrato}',to_jsonb(v_contrato))
    ORDER BY ordinalidad),'[]'::JSONB) INTO v_filas
  FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS filas(fila,ordinalidad);
  UPDATE public.portal_documentos_cargue SET datos_generales_rp=v_datos,editado_por=auth.uid()
    WHERE id=p_documento_id;
  PERFORM public.guardar_rp_cargue(p_documento_id,p_terceros_id,v_filas,p_editado_en);
  UPDATE public.portal_transiciones_documento SET datos_cambio=datos_cambio||
    jsonb_build_object('datos_generales_antes',v_doc.datos_generales_rp,'datos_generales_despues',v_datos)
    WHERE id=(SELECT id FROM public.portal_transiciones_documento
      WHERE documento_id=p_documento_id AND comentario='Datos RP guardados' ORDER BY fecha DESC,id DESC LIMIT 1);
  RETURN public.leer_rp_cargue(p_documento_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_datos_generales_al_aprobar_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_errores TEXT[]; v_anio TEXT; v_fecha_fila TEXT;
BEGIN
  IF NEW.tipo_documento<>'rp' OR NEW.estado IS NOT DISTINCT FROM OLD.estado OR NEW.estado<>'aprobado' THEN RETURN NEW; END IF;
  SELECT anio::TEXT INTO STRICT v_anio FROM public.convocatorias WHERE id=NEW.convocatoria_id;
  v_errores:=public.errores_datos_generales_rp_con_fecha(NEW.datos_generales_rp,v_anio,'completo');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  v_fecha_fila:=substring(NEW.datos_generales_rp->>'fecha_rp',9,2)||
    substring(NEW.datos_generales_rp->>'fecha_rp',6,2)||substring(NEW.datos_generales_rp->>'fecha_rp',1,4);
  IF EXISTS (SELECT 1 FROM public.portal_valores_cargue v WHERE v.documento_id=NEW.id AND
    (v.datos_rp->>'fecha' IS DISTINCT FROM v_fecha_fila
      OR v.datos_rp->>'descripcion' IS DISTINCT FROM NEW.datos_generales_rp->>'descripcion'
      OR v.datos_rp->>'fuente_financiacion' IS DISTINCT FROM NEW.datos_generales_rp->>'fuente_financiacion'
      OR v.datos_rp->>'contrato' IS DISTINCT FROM NEW.datos_generales_rp->>'contrato')) THEN
    RAISE EXCEPTION 'Los datos comunes deben coincidir en todas las filas del RP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_fecha_compartida_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fecha_rp TEXT; v_fecha_fila TEXT;
BEGIN
  SELECT d.datos_generales_rp->>'fecha_rp' INTO v_fecha_rp FROM public.portal_documentos_cargue d
    WHERE d.id=NEW.documento_id AND d.tipo_documento='rp';
  IF NOT FOUND OR v_fecha_rp IS NULL THEN RETURN NEW; END IF;
  v_fecha_fila:=CASE WHEN v_fecha_rp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN substring(v_fecha_rp,9,2)||substring(v_fecha_rp,6,2)||substring(v_fecha_rp,1,4) ELSE '' END;
  IF NEW.datos_rp->>'fecha' IS DISTINCT FROM v_fecha_fila THEN
    RAISE EXCEPTION 'La Fecha debe coincidir con la fecha común del documento RP';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS w_validar_fecha_compartida_rp ON public.portal_valores_cargue;
CREATE TRIGGER w_validar_fecha_compartida_rp BEFORE INSERT OR UPDATE ON public.portal_valores_cargue
  FOR EACH ROW EXECUTE FUNCTION public.validar_fecha_compartida_rp();

CREATE OR REPLACE FUNCTION public.obtener_rp_exportacion(p_documento_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_filas JSONB; v_anio TEXT; v_errores TEXT[]; v_fecha_fila TEXT;
BEGIN
  IF (public.fn_tiene_rol('admin_educacion') OR public.fn_tiene_rol('admin_presupuesto')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Su rol no puede exportar RP';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue
    WHERE id=p_documento_id AND tipo_documento='rp' FOR SHARE;
  IF NOT FOUND OR v_doc.estado NOT IN ('enviado_para_revision','aprobado','finalizado') THEN
    RAISE EXCEPTION 'Solo puede exportar RP enviados y completos o aprobados';
  END IF;
  SELECT anio::TEXT INTO STRICT v_anio FROM public.convocatorias WHERE id=v_doc.convocatoria_id;
  v_errores:=public.errores_datos_generales_rp_con_fecha(v_doc.datos_generales_rp,v_anio,'completo');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  v_fecha_fila:=substring(v_doc.datos_generales_rp->>'fecha_rp',9,2)||
    substring(v_doc.datos_generales_rp->>'fecha_rp',6,2)||substring(v_doc.datos_generales_rp->>'fecha_rp',1,4);
  IF EXISTS (SELECT 1 FROM public.portal_valores_cargue v WHERE v.documento_id=p_documento_id AND
    (v.datos_rp->>'fecha' IS DISTINCT FROM v_fecha_fila
      OR v.datos_rp->>'descripcion' IS DISTINCT FROM v_doc.datos_generales_rp->>'descripcion'
      OR v.datos_rp->>'fuente_financiacion' IS DISTINCT FROM v_doc.datos_generales_rp->>'fuente_financiacion'
      OR v.datos_rp->>'contrato' IS DISTINCT FROM v_doc.datos_generales_rp->>'contrato')) THEN
    RAISE EXCEPTION 'Los datos comunes deben coincidir en todas las filas del RP';
  END IF;
  PERFORM public.validar_rp_documento(p_documento_id,'completo');
  SELECT COALESCE(jsonb_agg(public.fila_rp(to_jsonb(v)) ORDER BY v.creado_en,v.id),'[]'::JSONB)
    INTO v_filas FROM public.portal_valores_cargue v WHERE documento_id=p_documento_id;
  RETURN v_filas;
END;
$$;

REVOKE ALL ON FUNCTION public.errores_datos_generales_rp_con_fecha(JSONB,TEXT,TEXT),
  public.validar_fecha_compartida_rp() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.errores_datos_generales_rp_con_fecha(JSONB,TEXT,TEXT) TO authenticated;
NOTIFY pgrst,'reload schema';
