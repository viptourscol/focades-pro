-- Funciones admin para flujo de condonacion final y auditoria de certificados.

create or replace function public.admin_revisar_condonacion_final(
  p_beneficiario_id bigint,
  p_aprobar boolean,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_estado text;
  v_docs_count int;
  v_docs_aprobados int;
  v_final_id bigint;
begin
  if not exists (select 1 from public.portal_admin_users a where a.user_id = v_actor) then
    raise exception 'Solo administradores pueden revisar condonacion final.';
  end if;

  insert into public.portal_condonacion_final (beneficiario_id, estado)
  values (p_beneficiario_id, 'pendiente_documentos')
  on conflict (beneficiario_id) do nothing;

  select id into v_final_id
  from public.portal_condonacion_final
  where beneficiario_id = p_beneficiario_id
  limit 1;

  select count(*), count(*) filter (where estado_validacion = 'aprobado')
  into v_docs_count, v_docs_aprobados
  from public.portal_condonacion_final_documentos
  where beneficiario_id = p_beneficiario_id;

  if p_aprobar and v_docs_count < 3 then
    raise exception 'No se puede aprobar condonacion final sin los 3 documentos requeridos.';
  end if;

  if p_aprobar and v_docs_aprobados < 3 then
    raise exception 'No se puede aprobar condonacion final sin validar los 3 documentos en estado aprobado.';
  end if;

  v_estado := case when p_aprobar then 'aprobada_admin' else 'rechazada_admin' end;

  update public.portal_condonacion_final
  set
    estado = v_estado,
    observacion_admin = nullif(trim(coalesce(p_observacion, '')), ''),
    revisado_por_user_id = v_actor,
    revisado_at = now(),
    updated_at = now()
  where id = v_final_id;

  return jsonb_build_object(
    'ok', true,
    'beneficiario_id', p_beneficiario_id,
    'estado', v_estado
  );
end;
$$;

create or replace function public.admin_revisar_documento_condonacion_final(
  p_documento_id bigint,
  p_aprobar boolean,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.portal_condonacion_final_documentos%rowtype;
  v_estado text;
  v_docs_count int;
  v_docs_aprobados int;
begin
  if not exists (select 1 from public.portal_admin_users a where a.user_id = v_actor) then
    raise exception 'Solo administradores pueden revisar documentos de condonacion final.';
  end if;

  select * into v_doc
  from public.portal_condonacion_final_documentos
  where id = p_documento_id;

  if not found then
    raise exception 'Documento de condonacion final no encontrado.';
  end if;

  v_estado := case when p_aprobar then 'aprobado' else 'rechazado' end;

  update public.portal_condonacion_final_documentos
  set
    estado_validacion = v_estado,
    observacion_admin = nullif(trim(coalesce(p_observacion, '')), ''),
    revisado_por_user_id = v_actor,
    revisado_at = now(),
    updated_at = now()
  where id = p_documento_id;

  insert into public.portal_condonacion_final (beneficiario_id, estado)
  values (v_doc.beneficiario_id, 'pendiente_documentos')
  on conflict (beneficiario_id) do nothing;

  select count(*), count(*) filter (where estado_validacion = 'aprobado')
  into v_docs_count, v_docs_aprobados
  from public.portal_condonacion_final_documentos
  where beneficiario_id = v_doc.beneficiario_id;

  update public.portal_condonacion_final
  set
    estado = case
      when v_docs_count >= 3 and v_docs_aprobados >= 3 then 'preaprobada_sistema'
      else 'pendiente_documentos'
    end,
    preaprobado_at = case
      when v_docs_count >= 3 and v_docs_aprobados >= 3 then now()
      else preaprobado_at
    end,
    updated_at = now()
  where beneficiario_id = v_doc.beneficiario_id
    and estado <> 'aprobada_admin';

  return jsonb_build_object(
    'ok', true,
    'documento_id', p_documento_id,
    'beneficiario_id', v_doc.beneficiario_id,
    'estado_documento', v_estado
  );
end;
$$;

create or replace function public.admin_revocar_certificado_condonacion(
  p_certificado_id bigint,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_cert public.portal_condonacion_certificados%rowtype;
  v_reason text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if not exists (select 1 from public.portal_admin_users a where a.user_id = v_actor) then
    raise exception 'Solo administradores pueden revocar certificados.';
  end if;

  if v_reason is null then
    raise exception 'Debes indicar el motivo de revocacion.';
  end if;

  select * into v_cert
  from public.portal_condonacion_certificados
  where id = p_certificado_id;

  if not found then
    raise exception 'Certificado no encontrado.';
  end if;

  if v_cert.estado = 'revocado' then
    return jsonb_build_object(
      'ok', true,
      'certificado_id', p_certificado_id,
      'estado', 'revocado',
      'message', 'El certificado ya estaba revocado.'
    );
  end if;

  update public.portal_condonacion_certificados
  set
    estado = 'revocado',
    revocado_at = now(),
    revocado_motivo = v_reason,
    updated_at = now()
  where id = p_certificado_id;

  return jsonb_build_object(
    'ok', true,
    'certificado_id', p_certificado_id,
    'estado', 'revocado'
  );
end;
$$;

grant execute on function public.admin_revisar_condonacion_final(bigint, boolean, text) to authenticated;
grant execute on function public.admin_revisar_documento_condonacion_final(bigint, boolean, text) to authenticated;
grant execute on function public.admin_revocar_certificado_condonacion(bigint, text) to authenticated;

notify pgrst, 'reload schema';
