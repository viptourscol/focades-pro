ALTER TABLE public.portal_documentos_cargue
  ADD COLUMN datos_generales_rp JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.portal_documentos_cargue.datos_generales_rp IS
  'Datos compartidos del RP: resolución, periodo de pago, fuente y descripción.';

CREATE OR REPLACE FUNCTION public.descripcion_automatica_rp(p_datos JSONB, p_anio_convocatoria TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_fecha DATE; v_fecha_texto TEXT; v_semestre TEXT; v_meses TEXT[] :=
    ARRAY['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
BEGIN
  IF COALESCE(p_datos->>'numero_resolucion','') = ''
    OR COALESCE(p_datos->>'fecha_resolucion','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR COALESCE(p_datos->>'semestre_pago','') NOT IN ('1','2')
    OR COALESCE(p_datos->>'anio_pago','') !~ '^[0-9]{4}$'
    OR COALESCE(p_datos->>'modalidades','') = ''
    OR COALESCE(p_anio_convocatoria,'') !~ '^[0-9]{4}$' THEN
    RETURN '';
  END IF;
  BEGIN
    v_fecha := make_date(substring(p_datos->>'fecha_resolucion',1,4)::INTEGER,
      substring(p_datos->>'fecha_resolucion',6,2)::INTEGER,substring(p_datos->>'fecha_resolucion',9,2)::INTEGER);
  EXCEPTION WHEN datetime_field_overflow OR invalid_text_representation THEN
    RETURN '';
  END;
  v_fecha_texto := extract(day FROM v_fecha)::INTEGER::TEXT || ' DE ' ||
    v_meses[extract(month FROM v_fecha)::INTEGER] || ' DE ' || extract(year FROM v_fecha)::INTEGER::TEXT;
  v_semestre := CASE p_datos->>'semestre_pago' WHEN '1' THEN 'PRIMER' ELSE 'SEGUNDO' END;
  RETURN 'RESOLUCION ' || (p_datos->>'numero_resolucion') || ' DEL ' || v_fecha_texto ||
    ' POR LA CUAL EL FONDO EDUCATIVO PARA EDUCACION SUPERIOR FOCADES, ORDENA PAGAR CREDITOS CONDONABLES CORRESPONDIENTES A LOS BENEFICIARIOS QUE FUERON SELECCIONADOS EN LA CONVOCATORIA ' ||
    p_anio_convocatoria || ', EN EL ' || v_semestre || ' SEMESTRE DEL ' || (p_datos->>'anio_pago') ||
    ' EN LAS MODALIDADES DE ' || upper(trim(p_datos->>'modalidades'));
END;
$$;

CREATE OR REPLACE FUNCTION public.errores_datos_generales_rp(p_datos JSONB, p_anio_convocatoria TEXT, p_etapa TEXT DEFAULT 'borrador')
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_e TEXT[] := ARRAY[]::TEXT[]; v_fecha DATE; v_descripcion TEXT; v_contrato TEXT;
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN
    RETURN ARRAY['Los datos generales del RP no tienen un formato válido'];
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE NOT k=ANY(ARRAY[
    'numero_resolucion','fecha_resolucion','semestre_pago','anio_pago','modalidades','fuente_financiacion',
    'descripcion_manual','modalidades_manual','descripcion','contrato'
  ])) THEN RETURN ARRAY['Los datos generales del RP contienen campos no admitidos']; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_datos) WHERE key IN ('descripcion_manual','modalidades_manual') AND jsonb_typeof(value)<>'boolean')
    OR EXISTS (SELECT 1 FROM jsonb_each(p_datos) WHERE key NOT IN ('descripcion_manual','modalidades_manual') AND jsonb_typeof(value)<>'string') THEN
    RETURN ARRAY['Los datos generales del RP tienen tipos de datos inválidos'];
  END IF;
  IF p_etapa='completo' THEN
    IF COALESCE(p_datos->>'numero_resolucion','')='' THEN v_e:=array_append(v_e,'Ingrese el número de resolución'); END IF;
    IF COALESCE(p_datos->>'fecha_resolucion','')='' THEN v_e:=array_append(v_e,'Ingrese la fecha de resolución'); END IF;
    IF COALESCE(p_datos->>'semestre_pago','')='' THEN v_e:=array_append(v_e,'Seleccione el semestre de pago'); END IF;
    IF COALESCE(p_datos->>'anio_pago','')='' THEN v_e:=array_append(v_e,'Ingrese el año de pago'); END IF;
    IF COALESCE(p_datos->>'modalidades','')='' THEN v_e:=array_append(v_e,'Ingrese las modalidades incluidas'); END IF;
    IF COALESCE(p_datos->>'fuente_financiacion','')='' THEN v_e:=array_append(v_e,'Ingrese la fuente de financiación común del RP'); END IF;
    IF COALESCE(p_datos->>'descripcion','')='' THEN v_e:=array_append(v_e,'La descripción del RP está vacía'); END IF;
  END IF;
  IF COALESCE(p_datos->>'numero_resolucion','')<>'' AND p_datos->>'numero_resolucion' !~ '^[0-9]+$' THEN
    v_e:=array_append(v_e,'El número de resolución debe contener solo dígitos');
  END IF;
  IF COALESCE(p_datos->>'fecha_resolucion','')<>'' THEN
    BEGIN
      IF p_datos->>'fecha_resolucion' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Formato'; END IF;
      v_fecha:=make_date(substring(p_datos->>'fecha_resolucion',1,4)::INTEGER,
        substring(p_datos->>'fecha_resolucion',6,2)::INTEGER,substring(p_datos->>'fecha_resolucion',9,2)::INTEGER);
    EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN
      v_e:=array_append(v_e,'La fecha de resolución no es válida');
    END;
  END IF;
  IF COALESCE(p_datos->>'semestre_pago','')<>'' AND p_datos->>'semestre_pago' NOT IN ('1','2') THEN
    v_e:=array_append(v_e,'El semestre de pago debe ser 1 o 2');
  END IF;
  IF COALESCE(p_datos->>'anio_pago','')<>'' AND p_datos->>'anio_pago' !~ '^[0-9]{4}$' THEN
    v_e:=array_append(v_e,'El año de pago debe tener cuatro dígitos');
  END IF;
  IF COALESCE(p_datos->>'modalidades','')<>'' AND length(p_datos->>'modalidades')>120 THEN
    v_e:=array_append(v_e,'Las modalidades superan 120 caracteres');
  END IF;
  IF COALESCE(p_datos->>'fuente_financiacion','')<>'' AND p_datos->>'fuente_financiacion' !~ '^[0-9]{1,4}$' THEN
    v_e:=array_append(v_e,'La fuente de financiación debe tener hasta 4 dígitos');
  END IF;
  v_descripcion:=COALESCE(p_datos->>'descripcion','');
  IF length(v_descripcion)>500 THEN v_e:=array_append(v_e,'La descripción supera 500 caracteres'); END IF;
  IF p_datos->'descripcion_manual' IS DISTINCT FROM 'true'::JSONB
    AND v_descripcion<>public.descripcion_automatica_rp(p_datos,p_anio_convocatoria) THEN
    v_e:=array_append(v_e,'La descripción automática no coincide con los datos generales del RP');
  END IF;
  v_contrato:='';
  IF COALESCE(p_datos->>'numero_resolucion','') ~ '^[0-9]+$'
    AND COALESCE(p_datos->>'fecha_resolucion','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    BEGIN
      v_fecha:=make_date(substring(p_datos->>'fecha_resolucion',1,4)::INTEGER,
        substring(p_datos->>'fecha_resolucion',6,2)::INTEGER,substring(p_datos->>'fecha_resolucion',9,2)::INTEGER);
      v_contrato:='RESOLUCION ' || (p_datos->>'numero_resolucion') || ' ' || to_char(v_fecha,'DDMMYYYY');
    EXCEPTION WHEN datetime_field_overflow OR invalid_text_representation THEN NULL;
    END;
  END IF;
  IF COALESCE(p_datos->>'contrato','') IS DISTINCT FROM v_contrato THEN
    v_e:=array_append(v_e,'El contrato debe generarse desde el número y la fecha de resolución');
  END IF;
  RETURN v_e;
END;
$$;

CREATE OR REPLACE FUNCTION public.leer_rp_cargue(p_documento_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object('estado',d.estado,'editado_en',d.editado_en,'terceros_id',d.rp_terceros_id,
    'convocatoria_id',d.convocatoria_id,'convocatoria_anio',c.anio::TEXT,
    'datos_generales_rp',d.datos_generales_rp,
    'filas',COALESCE((SELECT jsonb_agg(
      jsonb_set(jsonb_set(public.fila_rp(to_jsonb(v)),'{no_rp}',
        to_jsonb(public.formatear_numero_rp(public.fila_rp(to_jsonb(v))->>'no_rp',c.anio::TEXT))),
        '{no_cdp}',to_jsonb(public.formatear_numero_rp(public.fila_rp(to_jsonb(v))->>'no_cdp',c.anio::TEXT)))
      ORDER BY v.creado_en,v.id) FROM public.portal_valores_cargue v WHERE v.documento_id=d.id),'[]'::JSONB),
    'historial',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.fecha DESC,t.id)
      FROM public.portal_transiciones_documento t WHERE t.documento_id=d.id),'[]'::JSONB))
  FROM public.portal_documentos_cargue d JOIN public.convocatorias c ON c.id=d.convocatoria_id
  WHERE d.id=p_documento_id AND d.tipo_documento='rp';
