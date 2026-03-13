-- Habilita gestión de imágenes de noticias para admins del portal en storage.objects
-- Ruta permitida: bucket 'soportes' en carpeta portal/noticias/*

drop policy if exists portal_news_images_admin_insert on storage.objects;
create policy portal_news_images_admin_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and exists (
      select 1
      from public.portal_admin_users a
      where a.user_id = auth.uid()
    )
  );

drop policy if exists portal_news_images_admin_update on storage.objects;
create policy portal_news_images_admin_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and exists (
      select 1
      from public.portal_admin_users a
      where a.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and exists (
      select 1
      from public.portal_admin_users a
      where a.user_id = auth.uid()
    )
  );

drop policy if exists portal_news_images_admin_delete on storage.objects;
create policy portal_news_images_admin_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'soportes'
    and (storage.foldername(name))[1] = 'portal'
    and (storage.foldername(name))[2] = 'noticias'
    and exists (
      select 1
      from public.portal_admin_users a
      where a.user_id = auth.uid()
    )
  );
