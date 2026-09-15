-- Emergency fix: Remove conflicting storage RLS policies that block anonymous uploads
-- Problem: Multiple INSERT policies exist, some requiring admin access
-- Postgres requires ALL INSERT policies to pass -> fails for anonymous users

-- Step 1: Drop all conflicting policies
DROP POLICY IF EXISTS "beneficiarios_historicos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "portal_beneficiarios_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "portal_beneficiarios_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "Beneficiarios pueden subir sus documentos" ON storage.objects;
DROP POLICY IF EXISTS "Beneficiarios pueden ver sus documentos" ON storage.objects;
DROP POLICY IF EXISTS "Admins pueden ver todos los documentos" ON storage.objects;
DROP POLICY IF EXISTS "beneficiarios_historicos_storage_insert_self" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de documentos onboarding" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura de documentos onboarding" ON storage.objects;
DROP POLICY IF EXISTS "Admins acceso completo a soportes" ON storage.objects;
DROP POLICY IF EXISTS "storage_insert_beneficiarios_historicos" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_beneficiarios_historicos" ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_full_access" ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_update_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_delete" ON storage.objects;

-- Step 2: Create SINGLE, CLEAR policies without conflicts

-- Policy 1: Allow anonymous and authenticated users to INSERT into beneficiarios_historicos
CREATE POLICY "beneficiarios_anon_upload"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'soportes' 
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );

-- Policy 2: Allow SELECT for beneficiarios_historicos
CREATE POLICY "beneficiarios_anon_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'soportes'
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );

-- Policy 3: Admin full access (all operations) to entire soportes bucket
CREATE POLICY "admin_full_soportes_access"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'soportes'
    AND auth.uid() IN (SELECT user_id FROM public.portal_admin_users)
  )
  WITH CHECK (
    bucket_id = 'soportes'
    AND auth.uid() IN (SELECT user_id FROM public.portal_admin_users)
  );
