-- Refuerza políticas RLS de storage para imágenes de noticias.
-- Usa función SECURITY DEFINER para validar admin sin depender de RLS de otras tablas.

create or replace function public.is_portal_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_admin_users a
    where a.user_id = p_user_id
  );
$$;

revoke all on function public.is_portal_admin(uuid) from public;
grant execute on function public.is_portal_admin(uuid) to authenticated;

drop policy if exists portal_news_images_admin_insert on storage.objects;
create policy portal_news_images_admin_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and public.is_portal_admin(auth.uid())
  );

drop policy if exists portal_news_images_admin_update on storage.objects;
create policy portal_news_images_admin_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and public.is_portal_admin(auth.uid())
  )
  with check (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and public.is_portal_admin(auth.uid())
  );

drop policy if exists portal_news_images_admin_delete on storage.objects;
create policy portal_news_images_admin_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and public.is_portal_admin(auth.uid())
  );

-- Permite lectura pública solo de imágenes de noticias para login/home público.
drop policy if exists portal_news_images_public_read on storage.objects;
create policy portal_news_images_public_read
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
  );
