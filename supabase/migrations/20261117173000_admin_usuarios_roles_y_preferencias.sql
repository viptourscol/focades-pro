CREATE OR REPLACE FUNCTION public.admin_list_user_access(
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  nombre_completo TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  has_portal_access BOOLEAN,
  portal_role TEXT,
  portal_active BOOLEAN,
  workflow_role TEXT,
  is_current_user BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_query TEXT := lower(trim(COALESCE(p_query, '')));
  v_limit INTEGER := greatest(1, least(COALESCE(p_limit, 50), 100));
  v_roles TEXT[] := ARRAY[
    'admin_educacion', 'admin_presupuesto', 'admin_contabilidad',
    'admin_pagos', 'admin_visualizacion'
  ];
BEGIN
  IF NOT public.is_portal_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un super administrador puede gestionar usuarios y roles.';
  END IF;

  IF v_query <> '' AND length(v_query) < 2 THEN
    RAISE EXCEPTION 'Ingresa al menos dos caracteres para buscar usuarios.';
  END IF;

  RETURN QUERY
  WITH usuarios AS (
    SELECT
      u.id,
      lower(COALESCE(u.email, '')) AS correo,
      COALESCE(
        NULLIF(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), ''),
        split_part(COALESCE(u.email, ''), '@', 1)
      ) AS nombre,
      u.created_at AS creado_en,
      u.last_sign_in_at AS ultimo_ingreso,
      (u.id = v_actor) AS es_usuario_actual,
      (a.user_id IS NOT NULL) AS tiene_acceso,
      a.role AS rol_portal,
      COALESCE(a.is_active, false) AS acceso_activo,
      COALESCE(
        (
          SELECT roles.value
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(u.raw_user_meta_data->'roles') = 'array'
              THEN u.raw_user_meta_data->'roles' ELSE '[]'::JSONB END
          ) WITH ORDINALITY AS roles(value, orden)
          WHERE roles.value = ANY(v_roles)
          ORDER BY roles.orden
          LIMIT 1
        ),
        (
          SELECT roles.value
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(u.raw_app_meta_data->'roles') = 'array'
              THEN u.raw_app_meta_data->'roles' ELSE '[]'::JSONB END
          ) WITH ORDINALITY AS roles(value, orden)
          WHERE roles.value = ANY(v_roles)
          ORDER BY roles.orden
          LIMIT 1
        ),
        CASE WHEN u.raw_user_meta_data->>'role' = ANY(v_roles)
          THEN u.raw_user_meta_data->>'role' END,
        CASE WHEN u.raw_app_meta_data->>'role' = ANY(v_roles)
          THEN u.raw_app_meta_data->>'role' END
      ) AS rol_operativo
    FROM auth.users u
    LEFT JOIN public.portal_admin_users a ON a.user_id = u.id
  )
  SELECT
    usuarios.id,
    usuarios.correo,
    usuarios.nombre,
    usuarios.creado_en,
    usuarios.ultimo_ingreso,
    usuarios.tiene_acceso,
    usuarios.rol_portal,
    usuarios.acceso_activo,
    usuarios.rol_operativo,
    usuarios.es_usuario_actual
  FROM usuarios
  WHERE
    (
      v_query = ''
      AND (usuarios.tiene_acceso OR usuarios.rol_operativo IS NOT NULL)
    )
    OR (
      v_query <> ''
      AND (
        position(v_query IN usuarios.correo) > 0
        OR position(v_query IN lower(usuarios.nombre)) > 0
      )
    )
  ORDER BY usuarios.acceso_activo DESC, usuarios.nombre, usuarios.correo
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_access(
  p_target_user_id UUID,
  p_portal_role TEXT,
  p_workflow_role TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_portal_role TEXT := NULLIF(lower(trim(COALESCE(p_portal_role, ''))), '');
  v_workflow_role TEXT := NULLIF(lower(trim(COALESCE(p_workflow_role, ''))), '');
  v_user auth.users%ROWTYPE;
  v_admin public.portal_admin_users%ROWTYPE;
  v_workflow_roles TEXT[] := ARRAY[
    'admin_educacion', 'admin_presupuesto', 'admin_contabilidad',
    'admin_pagos', 'admin_visualizacion'
  ];
  v_has_admin BOOLEAN := false;
  v_before JSONB;
  v_after JSONB;
  v_user_roles JSONB;
  v_app_roles JSONB;
  v_user_metadata JSONB;
  v_app_metadata JSONB;
  v_name TEXT;
  v_previous_workflow_role TEXT;
  v_super_admin_count INTEGER;
BEGIN
  IF NOT public.is_portal_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un super administrador puede gestionar usuarios y roles.';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona un usuario válido.';
  END IF;

  IF v_portal_role IS NOT NULL AND v_portal_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'El acceso al portal debe ser Admin o Super admin.';
  END IF;

  IF v_workflow_role IS NOT NULL AND v_workflow_role NOT IN (
    'admin_educacion', 'admin_presupuesto', 'admin_contabilidad',
    'admin_pagos', 'admin_visualizacion'
  ) THEN
    RAISE EXCEPTION 'El rol operativo seleccionado no es válido.';
  END IF;

  IF v_workflow_role IS NOT NULL AND v_portal_role IS NULL THEN
    RAISE EXCEPTION 'Activa el acceso al portal para asignar un rol operativo.';
  END IF;

  IF length(COALESCE(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'La nota de auditoría no puede superar 500 caracteres.';
  END IF;

  LOCK TABLE public.portal_admin_users IN SHARE ROW EXCLUSIVE MODE;

  IF NOT public.is_portal_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo un super administrador puede gestionar usuarios y roles.';
  END IF;

  SELECT * INTO v_user
  FROM auth.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario seleccionado ya no existe.';
  END IF;

  SELECT * INTO v_admin
  FROM public.portal_admin_users
  WHERE user_id = p_target_user_id
  FOR UPDATE;
  v_has_admin := FOUND;

  IF p_target_user_id = v_actor AND v_portal_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'No puedes quitarte ni reducir tu propio acceso de super administrador.';
  END IF;

  IF v_has_admin AND v_admin.role = 'super_admin' AND v_admin.is_active
    AND v_portal_role IS DISTINCT FROM 'super_admin' THEN
    SELECT count(*) INTO v_super_admin_count
    FROM public.portal_admin_users
    WHERE role = 'super_admin' AND COALESCE(is_active, true);

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'No puedes quitar el acceso al último super administrador activo.';
    END IF;
  END IF;

  SELECT roles.value INTO v_previous_workflow_role
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_user.raw_user_meta_data->'roles') = 'array'
      THEN v_user.raw_user_meta_data->'roles' ELSE '[]'::JSONB END
  ) WITH ORDINALITY AS roles(value, orden)
  WHERE roles.value = ANY(v_workflow_roles)
  ORDER BY roles.orden
  LIMIT 1;

  v_previous_workflow_role := COALESCE(
    v_previous_workflow_role,
    CASE WHEN v_user.raw_app_meta_data->>'role' = ANY(v_workflow_roles)
      THEN v_user.raw_app_meta_data->>'role' END,
    CASE WHEN v_user.raw_user_meta_data->>'role' = ANY(v_workflow_roles)
      THEN v_user.raw_user_meta_data->>'role' END
  );

  v_before := jsonb_build_object(
    'portal_access', CASE WHEN v_has_admin THEN to_jsonb(v_admin) ELSE NULL END,
    'workflow_role', v_previous_workflow_role
  );
  SELECT COALESCE(jsonb_agg(to_jsonb(roles.value) ORDER BY roles.orden), '[]'::JSONB)
  INTO v_user_roles
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_user.raw_user_meta_data->'roles') = 'array'
      THEN v_user.raw_user_meta_data->'roles' ELSE '[]'::JSONB END
  ) WITH ORDINALITY AS roles(value, orden)
  WHERE roles.value <> ALL(v_workflow_roles);

  SELECT COALESCE(jsonb_agg(to_jsonb(roles.value) ORDER BY roles.orden), '[]'::JSONB)
  INTO v_app_roles
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_user.raw_app_meta_data->'roles') = 'array'
      THEN v_user.raw_app_meta_data->'roles' ELSE '[]'::JSONB END
  ) WITH ORDINALITY AS roles(value, orden)
  WHERE roles.value <> ALL(v_workflow_roles);

  IF v_workflow_role IS NOT NULL THEN
    v_user_roles := v_user_roles || jsonb_build_array(v_workflow_role);
    v_app_roles := v_app_roles || jsonb_build_array(v_workflow_role);
  END IF;

  v_user_metadata := COALESCE(v_user.raw_user_meta_data, '{}'::JSONB);
  v_app_metadata := COALESCE(v_user.raw_app_meta_data, '{}'::JSONB);
  IF v_user_metadata->>'role' = ANY(v_workflow_roles) THEN
    v_user_metadata := v_user_metadata - 'role';
  END IF;
  IF v_app_metadata->>'role' = ANY(v_workflow_roles) THEN
    v_app_metadata := v_app_metadata - 'role';
  END IF;
  v_user_metadata := jsonb_set(v_user_metadata, '{roles}', v_user_roles, true);
  v_app_metadata := jsonb_set(v_app_metadata, '{roles}', v_app_roles, true);

  IF v_portal_role IS NULL THEN
    IF v_has_admin THEN
      UPDATE public.portal_admin_users
      SET is_active = false,
          updated_at = now(),
          deactivated_at = now(),
          deactivated_by_user_id = v_actor,
          notes = COALESCE(NULLIF(trim(p_note), ''), notes)
      WHERE user_id = p_target_user_id
      RETURNING * INTO v_admin;
    END IF;
  ELSE
    v_name := COALESCE(
      NULLIF(trim(COALESCE(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name')), ''),
      split_part(COALESCE(v_user.email, ''), '@', 1)
    );

    INSERT INTO public.portal_admin_users (
      user_id, nombre_completo, email, role, is_active, created_by_user_id,
      updated_at, deactivated_at, deactivated_by_user_id, notes
    )
    VALUES (
      p_target_user_id, v_name, lower(v_user.email), v_portal_role, true, v_actor,
      now(), NULL, NULL, NULLIF(trim(p_note), '')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET nombre_completo = COALESCE(NULLIF(EXCLUDED.nombre_completo, ''), portal_admin_users.nombre_completo),
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = true,
        updated_at = now(),
        deactivated_at = NULL,
        deactivated_by_user_id = NULL,
        notes = COALESCE(NULLIF(trim(p_note), ''), portal_admin_users.notes)
    RETURNING * INTO v_admin;
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = v_user_metadata,
      raw_app_meta_data = v_app_metadata,
      updated_at = now()
  WHERE id = p_target_user_id;

  v_after := jsonb_build_object(
    'portal_access', CASE WHEN v_portal_role IS NULL
      THEN CASE WHEN v_has_admin THEN to_jsonb(v_admin) ELSE NULL END
      ELSE to_jsonb(v_admin) END,
    'workflow_role', v_workflow_role
  );

  PERFORM public.registrar_evento_portal_admin(
    p_target_user_id, 'user_access_roles_updated', v_before, v_after, p_note, v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_target_user_id,
    'portal_role', v_portal_role,
    'portal_active', v_portal_role IS NOT NULL,
    'workflow_role', v_workflow_role
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.portal_admin_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_admin_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_admin_preferences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_sidebar_preference()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collapsed BOOLEAN;
BEGIN
  IF NOT public.is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo los administradores activos pueden consultar esta preferencia.';
  END IF;

  SELECT sidebar_collapsed INTO v_collapsed
  FROM public.portal_admin_preferences
  WHERE user_id = auth.uid();

  RETURN COALESCE(v_collapsed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_sidebar_preference(p_collapsed BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_portal_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo los administradores activos pueden cambiar esta preferencia.';
  END IF;

  IF p_collapsed IS NULL THEN
    RAISE EXCEPTION 'Indica si la barra lateral debe estar contraída.';
  END IF;

  INSERT INTO public.portal_admin_preferences (user_id, sidebar_collapsed, updated_at)
  VALUES (auth.uid(), p_collapsed, now())
  ON CONFLICT (user_id) DO UPDATE
  SET sidebar_collapsed = EXCLUDED.sidebar_collapsed, updated_at = now();

  RETURN p_collapsed;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_access(TEXT, INTEGER),
  public.admin_set_user_access(UUID, TEXT, TEXT, TEXT),
  public.admin_get_sidebar_preference(),
  public.admin_set_sidebar_preference(BOOLEAN)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_user_access(TEXT, INTEGER),
  public.admin_set_user_access(UUID, TEXT, TEXT, TEXT),
  public.admin_get_sidebar_preference(),
  public.admin_set_sidebar_preference(BOOLEAN)
TO authenticated;

NOTIFY pgrst, 'reload schema';