$$;

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
      IF (p_etapa = 'completo' AND v_c NOT IN ('contrato','subconsecutivo','subconsecutivo_cdp'))
        OR (p_etapa = 'educacion' AND v_c = ANY(v_edu)) THEN
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

CREATE OR REPLACE FUNCTION public.guardar_rp_cargue_generales(
  p_documento_id UUID, p_terceros_id UUID, p_filas JSONB, p_editado_en TIMESTAMPTZ, p_datos_generales JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_datos JSONB; v_filas JSONB;
  v_descripcion TEXT; v_contrato TEXT; v_fuente TEXT; v_fecha DATE; v_errores TEXT[];
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
      v_fecha:=make_date(substring(v_datos->>'fecha_resolucion',1,4)::INTEGER,
        substring(v_datos->>'fecha_resolucion',6,2)::INTEGER,substring(v_datos->>'fecha_resolucion',9,2)::INTEGER);
    EXCEPTION WHEN datetime_field_overflow OR raise_exception THEN RAISE EXCEPTION 'La fecha de resolución no es válida';
    END;
  END IF;
  v_descripcion:=CASE WHEN v_datos->'descripcion_manual'='true'::JSONB THEN COALESCE(v_datos->>'descripcion','')
    ELSE public.descripcion_automatica_rp(v_datos,(SELECT anio::TEXT FROM public.convocatorias WHERE id=v_doc.convocatoria_id)) END;
  v_contrato:='';
  IF COALESCE(v_datos->>'numero_resolucion','') ~ '^[0-9]+$' AND v_fecha IS NOT NULL THEN
    v_contrato:='RESOLUCION ' || (v_datos->>'numero_resolucion') || ' ' || to_char(v_fecha,'DDMMYYYY');
  END IF;
  v_fuente:=COALESCE(v_datos->>'fuente_financiacion','');
  v_datos:=v_datos||jsonb_build_object('descripcion',v_descripcion,'contrato',v_contrato);
  v_errores:=public.errores_datos_generales_rp(v_datos,(SELECT anio::TEXT FROM public.convocatorias WHERE id=v_doc.convocatoria_id),'borrador');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_set(jsonb_set(jsonb_set(fila,'{descripcion}',to_jsonb(v_descripcion)),
      '{fuente_financiacion}',to_jsonb(v_fuente)),'{contrato}',to_jsonb(v_contrato))
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

CREATE OR REPLACE FUNCTION public.validar_datos_compartidos_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_datos JSONB;
BEGIN
  SELECT d.datos_generales_rp INTO v_datos FROM public.portal_documentos_cargue d
    WHERE d.id=NEW.documento_id AND d.tipo_documento='rp';
  IF NOT FOUND OR v_datos='{}'::JSONB THEN RETURN NEW; END IF;
  IF NEW.datos_rp->>'descripcion' IS DISTINCT FROM v_datos->>'descripcion'
    OR NEW.datos_rp->>'fuente_financiacion' IS DISTINCT FROM v_datos->>'fuente_financiacion'
    OR NEW.datos_rp->>'contrato' IS DISTINCT FROM v_datos->>'contrato' THEN
    RAISE EXCEPTION 'Descripción, fuente de financiación y contrato deben coincidir con los datos generales del RP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_datos_generales_al_aprobar_rp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_errores TEXT[]; v_anio TEXT;
BEGIN
  IF NEW.tipo_documento<>'rp' OR NEW.estado IS NOT DISTINCT FROM OLD.estado OR NEW.estado<>'aprobado' THEN RETURN NEW; END IF;
SELECT anio::TEXT INTO STRICT v_anio FROM public.convocatorias WHERE id=NEW.convocatoria_id;
v_errores:=public.errores_datos_generales_rp(NEW.datos_generales_rp,v_anio,'completo');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  IF EXISTS (SELECT 1 FROM public.portal_valores_cargue v WHERE v.documento_id=NEW.id AND
    (v.datos_rp->>'descripcion' IS DISTINCT FROM NEW.datos_generales_rp->>'descripcion'
      OR v.datos_rp->>'fuente_financiacion' IS DISTINCT FROM NEW.datos_generales_rp->>'fuente_financiacion'
      OR v.datos_rp->>'contrato' IS DISTINCT FROM NEW.datos_generales_rp->>'contrato')) THEN
    RAISE EXCEPTION 'Los datos comunes deben coincidir en todas las filas del RP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_rp_exportacion(p_documento_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc public.portal_documentos_cargue%ROWTYPE; v_filas JSONB; v_anio TEXT; v_errores TEXT[];
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
  v_errores:=public.errores_datos_generales_rp(v_doc.datos_generales_rp,v_anio,'completo');
  IF cardinality(v_errores)>0 THEN RAISE EXCEPTION '%',array_to_string(v_errores,'; '); END IF;
  IF EXISTS (SELECT 1 FROM public.portal_valores_cargue v WHERE v.documento_id=p_documento_id AND
    (v.datos_rp->>'descripcion' IS DISTINCT FROM v_doc.datos_generales_rp->>'descripcion'
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

DROP TRIGGER IF EXISTS x_validar_datos_compartidos_rp ON public.portal_valores_cargue;
CREATE TRIGGER x_validar_datos_compartidos_rp BEFORE INSERT OR UPDATE ON public.portal_valores_cargue
  FOR EACH ROW EXECUTE FUNCTION public.validar_datos_compartidos_rp();
DROP TRIGGER IF EXISTS a_validar_datos_generales_al_aprobar_rp ON public.portal_documentos_cargue;
CREATE TRIGGER a_validar_datos_generales_al_aprobar_rp BEFORE UPDATE OF estado ON public.portal_documentos_cargue
  FOR EACH ROW EXECUTE FUNCTION public.validar_datos_generales_al_aprobar_rp();

REVOKE ALL ON FUNCTION public.descripcion_automatica_rp(JSONB,TEXT),
  public.errores_datos_generales_rp(JSONB,TEXT,TEXT),public.guardar_rp_cargue_generales(UUID,UUID,JSONB,TIMESTAMPTZ,JSONB),
  public.validar_datos_compartidos_rp(),public.validar_datos_generales_al_aprobar_rp() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.descripcion_automatica_rp(JSONB,TEXT),
  public.errores_datos_generales_rp(JSONB,TEXT,TEXT),public.guardar_rp_cargue_generales(UUID,UUID,JSONB,TIMESTAMPTZ,JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
