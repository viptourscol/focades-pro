-- Regresión transaccional para gestión de accesos y preferencia del menú lateral.
BEGIN;
DO $$
DECLARE
  v_super_admin UUID;
  v_target UUID;
  v_target_email TEXT;
  v_result JSONB;
  v_raw_roles JSONB;
  v_app_roles JSONB;
  v_raw_legacy_role TEXT;
  v_app_legacy_role TEXT;
  v_error BOOLEAN;
  v_count INTEGER;
BEGIN
  SELECT user_id INTO STRICT v_super_admin
  FROM public.portal_admin_users
  WHERE role = 'super_admin' AND is_active
  ORDER BY created_at
  LIMIT 1;

  SELECT u.id, u.email INTO v_target, v_target_email
  FROM auth.users u
  LEFT JOIN public.portal_admin_users a ON a.user_id = u.id
  WHERE u.id <> v_super_admin
    AND (a.user_id IS NULL OR a.role = 'admin')
  ORDER BY (a.user_id IS NULL) DESC, u.created_at DESC
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No hay una cuenta no-superadmin disponible para la prueba.';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
        jsonb_set(COALESCE(raw_user_meta_data, '{}'::JSONB), '{roles}', '["retained_user_role"]'::JSONB, true),
        '{role}', '"retained_user_legacy"'::JSONB, true
      ),
      raw_app_meta_data = jsonb_set(
        jsonb_set(COALESCE(raw_app_meta_data, '{}'::JSONB), '{roles}', '["retained_app_role"]'::JSONB, true),
        '{role}', '"retained_app_legacy"'::JSONB, true
      )
  WHERE id = v_target;

  PERFORM set_config('request.jwt.claim.sub', v_super_admin::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_super_admin, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_count
  FROM public.admin_list_user_access(v_target_email, 10)
  WHERE user_id = v_target AND is_current_user = FALSE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'No encontró el usuario en la búsqueda administrativa.'; END IF;

  v_result := public.admin_set_user_access(v_target, 'admin', 'admin_contabilidad', 'Prueba de regresión');
  IF v_result->>'workflow_role' <> 'admin_contabilidad' OR v_result->>'portal_role' <> 'admin' THEN
    RAISE EXCEPTION 'No devolvió los permisos asignados.';
  END IF;

  RESET ROLE;
  SELECT raw_user_meta_data->'roles', raw_app_meta_data->'roles',
         raw_user_meta_data->>'role', raw_app_meta_data->>'role'
    INTO v_raw_roles, v_app_roles, v_raw_legacy_role, v_app_legacy_role
  FROM auth.users WHERE id = v_target;
  IF v_raw_roles <> '["retained_user_role","admin_contabilidad"]'::JSONB
    OR v_app_roles <> '["retained_app_role","admin_contabilidad"]'::JSONB
    OR v_raw_legacy_role <> 'retained_user_legacy'
    OR v_app_legacy_role <> 'retained_app_legacy' THEN
    RAISE EXCEPTION 'No actualizó el rol operativo conservando los otros metadatos.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_super_admin::TEXT, TRUE);
  SET LOCAL ROLE authenticated;
  IF public.admin_set_sidebar_preference(TRUE) IS DISTINCT FROM TRUE
    OR public.admin_get_sidebar_preference() IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'No guardó ni leyó la preferencia del menú contraído.';
  END IF;
  IF public.admin_set_sidebar_preference(FALSE) IS DISTINCT FROM FALSE
    OR public.admin_get_sidebar_preference() IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'No guardó ni leyó la preferencia del menú expandido.';
  END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.admin_set_user_access(v_super_admin, 'admin', NULL, 'Intento de reducirse');
  EXCEPTION WHEN OTHERS THEN
    v_error := TRUE;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió reducir el acceso del super administrador actual.'; END IF;

  v_result := public.admin_set_user_access(v_target, NULL, NULL, 'Revocación de prueba');
  IF v_result->>'portal_active' <> 'false' OR v_result->>'workflow_role' IS NOT NULL THEN
    RAISE EXCEPTION 'La revocación no retiró todos los permisos.';
  END IF;

  RESET ROLE;
  SELECT raw_user_meta_data->'roles', raw_app_meta_data->'roles',
         raw_user_meta_data->>'role', raw_app_meta_data->>'role'
    INTO v_raw_roles, v_app_roles, v_raw_legacy_role, v_app_legacy_role
  FROM auth.users WHERE id = v_target;
  IF v_raw_roles <> '["retained_user_role"]'::JSONB
    OR v_app_roles <> '["retained_app_role"]'::JSONB
    OR v_raw_legacy_role <> 'retained_user_legacy'
    OR v_app_legacy_role <> 'retained_app_legacy' THEN
    RAISE EXCEPTION 'La revocación dejó roles operativos o eliminó otros metadatos.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_admin_users
    WHERE user_id = v_target AND is_active = FALSE
  ) THEN
    RAISE EXCEPTION 'La revocación no desactivó el acceso general.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_target::TEXT, TRUE);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target, 'role', 'authenticated')::TEXT, TRUE);
  SET LOCAL ROLE authenticated;
  v_error := FALSE;
  BEGIN
    PERFORM * FROM public.admin_list_user_access('', 10);
  EXCEPTION WHEN OTHERS THEN
    v_error := TRUE;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'Permitió listar accesos a una cuenta sin super_admin.'; END IF;

  RESET ROLE;
END;
$$;
SELECT 'OK usuarios/roles: búsqueda, asignación, revocación, protección por super_admin y preferencia del menú. Todo revertido.' AS resultado;
ROLLBACK;
