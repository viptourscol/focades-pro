-- Final comprehensive fix for storage RLS policies
-- Ensure both anonymous and authenticated users can access beneficiarios_historicos

-- Step 1: Drop all existing policies on storage.objects
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN 
    SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || policy_row.polname || '" ON storage.objects';
    RAISE NOTICE 'Dropped policy: %', policy_row.polname;
  END LOOP;
END $$;

-- Step 2: Ensure bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes', 'soportes', false)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create clean, non-conflicting policies

-- Policy 1: ANONYMOUS users can INSERT into beneficiarios_historicos folder
-- This allows onboarding students to upload documents
CREATE POLICY "anon_insert_beneficiarios_historicos"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'soportes' 
    AND (string_to_array(name, '/'))[1] = 'beneficiarios_historicos'
  );

-- Policy 2: ANONYMOUS users can SELECT from beneficiarios_historicos folder
-- This allows onboarding students to view their uploaded documents
CREATE POLICY "anon_select_beneficiarios_historicos"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = 'soportes'
    AND (string_to_array(name, '/'))[1] = 'beneficiarios_historicos'
  );

-- Policy 3: AUTHENTICATED users (including admins) can do EVERYTHING in soportes bucket
CREATE POLICY "authenticated_all_operations_soportes"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'soportes')
  WITH CHECK (bucket_id = 'soportes');
