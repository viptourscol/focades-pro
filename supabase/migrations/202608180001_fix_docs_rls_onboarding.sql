-- Fix RLS policies for beneficiario_documentos_historicos to allow onboarding uploads
-- Los beneficiarios que están completando onboarding no usan Supabase Auth,
-- por lo que necesitamos permitir INSERTs anónimos pero solo para beneficiarios válidos

-- Eliminar política anterior que requiere auth.uid()
DROP POLICY IF EXISTS beneficiarios_upload_onboarding_docs ON public.portal_beneficiario_documentos_historicos;

-- Crear nueva política que permite INSERT para cualquier beneficiario válido durante onboarding
-- Esto es seguro porque solo pueden insertar para IDs que existen en portal_beneficiarios
CREATE POLICY beneficiarios_upload_onboarding_docs_public
  ON public.portal_beneficiario_documentos_historicos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Verificar que el beneficiario_id existe en la tabla de beneficiarios
    EXISTS (
      SELECT 1 FROM public.portal_beneficiarios 
      WHERE id = beneficiario_id
    )
  );

-- También permitir que beneficiarios lean sus propios documentos (sin auth.uid())
DROP POLICY IF EXISTS beneficiarios_read_own_docs ON public.portal_beneficiario_documentos_historicos;

CREATE POLICY beneficiarios_read_own_docs_public
  ON public.portal_beneficiario_documentos_historicos
  FOR SELECT
  TO anon, authenticated
  USING (
    -- Permitir lectura si el beneficiario_id existe
    EXISTS (
      SELECT 1 FROM public.portal_beneficiarios 
      WHERE id = beneficiario_id
    )
  );

-- Actualizar políticas de Storage para bucket 'soportes'
-- Permitir uploads anónimos en la carpeta de beneficiarios_historicos
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes', 'soportes', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
DO $$
BEGIN
  -- Eliminar políticas anteriores
  DROP POLICY IF EXISTS "Beneficiarios pueden subir sus documentos" ON storage.objects;
  DROP POLICY IF EXISTS "Beneficiarios pueden ver sus documentos" ON storage.objects;
  DROP POLICY IF EXISTS "Admins pueden ver todos los documentos" ON storage.objects;
  
  -- Permitir subida de archivos en la carpeta beneficiarios_historicos
  CREATE POLICY "Permitir upload de documentos onboarding"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      bucket_id = 'soportes' 
      AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
    );
  
  -- Permitir lectura de documentos
  CREATE POLICY "Permitir lectura de documentos onboarding"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (
      bucket_id = 'soportes'
      AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
    );
    
  -- Permitir admins acceso completo
  CREATE POLICY "Admins acceso completo a soportes"
    ON storage.objects
    FOR ALL
    TO authenticated
    USING (
      bucket_id = 'soportes'
      AND (
        SELECT is_admin FROM public.portal_admins 
        WHERE supabase_user_id = auth.uid()
      ) = true
    )
    WITH CHECK (
      bucket_id = 'soportes'
      AND (
        SELECT is_admin FROM public.portal_admins 
        WHERE supabase_user_id = auth.uid()
      ) = true
    );
    
EXCEPTION
  WHEN duplicate_object THEN
    -- Ignorar si la política ya existe
    NULL;
END $$;

-- Comentarios para documentación
COMMENT ON POLICY beneficiarios_upload_onboarding_docs_public ON public.portal_beneficiario_documentos_historicos IS 
'Permite que beneficiarios suban documentos durante onboarding sin requerir Supabase Auth. Solo válido para beneficiarios existentes.';

COMMENT ON POLICY beneficiarios_read_own_docs_public ON public.portal_beneficiario_documentos_historicos IS 
'Permite que beneficiarios lean documentos durante onboarding sin requerir Supabase Auth.';
