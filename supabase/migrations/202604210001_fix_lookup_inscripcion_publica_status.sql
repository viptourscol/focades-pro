-- Reescribe lookup_inscripcion_publica_status para ser tolerante a columnas faltantes.
-- La versión anterior referenciaba columnas que pueden no existir en `inscripciones`
-- (modalidad_aspira, observacion_publica, etapa, etc.) y fallaba en runtime con HTTP 400.

create or replace function public.lookup_inscripcion_publica_status(p_radicado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := upper(btrim(coalesce(p_radicado, '')));
  v_row_json jsonb;
  v_id uuid;
  v_bank_uploaded_at timestamptz := null;
  v_bank_storage_path text := '';
begin
  if v_query = '' then
    return null;
  end if;

  -- Buscar por radicado primero
  execute $sql$
    select to_jsonb(i)
    from public.inscripciones i
    where upper(btrim(coalesce(i.radicado, ''))) = $1
    order by coalesce(i.updated_at, i.created_at) desc
    limit 1
  $sql$
  into v_row_json
  using v_query;

  -- Fallback: buscar por numero_radicado si la columna existe
  if v_row_json is null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inscripciones'
        and column_name = 'numero_radicado'
    ) then
    execute $sql$
      select to_jsonb(i)
      from public.inscripciones i
      where upper(btrim(coalesce(i.numero_radicado, ''))) = $1
      order by coalesce(i.updated_at, i.created_at) desc
      limit 1
    $sql$
    into v_row_json
    using v_query;
  end if;

  if v_row_json is null then
    return null;
  end if;

  -- Resolver id para consultas adicionales
  begin
    v_id := (v_row_json ->> 'id')::uuid;
  exception when others then
    v_id := null;
  end;

  -- Buscar info del certificado bancario si la tabla existe
  if v_id is not null and to_regclass('public.inscripciones_documentos') is not null then
    begin
      execute $sql$
        select
          coalesce(d.uploaded_at, d.created_at, d.updated_at),
          coalesce(d.storage_path, '')
        from public.inscripciones_documentos d
        where d.inscripcion_id = $1
          and d.tipo_documento = 'certificado_bancario'
        order by coalesce(d.uploaded_at, d.created_at, d.updated_at) desc nulls last
        limit 1
      $sql$
      into v_bank_uploaded_at, v_bank_storage_path
      using v_id;
    exception
      when undefined_column then
        begin
          execute $sql$
            select null::timestamptz, coalesce(d.storage_path, '')
            from public.inscripciones_documentos d
            where d.inscripcion_id = $1
              and d.tipo_documento = 'certificado_bancario'
            limit 1
          $sql$
          into v_bank_uploaded_at, v_bank_storage_path
          using v_id;
        exception when others then
          v_bank_uploaded_at := null;
          v_bank_storage_path := '';
        end;
      when others then
        v_bank_uploaded_at := null;
        v_bank_storage_path := '';
    end;
  end if;

  -- Construir respuesta usando to_jsonb (tolerante a columnas faltantes)
  return jsonb_build_object(
    'radicado', coalesce(v_row_json ->> 'radicado', v_query),
    'documento', coalesce(v_row_json ->> 'n_documento', v_row_json ->> 'documento_persona', ''),
    'nombre_completo', coalesce(v_row_json ->> 'nombre_completo', ''),
    'modalidad', coalesce(
      nullif(v_row_json ->> 'modalidad', ''),
      nullif(v_row_json ->> 'modalidad_aspira', ''),
      'No disponible'
    ),
    'programa', coalesce(
      nullif(v_row_json ->> 'programa_academico', ''),
      nullif(v_row_json ->> 'programa', ''),
      nullif(v_row_json ->> 'institucion_superior', ''),
      'No disponible'
    ),
    'estado', coalesce(nullif(v_row_json ->> 'estado', ''), 'En revisión'),
    'observacion', coalesce(
      nullif(v_row_json ->> 'observacion_publica', ''),
      nullif(v_row_json ->> 'observacion', ''),
      nullif(v_row_json ->> 'observaciones', ''),
      ''
    ),
    'updated_at', coalesce(v_row_json ->> 'updated_at', v_row_json ->> 'created_at'),
    'etapa', coalesce(nullif(v_row_json ->> 'etapa', ''), 'aspirante'),
    'permite_reemplazo_soportes', coalesce((v_row_json ->> 'permite_reemplazo_soportes')::boolean, false),
    'cert_bancario_requerido', coalesce((v_row_json ->> 'cert_bancario_requerido')::boolean, false),
    'certificado_bancario_uploaded_at', v_bank_uploaded_at,
    'certificado_bancario_storage_path', coalesce(v_bank_storage_path, '')
  );
exception
  when others then
    -- Si algo falla inesperadamente, devolver null en lugar de 400
    raise notice 'lookup_inscripcion_publica_status error: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.lookup_inscripcion_publica_status(text) from public;
grant execute on function public.lookup_inscripcion_publica_status(text) to anon, authenticated;
