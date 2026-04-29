-- Migration: RPCs para validaci\u00f3n y clasificaci\u00f3n de beneficiarios hist\u00f3ricos
-- Fecha: 2026-03-18
-- Descripci\u00f3n: Crear funciones RPC para validar datos, clasificar beneficiarios y calcular estad\u00edsticas

-- ===== 1. RPC: Validar estructura de datos de lote =====
CREATE OR REPLACE FUNCTION public.validate_historicos_batch(
  p_lote_data jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_errores text[] := ARRAY[]::text[];
  v_advertencias text[] := ARRAY[]::text[];
  v_beneficiarios jsonb;
  v_beneficiario jsonb;
  v_idx integer;
BEGIN
  -- Validar estructura b\u00e1sica
  IF p_lote_data IS NULL THEN
    v_errores := array_append(v_errores, 'Datos de lote no pueden ser nulos');
    RETURN jsonb_build_object(
      'valido', false,
      'errores', v_errores,
      'advertencias', v_advertencias,
      'total_validado', 0
    );
  END IF;
  
  -- Validar que sea array de beneficiarios
  IF NOT (p_lote_data @> '[]'::jsonb) THEN
    v_errores := array_append(v_errores, 'Datos debe ser un array de beneficiarios');
    RETURN jsonb_build_object(
      'valido', false,
      'errores', v_errores,
      'advertencias', v_advertencias,
      'total_validado', 0
    );
  END IF;
  
  v_beneficiarios := p_lote_data;
  v_idx := 0;
  
  -- Validar cada registro
  FOR v_beneficiario IN SELECT jsonb_array_elements(v_beneficiarios)
  LOOP
    v_idx := v_idx + 1;
    
    -- Campos obligatorios
    IF (v_beneficiario->>'nombre') IS NULL OR length(trim(v_beneficiario->>'nombre')) = 0 THEN
      v_errores := array_append(v_errores, 'Fila ' || v_idx || ': nombre es obligatorio');
    END IF;
    
    IF (v_beneficiario->>'cedula') IS NULL OR length(trim(v_beneficiario->>'cedula')) = 0 THEN
      v_errores := array_append(v_errores, 'Fila ' || v_idx || ': c\u00e9dula es obligatoria');
    END IF;
    
    IF (v_beneficiario->>'correo') IS NULL OR length(trim(v_beneficiario->>'correo')) = 0 THEN
      v_errores := array_append(v_errores, 'Fila ' || v_idx || ': correo es obligatorio');
    ELSIF NOT (v_beneficiario->>'correo' ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN
      v_advertencias := array_append(v_advertencias, 'Fila ' || v_idx || ': correo formato dudoso: ' || (v_beneficiario->>'correo'));
    END IF;
    
    -- Validar c\u00e9dula formato (si es colombiana esperamos XX.XXX.XXX o similar)
    IF (v_beneficiario->>'cedula') IS NOT NULL AND NOT (v_beneficiario->>'cedula' ~ '^[0-9]{6,15}$') THEN
      v_advertencias := array_append(v_advertencias, 'Fila ' || v_idx || ': c\u00e9dula con formato no est\u00e1ndar: ' || (v_beneficiario->>'cedula'));
    END IF;
    
    -- L\u00edmite de registros por validaci\u00f3n (de seguridad)
    IF v_idx > 10000 THEN
      v_errores := array_append(v_errores, 'L\u00edmite m\u00e1ximo de 10000 registros excedido');
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'valido', array_length(v_errores, 1) IS NULL OR array_length(v_errores, 1) = 0,
    'errores', v_errores,
    'advertencias', v_advertencias,
    'total_validado', v_idx
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== 2. RPC: Clasificar beneficiarios para activaci\u00f3n =====
CREATE OR REPLACE FUNCTION public.beneficiarios_para_activar()
RETURNS TABLE (
  beneficiario_id bigint,
  nombre text,
  cedula text,
  correo text,
  correo_es_valido boolean,
  auth_user_id uuid,
  ya_existe_en_portal boolean,
  clasificacion text, -- 'activo_confiable', 'correo_dudoso', 'sin_correo', 'ya_portal'
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
      WHEN pb.email IS NULL OR length(trim(pb.email)) = 0 THEN ARRAY['Obtener correo de contacto', 'Actualizaci\u00f3n manual requerida']
      WHEN NOT (pb.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN ARRAY['Validar correo con el beneficiario', 'Considerar contacto alternativo']
      ELSE ARRAY['Enviar invitaci\u00f3n', 'Esperar confirmaci\u00f3n de activaci\u00f3n']
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

-- ===== 3. RPC: Estad\u00edsticas de lote =====
CREATE OR REPLACE FUNCTION public.lote_estadisticas(
  p_lote_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'lote_id', pml.id,
    'titulo', pml.titulo,
    'estado', pml.estado,
    'cantidad_registros', pml.cantidad_registros,
    'cantidad_documentos', pml.cantidad_documentos,
    'cantidad_beneficiarios_vinculados', (
      SELECT COUNT(*) FROM public.portal_beneficiarios 
      WHERE pertenece_lote_id = pml.id
    ),
    'cantidad_documentos_cargados', (
      SELECT COUNT(*) FROM public.portal_beneficiario_documentos_historicos 
      WHERE lote_id = pml.id
    ),
    'tamanio_total_documentos', (
      SELECT COALESCE(SUM(archivo_size_bytes), 0) FROM public.portal_beneficiario_documentos_historicos 
      WHERE lote_id = pml.id
    ),
    'validacion_timestamp', pml.validacion_timestamp,
    'carga_timestamp', pml.carga_timestamp,
    'activacion_timestamp', pml.activacion_timestamp,
    'validacion_resultado', pml.validacion_resultado,
    'carga_resultado', pml.carga_resultado,
    'activacion_resultado', pml.activacion_resultado
  ) INTO v_stats
  FROM public.portal_migracion_lotes pml
  WHERE pml.id = p_lote_id;
  
  IF v_stats IS NULL THEN
    RETURN jsonb_build_object('error', 'Lote no encontrado');
  END IF;
  
  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== 4. RPC: Obtener beneficiarios clasificados por lote =====
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

-- ===== 5. RPC: Crear nuevo lote de migraci\u00f3n =====
CREATE OR REPLACE FUNCTION public.crear_lote_migracion(
  p_titulo text,
  p_descripcion text,
  p_cantidad_registros integer,
  p_archivo_nombre text DEFAULT NULL,
  p_archivo_size_bytes integer DEFAULT NULL,
  p_checksum_md5 text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_lote_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No autorizado: usuario no autenticado');
  END IF;
  
  -- Verificar que sea admin
  IF NOT EXISTS (SELECT 1 FROM public.portal_admin_users WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('error', 'No autorizado: usuario no es administrador');
  END IF;
  
  -- Validar par\u00e1metros
  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
    RETURN jsonb_build_object('error', 'T\u00edtulo del lote es obligatorio');
  END IF;
  
  IF p_cantidad_registros IS NULL OR p_cantidad_registros <= 0 THEN
    RETURN jsonb_build_object('error', 'Cantidad de registros debe ser > 0');
  END IF;
  
  -- Crear lote
  INSERT INTO public.portal_migracion_lotes (
    titulo, descripcion, cantidad_registros, 
    archivo_nombre, archivo_size_bytes, checksum_md5,
    created_by_user_id, estado
  )
  VALUES (
    trim(p_titulo), p_descripcion, p_cantidad_registros,
    p_archivo_nombre, p_archivo_size_bytes, p_checksum_md5,
    v_user_id, 'en_preparacion'
  )
  RETURNING id INTO v_lote_id;
  
  RETURN jsonb_build_object(
    'exito', true,
    'lote_id', v_lote_id,
    'titulo', p_titulo,
    'estado', 'en_preparacion',
    'created_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== Fin migration =====
