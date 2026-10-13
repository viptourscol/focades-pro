-- EXECUTE THIS DIRECTLY IN SUPABASE DASHBOARD SQL EDITOR
-- https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new
-- This fixes the RLS issue for anonymous storage uploads

-- Step 1: Drop ALL existing policies that might be blocking
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
    RAISE NOTICE 'Dropped policy: %', policy_record.polname;
  END LOOP;
END $$;

-- Step 2: Create new, simple, permissive policies
-- Policy 1: Allow anonymous users to INSERT
CREATE POLICY "allow_anon_insert_soportes"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'soportes');

-- Policy 2: Allow anonymous users to SELECT
CREATE POLICY "allow_anon_select_soportes"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'soportes');

-- Policy 3: Allow authenticated users full access
CREATE POLICY "allow_auth_all_soportes"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'soportes')
  WITH CHECK (bucket_id = 'soportes');

-- Step 3: Verify policies were created
SELECT 
  polname,
  CASE WHEN polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as type,
  polcmd as operation,
  polroles as roles
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass
ORDER BY polname;
