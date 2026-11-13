-- Lectura con el rol real de Presupuesto. No modifica usuarios ni documentos.
BEGIN;
DO $$
DECLARE
  v_actor UUID;
  v_doc UUID := '4d3e80ee-eb03-40b4-bc6f-46064b87e01a';
BEGIN
  SELECT id INTO STRICT v_actor FROM auth.users
  WHERE raw_user_meta_data->'roles' @> '["admin_presupuesto"]'::JSONB
  ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_actor::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;
  IF NOT public.fn_tiene_rol('admin_presupuesto') THEN RAISE EXCEPTION 'No se activo el rol de Presupuesto'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_documentos_cargue
    WHERE id = v_doc AND tipo_documento = 'terceros'
      AND estado = 'enviado_para_revision' AND cantidad_registros = 3
  ) THEN RAISE EXCEPTION 'Presupuesto no puede leer el documento enviado'; END IF;
  IF (SELECT COUNT(*) FROM public.portal_valores_cargue WHERE documento_id = v_doc) <> 3 THEN
    RAISE EXCEPTION 'Presupuesto no puede leer los tres terceros';
  END IF;
END;
$$;
ROLLBACK;
SELECT 'OK: Presupuesto lee el documento enviado y sus tres terceros bajo RLS. Sin cambios persistidos.' AS resultado;
