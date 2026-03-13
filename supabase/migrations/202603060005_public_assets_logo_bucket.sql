insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "public_assets_select_all" on storage.objects;
create policy "public_assets_select_all"
on storage.objects
for select
to public
using (bucket_id = 'public-assets');

-- Opcional: permitir a usuarios autenticados cargar logos
-- Si no lo necesitas, puedes omitir esta policy y subir desde dashboard/service role.
drop policy if exists "public_assets_insert_authenticated" on storage.objects;
create policy "public_assets_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'public-assets');
