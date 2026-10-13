-- ============================================================================
-- CREAR TABLA: portal_documentos_cargue
-- ============================================================================

BEGIN;

-- Tabla principal de documentos
CREATE TABLE IF NOT EXISTS public.portal_documentos_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('terceros', 'rp', 'op', 'contabilidad', 'siafe')),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado_para_revision', 'aprobado', 'rechazado', 'finalizado')),
  version INTEGER NOT NULL DEFAULT 1,
  cantidad_registros INTEGER DEFAULT 0,
  creado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  editado_por UUID,
  editado_en TIMESTAMP WITH TIME ZONE,
  aprobado_por UUID,
  aprobado_en TIMESTAMP WITH TIME ZONE,
  comentarios_rechazo TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_documentos_convocatoria ON public.portal_documentos_cargue(convocatoria_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON public.portal_documentos_cargue(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_estado ON public.portal_documentos_cargue(estado);
CREATE INDEX IF NOT EXISTS idx_documentos_creado_por ON public.portal_documentos_cargue(creado_por);
CREATE INDEX IF NOT EXISTS idx_documentos_creado_en ON public.portal_documentos_cargue(creado_en);
CREATE INDEX IF NOT EXISTS idx_documentos_convocatoria_tipo_estado ON public.portal_documentos_cargue(convocatoria_id, tipo_documento, estado);

-- Tabla de valores/filas de documentos
CREATE TABLE IF NOT EXISTS public.portal_valores_cargue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  numero_fila INTEGER NOT NULL,
  datos JSONB NOT NULL,
  estado_validacion TEXT DEFAULT 'pendiente' CHECK (estado_validacion IN ('pendiente', 'validado', 'error')),
  errores JSONB DEFAULT '[]'::jsonb,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  editado_en TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_valores_documento ON public.portal_valores_cargue(documento_id);
CREATE INDEX IF NOT EXISTS idx_valores_numero_fila ON public.portal_valores_cargue(documento_id, numero_fila);

-- Tabla de transiciones de estado
CREATE TABLE IF NOT EXISTS public.portal_transiciones_documento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  razon TEXT,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transiciones_documento ON public.portal_transiciones_documento(documento_id);

-- Tabla de validaciones
CREATE TABLE IF NOT EXISTS public.portal_cargue_validaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.portal_documentos_cargue(id) ON DELETE CASCADE,
  tipo_error TEXT NOT NULL,
  descripcion TEXT,
  numero_fila INTEGER,
  campo_error TEXT,
  valor_erroneo TEXT,
  sugerencia TEXT,
  creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validaciones_documento ON public.portal_cargue_validaciones(documento_id);
CREATE INDEX IF NOT EXISTS idx_validaciones_tipo_error ON public.portal_cargue_validaciones(tipo_error);

-- Habilitar RLS
ALTER TABLE public.portal_documentos_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_valores_cargue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_transiciones_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_cargue_validaciones ENABLE ROW LEVEL SECURITY;

-- Política simple: usuarios autenticados pueden ver todo
CREATE POLICY "authenticated_view_all" ON public.portal_documentos_cargue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_view_valores" ON public.portal_valores_cargue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_view_transiciones" ON public.portal_transiciones_documento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_view_validaciones" ON public.portal_cargue_validaciones
  FOR SELECT TO authenticated USING (true);

-- Políticas de inserción/actualización básicas
CREATE POLICY "authenticated_insert_documentos" ON public.portal_documentos_cargue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creado_por);

CREATE POLICY "authenticated_update_documentos" ON public.portal_documentos_cargue
  FOR UPDATE TO authenticated USING (auth.uid() = creado_por OR auth.uid() = editado_por);

COMMIT;
