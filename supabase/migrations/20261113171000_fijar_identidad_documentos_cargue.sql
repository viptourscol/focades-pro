CREATE FUNCTION public.proteger_identidad_documento_cargue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo_documento IN ('terceros','rp') AND OLD.estado IN ('aprobado','finalizado') THEN
      RAISE EXCEPTION 'No puede eliminar documentos TERCEROS/RP aprobados o finalizados';
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
CREATE TRIGGER proteger_identidad_documento_cargue
BEFORE UPDATE OF tipo_documento, convocatoria_id OR DELETE ON public.portal_documentos_cargue
FOR EACH ROW EXECUTE FUNCTION public.proteger_identidad_documento_cargue();
REVOKE ALL ON FUNCTION public.proteger_identidad_documento_cargue() FROM PUBLIC, anon, authenticated;
