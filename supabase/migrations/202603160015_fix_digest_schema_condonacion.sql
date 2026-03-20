-- Corrige hash de certificados para entornos donde pgcrypto vive en schema extensions.

create or replace function public.crear_certificado_condonacion_semestral(
  p_condonacion_id bigint
)
returns table (
  codigo_certificado text,
  verify_url text,
  beneficiario_nombre text,
  semestre_texto text,
  monto_condonado numeric,
  fecha_emision timestamptz,
  estado text,
  hash_integridad text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_cond public.portal_condonacion_semestral%rowtype;
  v_benef public.portal_beneficiarios%rowtype;
  v_cert public.portal_condonacion_certificados%rowtype;
  v_code text;
  v_payload text;
  v_hash text;
  v_base_url text := 'https://app.focades.info/verificar-certificado';
  v_is_admin boolean := false;
begin
  select * into v_cond
  from public.portal_condonacion_semestral
  where id = p_condonacion_id;

  if not found then
    raise exception 'Condonacion semestral no encontrada.';
  end if;

  select * into v_benef
  from public.portal_beneficiarios
  where id = v_cond.beneficiario_id;

  select exists (select 1 from public.portal_admin_users a where a.user_id = v_actor)
  into v_is_admin;

  if not v_is_admin and coalesce(v_benef.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_actor then
    raise exception 'No autorizado para generar este certificado.';
  end if;

  if v_cond.estado_condonacion <> 'condonada' then
    raise exception 'Solo se puede generar certificado para condonaciones aprobadas.';
  end if;

  select * into v_cert
  from public.portal_condonacion_certificados c
  where c.condonacion_semestral_id = v_cond.id
    and c.estado = 'vigente'
  limit 1;

  if found then
    return query
    select
      v_cert.codigo_certificado,
      v_base_url || '?code=' || v_cert.codigo_certificado,
      coalesce(v_benef.nombre_completo, 'Beneficiario'),
      v_cond.semestre_texto,
      v_cond.monto_desembolsado,
      v_cert.created_at,
      v_cert.estado,
      v_cert.hash_integridad;
    return;
  end if;

  v_code := 'COND-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_cond.id::text, 8, '0');
  v_payload := coalesce(v_benef.nombre_completo, '') || '|' || coalesce(v_benef.n_documento, '') || '|' || coalesce(v_cond.semestre_texto, '') || '|' || coalesce(v_cond.monto_desembolsado::text, '0') || '|' || v_code;

  begin
    v_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
  exception
    when undefined_function then
      v_hash := encode(public.digest(v_payload, 'sha256'), 'hex');
  end;

  insert into public.portal_condonacion_certificados (
    beneficiario_id,
    condonacion_semestral_id,
    codigo_certificado,
    hash_integridad,
    qr_payload,
    estado,
    emitido_por_user_id,
    created_at,
    updated_at
  ) values (
    v_cond.beneficiario_id,
    v_cond.id,
    v_code,
    v_hash,
    jsonb_build_object(
      'code', v_code,
      'verify_url', v_base_url || '?code=' || v_code,
      'beneficiario_id', v_cond.beneficiario_id,
      'condonacion_id', v_cond.id
    ),
    'vigente',
    v_actor,
    now(),
    now()
  ) returning * into v_cert;

  return query
  select
    v_cert.codigo_certificado,
    v_base_url || '?code=' || v_cert.codigo_certificado,
    coalesce(v_benef.nombre_completo, 'Beneficiario'),
    v_cond.semestre_texto,
    v_cond.monto_desembolsado,
    v_cert.created_at,
    v_cert.estado,
    v_cert.hash_integridad;
end;
$$;

notify pgrst, 'reload schema';
