-- ============================================================================
-- MIGRATION: Cargue Masivo - Functions y Triggers
-- DATE: 2026-10-12
-- PURPOSE: Helper functions and triggers for workflow automation
-- ============================================================================

-- ============================================================================
-- 1. Función para registrar transición de estado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_registrar_transicion_documento(
  p_documento_id UUID,
  p_estado_nuevo VARCHAR(50),
  p_rol VARCHAR(50),
  p_comentario TEXT DEFAULT NULL,
  p_datos_cambio JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_anterior VARCHAR(50);
  v_transicion_id UUID;
BEGIN
  -- Obtener estado anterior
  SELECT estado INTO v_estado_anterior
  FROM public.portal_documentos_cargue
  WHERE id = p_documento_id;

  -- Crear registro de transición
  INSERT INTO public.portal_transiciones_documento (
    documento_id,
    estado_anterior,
    estado_nuevo,
    rol_quien_transiciona,
    usuario_id,
    comentario,
    datos_cambio
  )
  VALUES (
    p_documento_id,
    v_estado_anterior,
    p_estado_nuevo,
    p_rol,
    auth.uid(),
    p_comentario,
    p_datos_cambio
  )
  RETURNING id INTO v_transicion_id;

  -- Actualizar estado en documento
  UPDATE public.portal_documentos_cargue
  SET
    estado = p_estado_nuevo,
    editado_por = auth.uid(),
    editado_en = TIMEZONE('utc'::text, NOW())
  WHERE id = p_documento_id;

  RETURN v_transicion_id;
END;
$$;

-- ============================================================================
-- 2. Función para crear nuevo documento de cargue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_crear_documento_cargue(
  p_convocatoria_id INTEGER,
  p_tipo_documento VARCHAR(50),
  p_cantidad_registros INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_documento_id UUID;
BEGIN
  INSERT INTO public.portal_documentos_cargue (
    convocatoria_id,
    tipo_documento,
    estado,
    cantidad_registros,
    creado_por
  )
  VALUES (
    p_convocatoria_id,
    p_tipo_documento,
    'borrador',
    p_cantidad_registros,
    auth.uid()
  )
  RETURNING id INTO v_documento_id;

  -- Registrar transición inicial
  PERFORM public.fn_registrar_transicion_documento(
    v_documento_id,
    'borrador',
    'sistema',
    'Documento creado'
  );

  RETURN v_documento_id;
END;
$$;

-- ============================================================================
-- 3. Función para obtener documento por ID (con verificación de acceso)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_obtener_documento_cargue(
  p_documento_id UUID
)
RETURNS TABLE (
  id UUID,
  convocatoria_id INTEGER,
  tipo_documento VARCHAR,
  estado VARCHAR,
  version INTEGER,
  cantidad_registros INTEGER,
  creado_por UUID,
  creado_en TIMESTAMP WITH TIME ZONE,
  editado_por UUID,
  editado_en TIMESTAMP WITH TIME ZONE,
  aprobado_por UUID,
  aprobado_en TIMESTAMP WITH TIME ZONE,
  acceso_permitido BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.convocatoria_id,
    d.tipo_documento,
    d.estado,
    d.version,
    d.cantidad_registros,
    d.creado_por,
    d.creado_en,
    d.editado_por,
    d.editado_en,
    d.aprobado_por,
    d.aprobado_en,
    (
      auth.jwt() ->> 'role' = 'admin_educacion'
      OR (auth.jwt() ->> 'role' = 'admin_presupuesto' AND d.tipo_documento IN ('terceros', 'rp'))
      OR (auth.jwt() ->> 'role' = 'admin_contabilidad' AND d.tipo_documento IN ('op', 'contabilidad'))
      OR (auth.jwt() ->> 'role' = 'admin_pagos')
      OR (auth.jwt() ->> 'role' = 'admin_visualizacion')
    ) as acceso_permitido
  FROM public.portal_documentos_cargue d
  WHERE d.id = p_documento_id;
END;
$$;

-- ============================================================================
-- 4. Función para contar registros por estado y rol
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_contar_documentos_por_rol(
  p_rol VARCHAR(50)
)
RETURNS TABLE (
  tipo_documento VARCHAR,
  total INTEGER,
  borrador INTEGER,
  enviado_para_revision INTEGER,
  aprobado INTEGER,
  rechazado INTEGER,
  finalizado INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(d.tipo_documento, '') as tipo_documento,
    COUNT(*) FILTER (WHERE TRUE)::INTEGER as total,
    COUNT(*) FILTER (WHERE d.estado = 'borrador')::INTEGER as borrador,
    COUNT(*) FILTER (WHERE d.estado = 'enviado_para_revision')::INTEGER as enviado_para_revision,
    COUNT(*) FILTER (WHERE d.estado = 'aprobado')::INTEGER as aprobado,
    COUNT(*) FILTER (WHERE d.estado = 'rechazado')::INTEGER as rechazado,
    COUNT(*) FILTER (WHERE d.estado = 'finalizado')::INTEGER as finalizado
  FROM public.portal_documentos_cargue d
  WHERE
    CASE
      WHEN p_rol = 'admin_educacion' THEN TRUE
      WHEN p_rol = 'admin_presupuesto' THEN d.tipo_documento IN ('terceros', 'rp')
      WHEN p_rol = 'admin_contabilidad' THEN d.tipo_documento IN ('op', 'contabilidad')
      WHEN p_rol = 'admin_pagos' THEN TRUE
      WHEN p_rol = 'admin_visualizacion' THEN TRUE
      ELSE FALSE
    END
  GROUP BY d.tipo_documento;
END;
$$;

-- ============================================================================
-- 5. Trigger para actualizar updated_at en portal_plantillas_cargue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_actualizar_updated_at_plantillas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plantillas_updated_at
  BEFORE UPDATE ON public.portal_plantillas_cargue
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actualizar_updated_at_plantillas();

-- ============================================================================
-- 6. Función para listar transiciones de un documento
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_listar_transiciones_documento(
  p_documento_id UUID
)
RETURNS TABLE (
  id UUID,
  estado_anterior VARCHAR,
  estado_nuevo VARCHAR,
  rol_quien_transiciona VARCHAR,
  usuario_id UUID,
  fecha TIMESTAMP WITH TIME ZONE,
  comentario TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.estado_anterior,
    t.estado_nuevo,
    t.rol_quien_transiciona,
    t.usuario_id,
    t.fecha,
    t.comentario
  FROM public.portal_transiciones_documento t
  WHERE t.documento_id = p_documento_id
  ORDER BY t.fecha DESC;
END;
$$;

-- ============================================================================
-- 7. Función para validar si documento puede cambiar de estado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_puede_cambiar_estado(
  p_documento_id UUID,
  p_rol_usuario VARCHAR(50),
  p_estado_nuevo VARCHAR(50)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tipo_documento VARCHAR(50);
  v_estado_actual VARCHAR(50);
  v_puede_cambiar BOOLEAN := FALSE;
BEGIN
  -- Obtener tipo y estado actual
  SELECT tipo_documento, estado
  INTO v_tipo_documento, v_estado_actual
  FROM public.portal_documentos_cargue
  WHERE id = p_documento_id;

  -- Verificar permisos por rol y tipo de documento
  CASE
    WHEN p_rol_usuario = 'admin_educacion' THEN
      v_puede_cambiar := TRUE;
    
    WHEN p_rol_usuario = 'admin_presupuesto' AND v_tipo_documento IN ('terceros', 'rp') THEN
      v_puede_cambiar := v_estado_actual IN ('borrador', 'enviado_para_revision', 'rechazado');
    
    WHEN p_rol_usuario = 'admin_contabilidad' AND v_tipo_documento IN ('op', 'contabilidad') THEN
      v_puede_cambiar := v_estado_actual IN ('borrador', 'enviado_para_revision', 'rechazado');
    
    WHEN p_rol_usuario = 'admin_pagos' AND v_tipo_documento = 'siafe' THEN
      v_puede_cambiar := v_estado_actual IN ('borrador', 'enviado_para_revision', 'rechazado');
    
    WHEN p_rol_usuario = 'admin_pagos' THEN
      v_puede_cambiar := p_estado_nuevo IN ('aprobado', 'rechazado', 'finalizado');
  END CASE;

  RETURN v_puede_cambiar;
END;
$$;

-- ============================================================================
-- 8. Función para obtener resumen de cargue por convocatoria
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_resumen_cargue_convocatoria(
  p_convocatoria_id INTEGER
)
RETURNS TABLE (
  tipo_documento VARCHAR,
  total_documentos INTEGER,
  documentos_finalizados INTEGER,
  documentos_pendientes INTEGER,
  valor_total_procesado NUMERIC,
  cantidad_beneficiarios INTEGER,
  fecha_ultima_actualizacion TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.tipo_documento,
    COUNT(*)::INTEGER as total_documentos,
    COUNT(*) FILTER (WHERE d.estado = 'finalizado')::INTEGER as documentos_finalizados,
    COUNT(*) FILTER (WHERE d.estado NOT IN ('aprobado', 'finalizado'))::INTEGER as documentos_pendientes,
    COALESCE(SUM(v.valor_neto), 0)::NUMERIC as valor_total_procesado,
    COUNT(DISTINCT cb.beneficiario_id)::INTEGER as cantidad_beneficiarios,
    MAX(d.editado_en)::TIMESTAMP WITH TIME ZONE as fecha_ultima_actualizacion
  FROM public.portal_documentos_cargue d
  LEFT JOIN public.portal_valores_cargue v ON d.id = v.documento_id
  LEFT JOIN public.portal_cargue_beneficiarios_terceros cb ON d.id = cb.documento_cargue_id
  WHERE d.convocatoria_id = p_convocatoria_id
  GROUP BY d.tipo_documento;
END;
$$;

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
