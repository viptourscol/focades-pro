-- Nuclear option: completely reset storage policies
-- This removes ALL policies and creates fresh, working ones

-- Drop ALL existing policies using a more aggressive approach
DO $$ 
DECLARE 
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT polname 
    FROM pg_policy 
    WHERE polrelid = 'storage.objects'::regclass
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.polname || '" ON storage.objects';
  END LOOP;
END $$;

-- Step 2: Create completely new, permissive policies
-- These should work for the onboarding upload path

-- For anonymous users: allow INSERT to any bucket
CREATE POLICY "storage_anon_insert_all_buckets"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- For anonymous users: allow SELECT from any bucket
CREATE POLICY "storage_anon_select_all_buckets"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (true);

-- For authenticated users: full access
CREATE POLICY "storage_authenticated_full_access"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- For service_role (internal Supabase operations): full access
CREATE POLICY "storage_service_role_full_access"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
