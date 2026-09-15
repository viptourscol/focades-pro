-- Fix storage RLS conflicts preventing anonymous document uploads
-- Problem: Multiple INSERT policies exist, one requiring auth.uid() IS NOT NULL
-- Solution: Drop all conflicting policies and create a single permissive one

-- Drop ALL existing policies on storage.objects that might be conflicting
DROP POLICY IF EXISTS "beneficiarios_historicos_storage_insert_self" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de documentos onboarding" ON storage.objects;
DROP POLICY IF EXISTS "Beneficiarios pueden subir sus documentos" ON storage.objects;
DROP POLICY IF EXISTS "Beneficiarios pueden ver sus documentos" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden ver todos los documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura de documentos onboarding" ON storage.objects;
DROP POLICY IF EXISTS "Admins acceso completo a soportes" ON storage.objects;

-- Recreate the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes', 'soportes', false)
ON CONFLICT (id) DO NOTHING;

-- Create a single, clear policy for INSERT that allows anon and authenticated users
-- to upload to beneficiarios_historicos folder
CREATE POLICY "storage_insert_beneficiarios_historicos"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'soportes' 
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );

-- Create a policy for SELECT that allows reading from beneficiarios_historicos
CREATE POLICY "storage_select_beneficiarios_historicos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'soportes'
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );

-- Create a policy for admins to have full access to soportes bucket
CREATE POLICY "storage_admin_full_access"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'soportes'
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'soportes'
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users 
      WHERE user_id = auth.uid()
    )
  );

-- Optional: Allow UPDATE and DELETE for admin users
CREATE POLICY "storage_admin_update_delete"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'soportes'
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'soportes'
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "storage_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'soportes'
    AND EXISTS (
      SELECT 1 FROM public.portal_admin_users 
      WHERE user_id = auth.uid()
    )
  );
