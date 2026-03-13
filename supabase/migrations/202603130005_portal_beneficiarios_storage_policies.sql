-- Permite que beneficiarios autenticados suban y consulten sus documentos de actualización
-- en storage.objects bajo la ruta: soportes/beneficiarios/{beneficiario_id}/{actualizacion_id}/...
-- También habilita lectura para admins del portal.

create or replace function public.can_manage_beneficiario_storage_object(
  p_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_beneficiarios b
    where b.auth_user_id = p_user_id
      and split_part(coalesce(p_path, ''), '/', 1) = 'beneficiarios'
      and split_part(coalesce(p_path, ''), '/', 2) = b.id::text
  );
$$;

revoke all on function public.can_manage_beneficiario_storage_object(text, uuid) from public;
grant execute on function public.can_manage_beneficiario_storage_object(text, uuid) to authenticated;

drop policy if exists portal_beneficiarios_docs_select on storage.objects;
create policy portal_beneficiarios_docs_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'soportes'
    and (
      public.can_manage_beneficiario_storage_object(name, auth.uid())
      or public.is_portal_admin(auth.uid())
    )
  );

drop policy if exists portal_beneficiarios_docs_insert on storage.objects;
create policy portal_beneficiarios_docs_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'soportes'
    and public.can_manage_beneficiario_storage_object(name, auth.uid())
  );

drop policy if exists portal_beneficiarios_docs_update on storage.objects;
create policy portal_beneficiarios_docs_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'soportes'
    and (
      public.can_manage_beneficiario_storage_object(name, auth.uid())
      or public.is_portal_admin(auth.uid())
    )
  )
  with check (
    bucket_id = 'soportes'
    and (
      public.can_manage_beneficiario_storage_object(name, auth.uid())
      or public.is_portal_admin(auth.uid())
    )
  );

drop policy if exists portal_beneficiarios_docs_delete on storage.objects;
create policy portal_beneficiarios_docs_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'soportes'
    and (
      public.can_manage_beneficiario_storage_object(name, auth.uid())
      or public.is_portal_admin(auth.uid())
    )
  );
