-- Permite que usuarios anónimos (no autenticados) lean noticias activas ya publicadas.
-- Esto habilita la sección de noticias en la página pública de login del portal.

drop policy if exists portal_news_select_anon on public.portal_noticias;

create policy portal_news_select_anon
  on public.portal_noticias for select
  to anon
  using (
    is_active = true
    and publish_at <= now()
  );
