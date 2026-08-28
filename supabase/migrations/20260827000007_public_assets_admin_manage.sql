-- Permite a los administradores reemplazar y eliminar archivos publicados
-- (documentos descargables e imágenes de la guía) desde el panel.

DROP POLICY IF EXISTS "public_assets_update_admin" ON storage.objects;
CREATE POLICY "public_assets_update_admin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'public-assets' AND public.is_portal_admin(auth.uid()))
WITH CHECK (bucket_id = 'public-assets' AND public.is_portal_admin(auth.uid()));

DROP POLICY IF EXISTS "public_assets_delete_admin" ON storage.objects;
CREATE POLICY "public_assets_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'public-assets' AND public.is_portal_admin(auth.uid()));
