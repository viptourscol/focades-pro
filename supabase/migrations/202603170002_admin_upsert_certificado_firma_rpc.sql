-- RPC admin para guardar firmas de certificados evitando fallos de RLS desde cliente.

create or replace function public.admin_upsert_certificado_firma(
  p_cargo text,
  p_nombre_firmante text,
  p_titulo_firmante text,
  p_firma_storage_path text,
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.portal_certificados_firmas%rowtype;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden gestionar firmas de certificados.';
  end if;

  if lower(coalesce(trim(p_cargo), '')) not in ('alcalde', 'secretario_educacion') then
    raise exception 'Cargo de firma invalido.';
  end if;

  insert into public.portal_certificados_firmas (
    cargo,
    nombre_firmante,
    titulo_firmante,
    firma_storage_path,
    activo,
    updated_by_user_id,
    updated_at
  ) values (
    lower(trim(p_cargo)),
    nullif(trim(coalesce(p_nombre_firmante, '')), ''),
    nullif(trim(coalesce(p_titulo_firmante, '')), ''),
    nullif(trim(coalesce(p_firma_storage_path, '')), ''),
    coalesce(p_activo, true),
    v_actor,
    now()
  )
  on conflict (cargo)
  do update set
    nombre_firmante = excluded.nombre_firmante,
    titulo_firmante = excluded.titulo_firmante,
    firma_storage_path = excluded.firma_storage_path,
    activo = excluded.activo,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'cargo', v_row.cargo,
    'nombre_firmante', v_row.nombre_firmante,
    'titulo_firmante', v_row.titulo_firmante,
    'firma_storage_path', v_row.firma_storage_path,
    'activo', v_row.activo
  );
end;
$$;

revoke all on function public.admin_upsert_certificado_firma(text, text, text, text, boolean) from public;
grant execute on function public.admin_upsert_certificado_firma(text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';