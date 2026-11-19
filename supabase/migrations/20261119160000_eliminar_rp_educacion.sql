CREATE OR REPLACE FUNCTION public.proteger_identidad_documento_cargue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo_documento IN ('terceros','rp') AND OLD.estado IN ('aprobado','finalizado') THEN
      RAISE EXCEPTION 'No puede eliminar documentos TERCEROS/RP aprobados o finalizados';
    END IF;
    IF OLD.tipo_documento = 'terceros' AND (
      public.fn_tiene_rol('admin_educacion') IS NOT TRUE
      OR OLD.estado NOT IN ('borrador','enviado_para_revision')
    ) THEN
      RAISE EXCEPTION 'Solo Educación puede eliminar TERCEROS en borrador o en revisión';
    END IF;
    IF OLD.tipo_documento = 'rp' THEN
      PERFORM public.exigir_educacion_rp_actualizacion();
      IF OLD.estado NOT IN ('borrador','enviado_para_revision') OR OLD.aprobado_por IS NOT NULL
        OR OLD.aprobado_en IS NOT NULL THEN
        RAISE EXCEPTION 'Solo se pueden eliminar RP sin aprobación en borrador o en revisión';
      END IF;
      IF current_setting('app.eliminando_rp',TRUE) IS DISTINCT FROM OLD.id::TEXT THEN
        RAISE EXCEPTION 'Use la eliminación confirmada desde la bandeja de documentos';
      END IF;
      IF EXISTS (SELECT 1 FROM public.portal_archivos_op WHERE rp_id=OLD.id) THEN
        RAISE EXCEPTION 'No puede eliminar un RP vinculado a órdenes de pago o etapas posteriores';
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF (OLD.tipo_documento IN ('terceros','rp') OR NEW.tipo_documento IN ('terceros','rp'))
    AND (NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento OR NEW.convocatoria_id IS DISTINCT FROM OLD.convocatoria_id) THEN
    RAISE EXCEPTION 'No puede cambiar el tipo ni la convocatoria de documentos TERCEROS/RP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.eliminar_rp_educacion(
  p_documento_id UUID, p_estado TEXT, p_editado_en TIMESTAMPTZ
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE; v_r RECORD;
BEGIN
  PERFORM public.exigir_educacion_rp_actualizacion();
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id=p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no existe. Actualice la bandeja.'; END IF;
  IF v_doc.tipo_documento <> 'rp' OR v_doc.estado NOT IN ('borrador','enviado_para_revision')
    OR v_doc.aprobado_por IS NOT NULL OR v_doc.aprobado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se pueden eliminar RP sin aprobación en borrador o en revisión';
  END IF;
  IF v_doc.estado IS DISTINCT FROM p_estado OR v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió. Actualice la bandeja y revise antes de eliminar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.portal_archivos_op WHERE rp_id=p_documento_id) THEN
    RAISE EXCEPTION 'No puede eliminar un RP vinculado a órdenes de pago o etapas posteriores';
  END IF;
  FOR v_r IN SELECT beneficiario_id, ventana_id FROM public.portal_rp_actualizaciones
    WHERE rp_id=p_documento_id ORDER BY beneficiario_id, ventana_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('rp-actualizacion:' || v_r.ventana_id::TEXT || ':' || v_r.beneficiario_id::TEXT,0));
  END LOOP;
  PERFORM set_config('app.eliminando_rp',p_documento_id::TEXT,TRUE);
  DELETE FROM public.portal_documentos_cargue WHERE id=p_documento_id;
  PERFORM set_config('app.eliminando_rp','',TRUE);
  RETURN jsonb_build_object('success',TRUE,'documento_id',p_documento_id);
END;
$$;
REVOKE ALL ON FUNCTION public.eliminar_rp_educacion(UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_rp_educacion(UUID,TEXT,TIMESTAMPTZ) TO authenticated;
NOTIFY pgrst,'reload schema';
