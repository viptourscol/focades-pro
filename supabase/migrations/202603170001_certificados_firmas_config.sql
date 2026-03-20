-- Configuracion de firmas para certificados de paz y salvo.

create table if not exists public.portal_certificados_firmas (
  id bigserial primary key,
  cargo text not null,
  nombre_firmante text,
  titulo_firmante text,
  firma_storage_path text,
  activo boolean not null default true,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_certificados_firmas_cargo_check check (cargo in ('alcalde', 'secretario_educacion')),
  constraint portal_certificados_firmas_cargo_unique unique (cargo)
);

create index if not exists idx_portal_certificados_firmas_activo
  on public.portal_certificados_firmas(activo, cargo);

create or replace function public.portal_certificados_firmas_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_portal_certificados_firmas_updated_at on public.portal_certificados_firmas;
create trigger trg_portal_certificados_firmas_updated_at
before update on public.portal_certificados_firmas
for each row
execute function public.portal_certificados_firmas_set_updated_at();

alter table public.portal_certificados_firmas enable row level security;

drop policy if exists portal_certificados_firmas_admin_all on public.portal_certificados_firmas;
create policy portal_certificados_firmas_admin_all
on public.portal_certificados_firmas for all
to authenticated
using (public.is_portal_admin(auth.uid()))
with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_certificados_firmas_auth_read on public.portal_certificados_firmas;
create policy portal_certificados_firmas_auth_read
on public.portal_certificados_firmas for select
to authenticated
using (
  activo = true
  or public.is_portal_admin(auth.uid())
);

insert into public.portal_certificados_firmas (cargo, nombre_firmante, titulo_firmante, activo)
values
  ('alcalde', 'Alcalde Municipal', 'Alcalde Municipal', true),
  ('secretario_educacion', 'Secretario de Educacion', 'Secretaria de Educacion Municipal', true)
on conflict (cargo) do nothing;

notify pgrst, 'reload schema';