-- Ultra-permissive policy for debugging
-- This will allow ANY insert/select to storage regardless of conditions
-- We'll make it restrictive later once we know it works

DROP POLICY IF EXISTS "allow_anon_insert_beneficiarios" ON storage.objects;
DROP POLICY IF EXISTS "allow_anon_select_beneficiarios" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_all_soportes" ON storage.objects;

-- Simple: allow anonymous INSERT to ANY object (for testing only)
CREATE POLICY "debug_anon_insert_all"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Simple: allow anonymous SELECT to ANY object (for testing only)
CREATE POLICY "debug_anon_select_all"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated to do everything
CREATE POLICY "debug_auth_all"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
