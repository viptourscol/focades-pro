-- ============================================================================
-- MIGRATION: Cargue Masivo - Índices y Optimizaciones
-- DATE: 2026-10-12
-- PURPOSE: Add performance indexes and optimization views
-- ============================================================================

-- ============================================================================
-- 1. Índices adicionales para búsquedas frecuentes
-- ============================================================================

-- Índices compuestos para búsquedas comunes
CREATE INDEX IF NOT EXISTS idx_documentos_convocatoria_tipo_estado 
  ON public.portal_documentos_cargue(convocatoria_id, tipo_documento, estado);

CREATE INDEX IF NOT EXISTS idx_documentos_creado_por_tipo
  ON public.portal_documentos_cargue(creado_por, tipo_documento);

CREATE INDEX IF NOT EXISTS idx_transiciones_documento_fecha
  ON public.portal_transiciones_documento(documento_id, fecha DESC);

-- Índice para búsqueda de validaciones sin resolver
CREATE INDEX IF NOT EXISTS idx_validaciones_sin_resolver
  ON public.portal_cargue_validaciones(documento_id)
  WHERE resuelta = FALSE;

-- ============================================================================
-- 2. View: Documentos pendientes por aprobar
-- ============================================================================

CREATE OR REPLACE VIEW public.v_documentos_pendientes_aprobacion AS
SELECT
  d.id,
  d.convocatoria_id,
  d.tipo_documento,
  d.estado,
  d.version,
  d.cantidad_registros,
  d.creado_por,
  d.creado_en,
  d.editado_en,
  (
    SELECT COUNT(*) 
    FROM public.portal_cargue_validaciones 
    WHERE documento_id = d.id AND resuelta = FALSE
  ) as errores_sin_resolver,
  COALESCE(SUM(v.valor_neto), 0) as valor_total
FROM public.portal_documentos_cargue d
LEFT JOIN public.portal_valores_cargue v ON d.id = v.documento_id
WHERE d.estado = 'enviado_para_revision'
GROUP BY d.id
ORDER BY d.editado_en DESC;

-- ============================================================================
-- 3. View: Resumen de documentos por convocatoria
-- ============================================================================

CREATE OR REPLACE VIEW public.v_resumen_documentos_convocatoria AS
SELECT
  d.convocatoria_id,
  d.tipo_documento,
  d.estado,
  COUNT(*) as cantidad,
  COALESCE(SUM(v.valor_neto), 0) as valor_total,
  COUNT(DISTINCT d.creado_por) as usuarios_involucrados,
  MIN(d.creado_en) as primer_documento,
  MAX(d.editado_en) as ultima_actualizacion
FROM public.portal_documentos_cargue d
LEFT JOIN public.portal_valores_cargue v ON d.id = v.documento_id
GROUP BY d.convocatoria_id, d.tipo_documento, d.estado;

-- ============================================================================
-- 4. View: Historial de transiciones completo
-- ============================================================================

CREATE OR REPLACE VIEW public.v_historial_completo_transiciones AS
SELECT
  t.id,
  t.documento_id,
  d.tipo_documento,
  d.convocatoria_id,
  t.estado_anterior,
  t.estado_nuevo,
  t.rol_quien_transiciona,
  t.usuario_id,
  t.fecha,
  t.comentario,
  EXTRACT(EPOCH FROM (t.fecha - LAG(t.fecha) OVER (PARTITION BY t.documento_id ORDER BY t.fecha DESC))) as segundos_desde_ultima_transicion
FROM public.portal_transiciones_documento t
INNER JOIN public.portal_documentos_cargue d ON t.documento_id = d.id
ORDER BY t.documento_id, t.fecha DESC;

-- ============================================================================
-- 5. View: Documentos listos para siguiente paso
-- ============================================================================

CREATE OR REPLACE VIEW public.v_documentos_listos_siguiente_paso AS
SELECT
  d.id,
  d.convocatoria_id,
  d.tipo_documento,
  CASE
    WHEN d.tipo_documento = 'terceros' THEN 'admin_presupuesto'
    WHEN d.tipo_documento = 'rp' THEN 'admin_presupuesto'
    WHEN d.tipo_documento = 'op' THEN 'admin_contabilidad'
    WHEN d.tipo_documento = 'contabilidad' THEN 'admin_pagos'
    WHEN d.tipo_documento = 'siafe' THEN 'sistema'
  END as siguiente_rol,
  d.creado_en,
  d.editado_en,
  EXTRACT(EPOCH FROM (NOW() - d.editado_en)) / 3600 as horas_desde_ultima_edicion,
  d.cantidad_registros
FROM public.portal_documentos_cargue d
WHERE d.estado = 'aprobado'
ORDER BY d.editado_en ASC;

-- ============================================================================
-- 6. View: Valores por beneficiario en cargues
-- ============================================================================

CREATE OR REPLACE VIEW public.v_valores_beneficiarios_cargue AS
SELECT
  v.identificacion,
  v.nombre_beneficiario,
  COUNT(DISTINCT v.documento_id) as cantidad_documentos,
  SUM(v.valor_bruto) as valor_bruto_total,
  SUM(v.valor_deducciones) as valor_deducciones_total,
  SUM(v.valor_neto) as valor_neto_total,
  MAX(v.creado_en) as ultima_actualizacion,
  STRING_AGG(DISTINCT d.tipo_documento, ', ') as tipos_documentos
FROM public.portal_valores_cargue v
INNER JOIN public.portal_documentos_cargue d ON v.documento_id = d.id
GROUP BY v.identificacion, v.nombre_beneficiario
ORDER BY v.valor_neto_total DESC;

-- ============================================================================
-- 7. View: Análisis de validaciones
-- ============================================================================

CREATE OR REPLACE VIEW public.v_analisis_validaciones AS
SELECT
  d.tipo_documento,
  d.convocatoria_id,
  v.tipo_error,
  COUNT(*) as cantidad_errores,
  COUNT(*) FILTER (WHERE v.resuelta = TRUE) as errores_resueltos,
  COUNT(*) FILTER (WHERE v.resuelta = FALSE) as errores_pendientes,
  ROUND(
    (COUNT(*) FILTER (WHERE v.resuelta = TRUE)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2
  ) as porcentaje_resuelto
FROM public.portal_cargue_validaciones v
INNER JOIN public.portal_documentos_cargue d ON v.documento_id = d.id
GROUP BY d.tipo_documento, d.convocatoria_id, v.tipo_error
ORDER BY d.tipo_documento, cantidad_errores DESC;

-- ============================================================================
-- 8. Permisos en views
-- ============================================================================

GRANT SELECT ON public.v_documentos_pendientes_aprobacion TO authenticated;
GRANT SELECT ON public.v_resumen_documentos_convocatoria TO authenticated;
GRANT SELECT ON public.v_historial_completo_transiciones TO authenticated;
GRANT SELECT ON public.v_documentos_listos_siguiente_paso TO authenticated;
GRANT SELECT ON public.v_valores_beneficiarios_cargue TO authenticated;
GRANT SELECT ON public.v_analisis_validaciones TO authenticated;

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
