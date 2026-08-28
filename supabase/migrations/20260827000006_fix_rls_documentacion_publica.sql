-- Fix 403 "permission denied for table users" al leer las tablas públicas
-- de documentación.
--
-- Causa: las políticas de escritura de admin estaban declaradas FOR ALL, por
-- lo que también se evaluaban en los SELECT. Su USING consultaba auth.users,
-- tabla sobre la que el rol anon no tiene permiso, y PostgREST abortaba la
-- lectura con 42501 aunque existiera una política de lectura pública.
--
-- Solución: separar las políticas por comando (INSERT/UPDATE/DELETE) para que
-- no intervengan en las lecturas, y resolver el rol con is_portal_admin(),
-- que es SECURITY DEFINER y no expone auth.users.

DROP POLICY IF EXISTS "Admin write access to requisitos" ON portal_requisitos_modalidad;
DROP POLICY IF EXISTS "Admin write access to guia" ON portal_guia_inscripcion;
DROP POLICY IF EXISTS "Admin write access to documentos" ON portal_documentos_descargables;

-- Permite que anon evalúe la función sin error; para un anónimo retorna false.
GRANT EXECUTE ON FUNCTION public.is_portal_admin(uuid) TO anon;

-- ── Requisitos ──────────────────────────────────────────────────────────────
CREATE POLICY "Admin insert requisitos" ON portal_requisitos_modalidad
  FOR INSERT TO authenticated WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin update requisitos" ON portal_requisitos_modalidad
  FOR UPDATE TO authenticated USING (public.is_portal_admin(auth.uid()))
  WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin delete requisitos" ON portal_requisitos_modalidad
  FOR DELETE TO authenticated USING (public.is_portal_admin(auth.uid()));

-- ── Guía ────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin insert guia" ON portal_guia_inscripcion
  FOR INSERT TO authenticated WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin update guia" ON portal_guia_inscripcion
  FOR UPDATE TO authenticated USING (public.is_portal_admin(auth.uid()))
  WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin delete guia" ON portal_guia_inscripcion
  FOR DELETE TO authenticated USING (public.is_portal_admin(auth.uid()));

-- ── Documentos ──────────────────────────────────────────────────────────────
CREATE POLICY "Admin insert documentos" ON portal_documentos_descargables
  FOR INSERT TO authenticated WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin update documentos" ON portal_documentos_descargables
  FOR UPDATE TO authenticated USING (public.is_portal_admin(auth.uid()))
  WITH CHECK (public.is_portal_admin(auth.uid()));
CREATE POLICY "Admin delete documentos" ON portal_documentos_descargables
  FOR DELETE TO authenticated USING (public.is_portal_admin(auth.uid()));

-- La política pública de UPDATE existía solo para el contador de descargas,
-- pero permitía a cualquier anónimo editar cualquier columna (título, URL del
-- archivo, activo). Se reemplaza por una función acotada al contador.
DROP POLICY IF EXISTS "Public can update download counter" ON portal_documentos_descargables;

CREATE OR REPLACE FUNCTION public.incrementar_descarga_documento(p_documento_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE portal_documentos_descargables
  SET descargas = COALESCE(descargas, 0) + 1
  WHERE id = p_documento_id AND activo = true;
$$;

GRANT EXECUTE ON FUNCTION public.incrementar_descarga_documento(uuid) TO anon, authenticated;
