-- ============================================================================
-- MIGRATION: Cargue Masivo - Row Level Security (RLS)
-- PURPOSE: Enable RLS and create policies for bulk upload workflow
-- ============================================================================

-- ============================================================================
-- 0. Helper: el usuario autenticado tiene el rol en user_metadata.roles (array)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tiene_rol(p_rol TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.raw_user_meta_data->'roles' @> jsonb_build_array(p_rol)
       FROM auth.users u
      WHERE u.id = auth.uid()),
    FALSE
  );
$$;

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

-- Admin Educacion: acceso total
CREATE POLICY "admin_educacion_all_documents"
  ON public.portal_documentos_cargue
  FOR ALL
  TO authenticated
  USING (public.fn_tiene_rol('admin_educacion'))
  WITH CHECK (public.fn_tiene_rol('admin_educacion'));

-- Admin Presupuesto: ver y editar TERCEROS y RP
CREATE POLICY "admin_presupuesto_terceros_rp"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    tipo_documento IN ('terceros', 'rp')
    AND public.fn_tiene_rol('admin_presupuesto')
  );

CREATE POLICY "admin_presupuesto_edit_terceros_rp"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento IN ('terceros', 'rp')
    AND estado IN ('borrador', 'enviado_para_revision')
    AND public.fn_tiene_rol('admin_presupuesto')
  )
  WITH CHECK (
    tipo_documento IN ('terceros', 'rp')
    AND public.fn_tiene_rol('admin_presupuesto')
  );

-- Admin Contabilidad: ver y editar OP y CONTABILIDAD
CREATE POLICY "admin_contabilidad_op_contabilidad"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (
    tipo_documento IN ('op', 'contabilidad')
    AND public.fn_tiene_rol('admin_contabilidad')
  );

CREATE POLICY "admin_contabilidad_edit_op_contabilidad"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento IN ('op', 'contabilidad')
    AND estado IN ('borrador', 'enviado_para_revision')
    AND public.fn_tiene_rol('admin_contabilidad')
  )
  WITH CHECK (
    tipo_documento IN ('op', 'contabilidad')
    AND public.fn_tiene_rol('admin_contabilidad')
  );

-- Admin Pagos: ver todos, editar SIAFE
CREATE POLICY "admin_pagos_view_all"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (public.fn_tiene_rol('admin_pagos'));

CREATE POLICY "admin_pagos_edit_siafe"
  ON public.portal_documentos_cargue
  FOR UPDATE
  TO authenticated
  USING (
    tipo_documento = 'siafe'
    AND estado IN ('borrador', 'enviado_para_revision')
    AND public.fn_tiene_rol('admin_pagos')
  )
  WITH CHECK (
    tipo_documento = 'siafe'
    AND public.fn_tiene_rol('admin_pagos')
  );

-- Admin Visualizacion: solo lectura
CREATE POLICY "admin_visualizacion_read_only"
  ON public.portal_documentos_cargue
  FOR SELECT
  TO authenticated
  USING (public.fn_tiene_rol('admin_visualizacion'));

-- ============================================================================
-- 3. Policies para portal_transiciones_documento
-- ============================================================================

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
-- 7. Grant basicos en tabla de plantillas (publica)
-- ============================================================================

GRANT SELECT ON public.portal_plantillas_cargue TO authenticated;
