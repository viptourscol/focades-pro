-- Fix: Las RPCs usaban pb.nombre, pb.cedula, pb.correo
-- La tabla portal_beneficiarios usa: nombre_completo, n_documento, email

-- ===== RPC 2: beneficiarios_para_activar =====
CREATE OR REPLACE FUNCTION public.beneficiarios_para_activar()
RETURNS TABLE (
  beneficiario_id bigint,
  nombre text,
  cedula text,
  correo text,
  correo_es_valido boolean,
  auth_user_id uuid,
  ya_existe_en_portal boolean,
  clasificacion text,
  acciones_recomendadas text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pb.id,
    pb.nombre_completo,
    pb.n_documento,
    pb.email,
    pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$',
    pb.auth_user_id,
    pb.auth_user_id IS NOT NULL,
    CASE 
      WHEN pb.auth_user_id IS NOT NULL THEN 'ya_portal'
      WHEN pb.email IS NULL OR length(trim(pb.email)) = 0 THEN 'sin_correo'
      WHEN NOT (pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN 'correo_dudoso'
      WHEN pb.email IS NOT NULL AND length(trim(pb.email)) > 0 THEN 'activo_confiable'
      ELSE 'sin_correo'
    END,
    CASE 
      WHEN pb.auth_user_id IS NOT NULL THEN ARRAY['Ya tiene cuenta', 'Verificar si puede acceder']
      WHEN pb.email IS NULL OR length(trim(pb.email)) = 0 THEN ARRAY['Obtener correo de contacto', 'Actualización manual requerida']
      WHEN NOT (pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN ARRAY['Validar correo con el beneficiario', 'Considerar contacto alternativo']
      ELSE ARRAY['Enviar invitación', 'Esperar confirmación de activación']
    END
  FROM public.portal_beneficiarios pb
  WHERE pb.estado_beneficiario IN ('activo', 'pausado')
  ORDER BY 
    CASE 
      WHEN pb.auth_user_id IS NOT NULL THEN 4
      WHEN pb.email IS NULL OR length(trim(pb.email)) = 0 THEN 3
      WHEN NOT (pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN 2
      ELSE 1
    END,
    pb.nombre_completo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== RPC 4: beneficiarios_lote_clasificados =====
CREATE OR REPLACE FUNCTION public.beneficiarios_lote_clasificados(
  p_lote_id uuid
)
RETURNS TABLE (
  clasificacion text,
  cantidad integer,
  beneficiarios jsonb[]
) AS $$
BEGIN
  RETURN QUERY
  WITH clasificados AS (
    SELECT 
      pb.id,
      pb.nombre_completo,
      pb.n_documento,
      pb.email,
      pb.auth_user_id,
      CASE 
        WHEN pb.auth_user_id IS NOT NULL THEN 'ya_portal'
        WHEN pb.email IS NULL OR length(trim(pb.email)) = 0 THEN 'sin_correo'
        WHEN NOT (pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN 'correo_dudoso'
        ELSE 'activo_confiable'
      END as clase
    FROM public.portal_beneficiarios pb
    WHERE pb.pertenece_lote_id = p_lote_id
  )
  SELECT 
    c.clase,
    CAST(COUNT(*) AS integer),
    ARRAY_AGG(
      jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre_completo,
        'cedula', c.n_documento,
        'correo', c.email,
        'auth_user_id', c.auth_user_id
      ) ORDER BY c.nombre_completo
    )
  FROM clasificados c
  GROUP BY c.clase
  ORDER BY 
    CASE c.clase
      WHEN 'activo_confiable' THEN 1
      WHEN 'correo_dudoso' THEN 2
      WHEN 'sin_correo' THEN 3
      WHEN 'ya_portal' THEN 4
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
