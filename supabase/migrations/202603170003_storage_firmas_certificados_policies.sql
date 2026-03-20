-- Politicas de Storage para firmas de certificados en bucket soportes.
-- Ruta esperada: firmas-certificados/{cargo}/{archivo}

create or replace function public.can_manage_certificate_signature_storage_object(
  p_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    split_part(coalesce(p_path, ''), '/', 1) = 'firmas-certificados'
    and public.is_portal_admin(p_user_id)
  );
$$;

revoke all on function public.can_manage_certificate_signature_storage_object(text, uuid) from public;
grant execute on function public.can_manage_certificate_signature_storage_object(text, uuid) to authenticated;

-- Lectura de firmas para autenticados (admin y beneficiario) para render de certificados
-- Mantener restringido al prefijo firmas-certificados/
drop policy if exists portal_firmas_certificados_select on storage.objects;
create policy portal_firmas_certificados_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'soportes'
    and split_part(coalesce(name, ''), '/', 1) = 'firmas-certificados'
  );

-- Insertar/cambiar/eliminar solo admins del portal

drop policy if exists portal_firmas_certificados_insert_admin on storage.objects;
create policy portal_firmas_certificados_insert_admin
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'soportes'
    and public.can_manage_certificate_signature_storage_object(name, auth.uid())
  );

drop policy if exists portal_firmas_certificados_update_admin on storage.objects;
create policy portal_firmas_certificados_update_admin
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'soportes'
    and public.can_manage_certificate_signature_storage_object(name, auth.uid())
  )
  with check (
    bucket_id = 'soportes'
    and public.can_manage_certificate_signature_storage_object(name, auth.uid())
  );

drop policy if exists portal_firmas_certificados_delete_admin on storage.objects;
create policy portal_firmas_certificados_delete_admin
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'soportes'
    and public.can_manage_certificate_signature_storage_object(name, auth.uid())
  );