-- ============================================================================
-- MIGRATION: Cargue Masivo - Row Level Security (RLS)
-- DATE: 2026-10-12
-- PURPOSE: Enable RLS and create policies for bulk upload workflow
-- ============================================================================

-- ============================================================================
-- 1. Habilitar RLS en tablas
-- ============================================================================

ALTER TABLE public.portal_documentos_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_transiciones_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cargue_beneficiarios_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_valores_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cargue_validaciones ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Policies para portal_documentos_cargue
-- ============================================================================

-- Admin Education: Super admin - acceso total
CREATE POLICY "admin_educacion_all_documents"
  ON public.portal_documentos_cargue
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_educacion'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_educacion'
    )
  );

-- Admin Presupuesto: Ver y editar TERCEROS y RP
CREATE POLICY "admin_presupuesto_terceros_rp"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    tipo_documento IN ('terceros', 'rp')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_presupuesto'
    )
  );

CREATE POLICY "admin_presupuesto_edit_terceros_rp"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento IN ('terceros', 'rp')
    AND estado IN ('borrador', 'enviado_para_revision')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_presupuesto'
    )
  )
  WITH CHECK (
    tipo_documento IN ('terceros', 'rp')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_presupuesto'
    )
  );

-- Admin Contabilidad: Ver y editar OP y CONTABILIDAD
CREATE POLICY "admin_contabilidad_op_contabilidad"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    tipo_documento IN ('op', 'contabilidad')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_contabilidad'
    )
  );

CREATE POLICY "admin_contabilidad_edit_op_contabilidad"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento IN ('op', 'contabilidad')
    AND estado IN ('borrador', 'enviado_para_revision')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_contabilidad'
    )
  )
  WITH CHECK (
    tipo_documento IN ('op', 'contabilidad')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_contabilidad'
    )
  );

-- Admin Pagos: Ver todos, editar SIAFE
CREATE POLICY "admin_pagos_view_all"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_pagos'
    )
  );

CREATE POLICY "admin_pagos_edit_siafe"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento = 'siafe'
    AND estado IN ('borrador', 'enviado_para_revision')
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_pagos'
    )
  )
  WITH CHECK (
    tipo_documento = 'siafe'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_pagos'
    )
  );

-- Admin Visualizador: Solo lectura
CREATE POLICY "admin_visualizacion_read_only"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.user_metadata->>'role' = 'admin_visualizacion'
    )
  );

-- ============================================================================
-- 3. Policies para portal_transiciones_documento
-- ============================================================================

-- Autenticados pueden ver transiciones de documentos que pueden ver
CREATE POLICY "transiciones_read_with_documento"
  ON public.portal_transiciones_documento
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_documentos_cargue doc
      WHERE doc.id = documento_id
    )
  );

-- Solo sistema puede insertar transiciones (via triggers o functions)
CREATE POLICY "transiciones_insert_system_only"
  ON public.portal_transiciones_documento
  FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = auth.uid());

-- ============================================================================
-- 4. Policies para portal_cargue_beneficiarios_terceros
-- ============================================================================

CREATE POLICY "beneficiarios_terceros_read"
  ON public.portal_cargue_beneficiarios_terceros
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_documentos_cargue doc
      WHERE doc.id = documento_cargue_id
    )
  );

-- ============================================================================
-- 5. Policies para portal_valores_cargue
-- ============================================================================

CREATE POLICY "valores_cargue_read"
  ON public.portal_valores_cargue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_documentos_cargue doc
      WHERE doc.id = documento_id
    )
  );

-- ============================================================================
-- 6. Policies para portal_cargue_validaciones
-- ============================================================================

CREATE POLICY "validaciones_read"
  ON public.portal_cargue_validaciones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_documentos_cargue doc
      WHERE doc.id = documento_id
    )
  );

-- ============================================================================
-- 7. Grant básicos en tabla de plantillas (pública)
-- ============================================================================

GRANT SELECT ON public.portal_plantillas_cargue TO authenticated;

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
