-- NUCLEAR OPTION: Clear ALL policies from storage.objects and rebuild cleanly
-- This ensures no hidden conflicting policies remain

-- Step 1: Drop EVERY policy on storage.objects
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN 
    SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || policy_row.polname || '" ON storage.objects';
  END LOOP;
END $$;

-- Step 2: Ensure bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes', 'soportes', false)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create EXACTLY 2 policies - no more, no less

-- Policy A: Anonymous users can ONLY upload to beneficiarios_historicos folder (onboarding)
CREATE POLICY "anon_upload_beneficiarios_historicos"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'soportes' 
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );

-- Policy B: Authenticated users can manage everything in soportes (including admins)
CREATE POLICY "authenticated_manage_all_soportes"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'soportes')
  WITH CHECK (bucket_id = 'soportes');

-- Note: SELECT is unrestricted for now to allow reading
-- If needed, can be restricted later via RLS on client-side
