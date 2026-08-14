-- Permitir lectura pública (anónima) de catálogos para el proceso de setup
-- Los usuarios no autenticados necesitan acceso a estas tablas durante el registro

-- Política de lectura pública para catalog_bancos
drop policy if exists read_catalog_bancos_public on public.catalog_bancos;
create policy read_catalog_bancos_public
on public.catalog_bancos
for select
to anon, authenticated
using (is_active = true);

-- Política de lectura pública para catalog_establecimientos_educativos
drop policy if exists read_catalog_establecimientos_public on public.catalog_establecimientos_educativos;
create policy read_catalog_establecimientos_public
on public.catalog_establecimientos_educativos
for select
to anon, authenticated
using (activo = true);
