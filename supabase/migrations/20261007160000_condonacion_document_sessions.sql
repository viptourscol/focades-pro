begin;

create table public.portal_document_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz
);
create index on public.portal_document_sessions (beneficiario_id);
alter table public.portal_document_sessions enable row level security;
revoke all on public.portal_document_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.portal_document_sessions to service_role;

create function public.revoke_document_sessions_on_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.portal_document_sessions set revoked_at = now()
  where beneficiario_id = old.beneficiario_id and revoked_at is null;
  return new;
end;
$$;
revoke all on function public.revoke_document_sessions_on_password_change() from public, anon, authenticated;
create trigger revoke_document_sessions_on_password_change
after update of password_hash on public.portal_auth_credentials
for each row when (old.password_hash is distinct from new.password_hash)
execute function public.revoke_document_sessions_on_password_change();

create function public.validar_sesion_documento_condonacion(p_session_token text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  beneficiary_id bigint;
begin
  if p_session_token is null or p_session_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Sesion invalida o expirada. Inicia sesion nuevamente.' using errcode = '28000';
  end if;
  select sessions.beneficiario_id into beneficiary_id
  from public.portal_document_sessions sessions
  join public.portal_beneficiarios beneficiary on beneficiary.id = sessions.beneficiario_id
  where sessions.token_hash = encode(sha256(convert_to(p_session_token, 'UTF8')), 'hex')
    and sessions.expires_at > now() and sessions.revoked_at is null
    and beneficiary.deleted_at is null;
  if beneficiary_id is null then
    raise exception 'Sesion invalida o expirada. Inicia sesion nuevamente.' using errcode = '28000';
  end if;
  return beneficiary_id;
end;
$$;

create function public.revocar_sesion_documento(p_session_token text)
returns void language sql security definer set search_path = '' as $$
  update public.portal_document_sessions set revoked_at = now()
  where token_hash = encode(sha256(convert_to(p_session_token, 'UTF8')), 'hex') and revoked_at is null;
$$;

create function public._registrar_documento_condonacion(
  p_beneficiario_id bigint, p_tipo_documento text, p_storage_path text,
  p_nombre_original text, p_mime_type text, p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  document_count integer;
  path_prefix text;
begin
  perform 1 from public.portal_beneficiarios
  where id = p_beneficiario_id and deleted_at is null for update;
  if not found then raise exception 'Beneficiario no disponible.'; end if;
  if lower(coalesce(p_tipo_documento, '')) not in ('diploma', 'acta_grado', 'historico_notas') then
    raise exception 'Tipo de documento final invalido.';
  end if;
  path_prefix := 'beneficiarios/' || p_beneficiario_id || '/condonacion-final/' || lower(p_tipo_documento) || '/';
  if p_storage_path is null or left(p_storage_path, length(path_prefix)) <> path_prefix
    or substring(p_storage_path from length(path_prefix) + 1) !~ '^[a-zA-Z0-9._-]+$'
    or position('..' in p_storage_path) > 0 then
    raise exception 'Ruta de documento invalida.';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or nullif(trim(p_nombre_original), '') is null then
    raise exception 'Datos de documento invalidos.';
  end if;
  insert into public.portal_condonacion_final_documentos
    (beneficiario_id, tipo_documento, storage_path, nombre_original, mime_type, size_bytes, estado_validacion)
  values (p_beneficiario_id, lower(p_tipo_documento), p_storage_path, p_nombre_original, p_mime_type, p_size_bytes, 'pendiente');
  insert into public.portal_condonacion_final (beneficiario_id, estado)
  values (p_beneficiario_id, 'pendiente_documentos') on conflict (beneficiario_id) do nothing;
  select count(distinct tipo_documento) into document_count
  from public.portal_condonacion_final_documentos where beneficiario_id = p_beneficiario_id;
  update public.portal_condonacion_final set
    estado = case when document_count >= 3 then 'preaprobada_sistema' else 'pendiente_documentos' end,
    preaprobado_at = case when document_count >= 3 then now() else preaprobado_at end,
    updated_at = now()
  where beneficiario_id = p_beneficiario_id;
  return jsonb_build_object('ok', true, 'beneficiario_id', p_beneficiario_id,
    'documentos_cargados', document_count,
    'estado_final', case when document_count >= 3 then 'preaprobada_sistema' else 'pendiente_documentos' end);
end;
$$;
revoke all on function public._registrar_documento_condonacion(bigint, text, text, text, text, bigint) from public, anon, authenticated;

create or replace function public.beneficiario_subir_documento_condonacion_final(
  p_tipo_documento text, p_storage_path text, p_nombre_original text, p_mime_type text, p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  beneficiary_id bigint;
begin
  select id into beneficiary_id from public.portal_beneficiarios
  where auth_user_id = auth.uid() and deleted_at is null limit 1;
  if beneficiary_id is null then raise exception 'No hay beneficiario vinculado a la sesión.'; end if;
  return public._registrar_documento_condonacion(beneficiary_id, p_tipo_documento, p_storage_path, p_nombre_original, p_mime_type, p_size_bytes);
end;
$$;

create function public.beneficiario_subir_documento_condonacion_por_sesion(
  p_session_token text, p_tipo_documento text, p_storage_path text,
  p_nombre_original text, p_mime_type text, p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public._registrar_documento_condonacion(public.validar_sesion_documento_condonacion(p_session_token),
    p_tipo_documento, p_storage_path, p_nombre_original, p_mime_type, p_size_bytes);
end;
$$;

revoke all on function public.validar_sesion_documento_condonacion(text) from public;
revoke all on function public.revocar_sesion_documento(text) from public;
revoke all on function public.beneficiario_subir_documento_condonacion_por_sesion(text, text, text, text, text, bigint) from public;
revoke all on function public.beneficiario_subir_documento_condonacion_final(text, text, text, text, bigint) from public, anon;
grant execute on function public.validar_sesion_documento_condonacion(text) to anon, authenticated;
grant execute on function public.revocar_sesion_documento(text) to anon, authenticated;
grant execute on function public.beneficiario_subir_documento_condonacion_por_sesion(text, text, text, text, text, bigint) to anon, authenticated;
grant execute on function public.beneficiario_subir_documento_condonacion_final(text, text, text, text, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;