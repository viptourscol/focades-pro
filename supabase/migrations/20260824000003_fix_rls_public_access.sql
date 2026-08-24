-- =====================================================
-- Fix RLS policies for public anonymous access
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Requisitos son públicos" ON portal_requisitos_modalidad;
DROP POLICY IF EXISTS "Guía es pública" ON portal_guia_inscripcion;
DROP POLICY IF EXISTS "Documentos son públicos" ON portal_documentos_descargables;
DROP POLICY IF EXISTS "Solo admins pueden modificar requisitos" ON portal_requisitos_modalidad;
DROP POLICY IF EXISTS "Solo admins pueden modificar guía" ON portal_guia_inscripcion;
DROP POLICY IF EXISTS "Solo admins pueden modificar documentos" ON portal_documentos_descargables;

-- =====================================================
-- New policies with proper anonymous access
-- =====================================================

-- Requisitos: Public read for everyone (authenticated and anonymous)
CREATE POLICY "Public read access to requisitos"
  ON portal_requisitos_modalidad
  FOR SELECT
  USING (activo = true);

-- Requisitos: Admin write access
CREATE POLICY "Admin write access to requisitos"
  ON portal_requisitos_modalidad
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Guía: Public read for everyone
CREATE POLICY "Public read access to guia"
  ON portal_guia_inscripcion
  FOR SELECT
  USING (activo = true);

-- Guía: Admin write access
CREATE POLICY "Admin write access to guia"
  ON portal_guia_inscripcion
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Documentos: Public read for everyone
CREATE POLICY "Public read access to documentos"
  ON portal_documentos_descargables
  FOR SELECT
  USING (activo = true);

-- Documentos: Admin write access (including update descargas counter)
CREATE POLICY "Admin write access to documentos"
  ON portal_documentos_descargables
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Allow anonymous users to update download counter
CREATE POLICY "Public can update download counter"
  ON portal_documentos_descargables
  FOR UPDATE
  USING (activo = true)
  WITH CHECK (activo = true);

-- Comentarios
COMMENT ON POLICY "Public read access to requisitos" ON portal_requisitos_modalidad IS 'Permite lectura pública sin autenticación de requisitos activos';
COMMENT ON POLICY "Public read access to guia" ON portal_guia_inscripcion IS 'Permite lectura pública sin autenticación de pasos de guía activos';
COMMENT ON POLICY "Public read access to documentos" ON portal_documentos_descargables IS 'Permite lectura pública sin autenticación de documentos activos';
COMMENT ON POLICY "Public can update download counter" ON portal_documentos_descargables IS 'Permite a usuarios anónimos incrementar el contador de descargas';

-- Finalización
DO $$
BEGIN
  RAISE NOTICE 'Políticas RLS actualizadas para permitir acceso público anónimo';
END $$;
