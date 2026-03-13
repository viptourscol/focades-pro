insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'soportes',
  'soportes',
  false,
  10485760,
  array['application/pdf', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "soportes_select_authenticated" on storage.objects;
create policy "soportes_select_authenticated"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'soportes'
  and split_part(name, '/', 1) = 'expedientes'
);

drop policy if exists "soportes_insert_authenticated" on storage.objects;
create policy "soportes_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'soportes'
  and split_part(name, '/', 1) = 'expedientes'
);

drop policy if exists "soportes_update_authenticated" on storage.objects;
create policy "soportes_update_authenticated"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'soportes'
  and split_part(name, '/', 1) = 'expedientes'
)
with check (
  bucket_id = 'soportes'
  and split_part(name, '/', 1) = 'expedientes'
);

drop policy if exists "soportes_delete_authenticated" on storage.objects;
create policy "soportes_delete_authenticated"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'soportes'
  and split_part(name, '/', 1) = 'expedientes'
);
