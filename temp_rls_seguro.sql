ALTER TABLE public.portal_ticket_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_view_all_mensajes ON public.portal_ticket_mensajes;
DROP POLICY IF EXISTS admin_insert_mensajes ON public.portal_ticket_mensajes;

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
