-- RPC para que un admin marque una actualización como 'subsanacion',
-- indicando qué campos y qué documentos debe corregir el beneficiario.

CREATE OR REPLACE FUNCTION public.admin_marcar_subsanacion(
  p_actualizacion_id bigint,
  p_campos text[] DEFAULT '{}',
  p_documentos text[] DEFAULT '{}',
  p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF NOT is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar una actualización para subsanación.';
  END IF;

  IF (COALESCE(array_length(p_campos, 1), 0) = 0) AND (COALESCE(array_length(p_documentos, 1), 0) = 0) THEN
    RAISE EXCEPTION 'Selecciona al menos un campo o un documento a corregir.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_observacion, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Debes indicar una observación explicando qué debe corregir el beneficiario.';
  END IF;

  SELECT * INTO v_row FROM portal_actualizaciones WHERE id = p_actualizacion_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'La actualización no existe.';
  END IF;

  IF v_row.estado NOT IN ('en_revision', 'subsanacion') THEN
    RAISE EXCEPTION 'Solo se puede pedir subsanación a una actualización en revisión.';
  END IF;

  UPDATE portal_actualizaciones
  SET estado = 'subsanacion',
      campos_a_corregir = p_campos,
      documentos_a_corregir = p_documentos,
      observacion_admin = p_observacion,
      marcado_subsanacion_at = now(),
      marcado_subsanacion_por = auth.uid(),
      revisado_por_user_id = auth.uid(),
      revisado_at = now(),
      updated_at = now()
  WHERE id = p_actualizacion_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Actualización marcada para subsanación.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_marcar_subsanacion(bigint, text[], text[], text) TO authenticated;
