-- ============================================================================
-- MIGRATION: Agregar columnas a portal_valores_cargue para precarga de RP
-- DATE: 2026-11-12
-- PURPOSE: Agregar campos de contacto: tipo_identificacion, email, telefono, direccion, ciudad
-- ============================================================================

ALTER TABLE public.portal_valores_cargue
ADD COLUMN IF NOT EXISTS tipo_identificacion VARCHAR(10),
ADD COLUMN IF NOT EXISTS email VARCHAR(100),
ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
ADD COLUMN IF NOT EXISTS direccion VARCHAR(255),
ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100);

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_portal_valores_cargue_email 
ON public.portal_valores_cargue(email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_valores_cargue_identificacion_tipo
ON public.portal_valores_cargue(identificacion, tipo_identificacion);

-- Comentarios a nivel de columna para documentación
COMMENT ON COLUMN public.portal_valores_cargue.tipo_identificacion IS 'Tipo de documento del beneficiario (CC, TI, CC, etc)';
COMMENT ON COLUMN public.portal_valores_cargue.email IS 'Correo electrónico del beneficiario';
COMMENT ON COLUMN public.portal_valores_cargue.telefono IS 'Número de teléfono del beneficiario';
COMMENT ON COLUMN public.portal_valores_cargue.direccion IS 'Dirección de residencia del beneficiario';
COMMENT ON COLUMN public.portal_valores_cargue.ciudad IS 'Ciudad de residencia del beneficiario';

-- Verificación
SELECT 'Migración completada: Columnas agregadas a portal_valores_cargue' as mensaje;
