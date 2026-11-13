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
    RETURN OLD;
  END IF;
  IF (OLD.tipo_documento IN ('terceros','rp') OR NEW.tipo_documento IN ('terceros','rp'))
    AND (NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento OR NEW.convocatoria_id IS DISTINCT FROM OLD.convocatoria_id) THEN
    RAISE EXCEPTION 'No puede cambiar el tipo ni la convocatoria de documentos TERCEROS/RP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.eliminar_terceros_educacion(
  p_documento_id UUID, p_estado TEXT, p_editado_en TIMESTAMPTZ
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.portal_documentos_cargue%ROWTYPE;
BEGIN
  IF public.fn_tiene_rol('admin_educacion') IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo Educación puede eliminar documentos TERCEROS';
  END IF;
  SELECT * INTO v_doc FROM public.portal_documentos_cargue WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El documento ya no existe. Actualice la bandeja.'; END IF;
  IF v_doc.tipo_documento <> 'terceros' OR v_doc.estado NOT IN ('borrador','enviado_para_revision') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar TERCEROS en borrador o en revisión';
  END IF;
  IF v_doc.estado IS DISTINCT FROM p_estado OR v_doc.editado_en IS DISTINCT FROM p_editado_en THEN
    RAISE EXCEPTION 'El documento cambió. Actualice la bandeja y revise antes de eliminar.';
  END IF;
  DELETE FROM public.portal_documentos_cargue WHERE id = p_documento_id;
  RETURN jsonb_build_object('success', TRUE, 'documento_id', p_documento_id);
END;
$$;
REVOKE ALL ON FUNCTION public.eliminar_terceros_educacion(UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_terceros_educacion(UUID,TEXT,TIMESTAMPTZ) TO authenticated;
NOTIFY pgrst, 'reload schema';
