begin;

create function public.auditar_revision_condonacion_final()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous_row jsonb := to_jsonb(old);
  current_row jsonb := to_jsonb(new);
  state_field text;
  decision text;
  event_label text;
begin
  state_field := case when tg_table_name = 'portal_condonacion_final_documentos' then 'estado_validacion' else 'estado' end;
  decision := current_row ->> state_field;
  if new.revisado_at is not distinct from old.revisado_at
    and new.revisado_por_user_id is not distinct from old.revisado_por_user_id
    and new.observacion_admin is not distinct from old.observacion_admin
    and current_row ->> state_field is not distinct from previous_row ->> state_field then
    return new;
  end if;
  if decision not in ('aprobado', 'rechazado', 'aprobada_admin', 'rechazada_admin') then
    return new;
  end if;
  if decision in ('rechazado', 'rechazada_admin') and nullif(btrim(new.observacion_admin), '') is null then
    raise exception 'Debes indicar el motivo del rechazo.';
  end if;
  event_label := case when tg_table_name = 'portal_condonacion_final_documentos' then 'documento_condonacion_final' else 'condonacion_final' end;
  insert into public.portal_beneficiario_bitacora (
    beneficiario_id, actor_user_id, tipo_evento, categoria, accion,
    campo_cambio, estado_anterior, estado_nuevo, nota, metadata
  ) values (
    new.beneficiario_id, new.revisado_por_user_id, 'revision_' || event_label,
    'condonacion', case when decision in ('aprobado', 'aprobada_admin') then 'Aprobo ' else 'Rechazo ' end || replace(event_label, '_', ' '),
    state_field, jsonb_build_object(state_field, previous_row ->> state_field),
    jsonb_build_object(state_field, decision), new.observacion_admin,
    jsonb_build_object('registro_id', new.id, 'tipo_documento', current_row ->> 'tipo_documento',
      'nombre_original', current_row ->> 'nombre_original', 'revisado_at', new.revisado_at)
  );
  return new;
end;
$$;
revoke all on function public.auditar_revision_condonacion_final() from public, anon, authenticated;

create trigger auditar_revision_condonacion_documento
after update on public.portal_condonacion_final_documentos
for each row execute function public.auditar_revision_condonacion_final();

create trigger auditar_revision_condonacion_solicitud
after update on public.portal_condonacion_final
for each row execute function public.auditar_revision_condonacion_final();

commit;