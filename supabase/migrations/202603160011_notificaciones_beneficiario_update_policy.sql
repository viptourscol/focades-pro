-- Permitir a beneficiarios marcar notificaciones como leídas de forma segura.

create policy "Beneficiarios pueden marcar notificaciones leidas"
  on public.portal_notificaciones_beneficiarios
  for update
  using (
    auth.uid() in (
      select auth_user_id from public.portal_beneficiarios where id = beneficiario_id
    )
  )
  with check (
    auth.uid() in (
      select auth_user_id from public.portal_beneficiarios where id = beneficiario_id
    )
    and leida = true
  );

create or replace function public.enforce_beneficiario_notif_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  select exists(
    select 1
    from public.portal_admin_users
    where user_id = auth.uid()
  ) into v_is_admin;

  if v_is_admin then
    return new;
  end if;

  -- Beneficiario solo puede marcar como leída su propia notificación.
  if not exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = old.beneficiario_id
      and b.auth_user_id = auth.uid()
  ) then
    raise exception 'No autorizado para actualizar esta notificación.';
  end if;

  if new.leida is distinct from true then
    raise exception 'Solo se permite marcar notificación como leída.';
  end if;

  -- Evitar cambios en campos de negocio para beneficiarios.
  if (to_jsonb(new) - 'leida' - 'leida_at' - 'updated_at') <> (to_jsonb(old) - 'leida' - 'leida_at' - 'updated_at') then
    raise exception 'Solo puedes actualizar el estado de lectura.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_beneficiario_notif_update_scope on public.portal_notificaciones_beneficiarios;

create trigger trg_enforce_beneficiario_notif_update_scope
  before update on public.portal_notificaciones_beneficiarios
  for each row
  execute function public.enforce_beneficiario_notif_update_scope();