-- =====================================================
-- Migration: Reactivar RLS con policies correctas para portal_ticket_mensajes
-- Fecha: 2026-08-20
-- Descripción: Proteger la tabla con RLS pero permitir operaciones vía Edge Functions
-- =====================================================

-- 1. Reactivar RLS
ALTER TABLE public.portal_ticket_mensajes ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar policies antiguas restrictivas
DROP POLICY IF EXISTS admin_view_all_mensajes ON public.portal_ticket_mensajes;
DROP POLICY IF EXISTS admin_insert_mensajes ON public.portal_ticket_mensajes;
DROP POLICY IF EXISTS "Admins pueden ver todos los mensajes" ON public.portal_ticket_mensajes;
DROP POLICY IF EXISTS "Admins pueden actualizar mensajes" ON public.portal_ticket_mensajes;
DROP POLICY IF EXISTS "Super admins pueden eliminar mensajes" ON public.portal_ticket_mensajes;

-- 3. Policy para SELECT: Solo admins autenticados pueden ver mensajes
CREATE POLICY "Admins pueden ver todos los mensajes"
  ON public.portal_ticket_mensajes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_admin_users
      WHERE portal_admin_users.user_id = auth.uid()
        AND portal_admin_users.is_active = true
    )
  );

-- 4. NO crear policy para INSERT desde anon/public
-- Las Edge Functions usan service_role_key que BYPASEA RLS automáticamente
-- Sin policy de INSERT, los usuarios directos (con anon_key) NO pueden insertar
-- Esto protege contra acceso no autorizado mientras permite Edge Functions

-- 5. Policy adicional para UPDATE: Solo admins
CREATE POLICY "Admins pueden actualizar mensajes"
  ON public.portal_ticket_mensajes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_admin_users
      WHERE portal_admin_users.user_id = auth.uid()
        AND portal_admin_users.is_active = true
    )
  );

-- 6. Policy para DELETE: Solo admins super
CREATE POLICY "Super admins pueden eliminar mensajes"
  ON public.portal_ticket_mensajes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_admin_users
      WHERE portal_admin_users.user_id = auth.uid()
        AND portal_admin_users.is_active = true
        AND portal_admin_users.role = 'super_admin'
    )
  );

-- =====================================================
-- Fin de migración
-- =====================================================
