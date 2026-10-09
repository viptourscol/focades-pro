begin;

-- Solo la invoca la Edge Function admin-corregir-documento-aspirante (service_role) tras mover los archivos en R2.
create or replace function public.admin_corregir_documento_aspirante_aplicar(
  p_inscripcion_id uuid,
  p_nuevo_documento text,
  p_old_segments text[],
  p_new_segment text,
  p_radicado_segment text,
  p_actor_user_id uuid,
  p_motivo text,
  p_rutas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insc public.inscripciones%rowtype;
  v_nuevo text := btrim(coalesce(p_nuevo_documento, ''));
  v_old_seg text;
  v_old_prefix text;
  v_new_prefix text;
  v_col record;
  v_rows integer;
  v_docs_updated integer := 0;
  v_columns text[] := '{}';
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Debes indicar el motivo del cambio.';
  end if;
  if v_nuevo = '' then
    raise exception 'Debes indicar el nuevo numero de documento.';
  end if;
  if p_actor_user_id is null then
    raise exception 'Actor administrativo requerido.';
  end if;
  if coalesce(p_new_segment, '') !~ '^[a-z0-9_-]+$' or coalesce(p_radicado_segment, '') !~ '^[a-z0-9_-]+$' then
    raise exception 'Segmento de ruta invalido.';
  end if;
  if exists (select 1 from unnest(coalesce(p_old_segments, '{}'::text[])) s where s !~ '^[a-z0-9_-]+$') then
    raise exception 'Segmento de ruta anterior invalido.';
  end if;

  select * into v_insc from public.inscripciones where id = p_inscripcion_id for update;
  if not found then
    raise exception 'Inscripcion no encontrada.';
  end if;

  if coalesce(v_insc.promovido_a_beneficiario, false)
    or exists (select 1 from public.portal_beneficiarios b where b.inscripcion_pk = p_inscripcion_id) then
    raise exception 'La inscripcion ya fue promovida a beneficiario; la correccion no esta disponible.';
  end if;

  if v_insc.persona_id is not null then
    if exists (
      select 1 from public.inscripciones i
      where i.persona_id = v_insc.persona_id and i.id <> p_inscripcion_id
    ) then
      raise exception 'La persona tiene otras inscripciones asociadas; el documento no se puede cambiar automaticamente.';
    end if;
    if exists (
      select 1 from public.personas p
      where p.id <> v_insc.persona_id
        and upper(btrim(p.tipo_documento)) = upper(btrim(coalesce(v_insc.tipo_documento, '')))
        and btrim(p.n_documento) = v_nuevo
    ) then
      raise exception 'Ya existe otra persona con ese tipo y numero de documento.';
    end if;
  end if;

  begin
    foreach v_old_seg in array coalesce(p_old_segments, '{}'::text[]) loop
      if v_old_seg = p_new_segment then
        continue;
      end if;

      v_old_prefix := 'expedientes/' || v_old_seg || '/' || p_radicado_segment || '/';
      v_new_prefix := 'expedientes/' || p_new_segment || '/' || p_radicado_segment || '/';

      update public.inscripciones_documentos
      set storage_path = replace(storage_path, v_old_prefix, v_new_prefix)
      where inscripcion_id = p_inscripcion_id
        and position(v_old_prefix in storage_path) > 0;
      get diagnostics v_rows = row_count;
      v_docs_updated := v_docs_updated + v_rows;

      for v_col in
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'inscripciones'
          and data_type in ('text', 'character varying', 'jsonb', 'json')
          and column_name not in ('id', 'n_documento')
      loop
        if v_col.data_type in ('jsonb', 'json') then
          execute format(
            'update public.inscripciones set %1$I = replace(%1$I::text, $1, $2)::%2$s where id = $3 and position($1 in %1$I::text) > 0',
            v_col.column_name, v_col.data_type
          ) using v_old_prefix, v_new_prefix, p_inscripcion_id;
        else
          execute format(
            'update public.inscripciones set %1$I = replace(%1$I, $1, $2) where id = $3 and position($1 in %1$I) > 0',
            v_col.column_name
          ) using v_old_prefix, v_new_prefix, p_inscripcion_id;
        end if;
        get diagnostics v_rows = row_count;
        if v_rows > 0 and not (v_col.column_name = any (v_columns)) then
          v_columns := array_append(v_columns, v_col.column_name);
        end if;
      end loop;
    end loop;

    update public.inscripciones
    set n_documento = v_nuevo,
        datos_formulario = case
          when datos_formulario is not null and jsonb_typeof(datos_formulario) = 'object'
            then jsonb_set(datos_formulario, '{n_documento}', to_jsonb(v_nuevo), true)
          else datos_formulario
        end
    where id = p_inscripcion_id;

    if v_insc.persona_id is not null then
      update public.personas set n_documento = v_nuevo where id = v_insc.persona_id;
    end if;
  exception
    when unique_violation then
      raise exception 'Ya existe una inscripcion o persona con ese documento en la misma convocatoria.' using errcode = '23505';
  end;

  insert into public.portal_beneficiario_bitacora (
    inscripcion_id, actor_user_id, tipo_evento, categoria, accion,
    campo_cambio, estado_anterior, estado_nuevo, nota, metadata
  ) values (
    p_inscripcion_id, p_actor_user_id, 'correccion_documento_aspirante', 'datos_personales',
    'Corrigio numero de documento del aspirante', 'n_documento',
    jsonb_build_object('n_documento', v_insc.n_documento),
    jsonb_build_object('n_documento', v_nuevo),
    btrim(p_motivo),
    jsonb_build_object(
      'radicado', v_insc.radicado,
      'segmentos_anteriores', to_jsonb(coalesce(p_old_segments, '{}'::text[])),
      'segmento_nuevo', p_new_segment,
      'rutas', coalesce(p_rutas, '[]'::jsonb),
      'documentos_actualizados', v_docs_updated,
      'columnas_actualizadas', to_jsonb(v_columns)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'inscripcion_id', p_inscripcion_id,
    'documento_anterior', v_insc.n_documento,
    'documento_nuevo', v_nuevo,
    'documentos_actualizados', v_docs_updated,
    'columnas_actualizadas', to_jsonb(v_columns)
  );
end;
$$;

revoke all on function public.admin_corregir_documento_aspirante_aplicar(uuid, text, text[], text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_corregir_documento_aspirante_aplicar(uuid, text, text[], text, text, uuid, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
