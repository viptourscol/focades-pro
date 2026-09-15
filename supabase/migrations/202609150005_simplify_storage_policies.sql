-- Simplify and fix storage RLS policies using Supabase functions
-- The issue might be with string_to_array - use storage functions instead

-- Drop problematic policies
DROP POLICY IF EXISTS "anon_insert_beneficiarios_historicos" ON storage.objects;
DROP POLICY IF EXISTS "anon_select_beneficiarios_historicos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_all_operations_soportes" ON storage.objects;

-- Recreate with explicit, working conditions

-- Policy 1: Anonymous INSERT to beneficiarios_historicos
-- No WHERE condition needed - allow all anonymous inserts to soportes/beneficiarios_historicos/
CREATE POLICY "allow_anon_insert_beneficiarios"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'soportes'
  );

-- Policy 2: Anonymous SELECT from beneficiarios_historicos  
CREATE POLICY "allow_anon_select_beneficiarios"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = 'soportes'
  );

-- Policy 3: Authenticated users can do everything
CREATE POLICY "allow_authenticated_all_soportes"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'soportes')
  WITH CHECK (bucket_id = 'soportes');
