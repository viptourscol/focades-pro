begin;

drop view if exists public.vw_catalog_departamentos_colombia;
create view public.vw_catalog_departamentos_colombia
with (security_invoker = true) as
select
  d.id,
  d.nombre
from public.catalog_departamentos_colombia d;

drop view if exists public.vw_catalog_municipios_colombia;
create view public.vw_catalog_municipios_colombia
with (security_invoker = true) as
select
  m.id,
  m.nombre,
  d.nombre as departamento
from public.catalog_municipios_colombia m
join public.catalog_departamentos_colombia d on d.id = m.departamento_id;

drop view if exists public.vw_catalog_establecimientos;
create view public.vw_catalog_establecimientos
with (security_invoker = true) as
select
  e.id,
  e.nombre,
  e.activo,
  m.nombre as municipio,
  d.nombre as departamento
from public.catalog_establecimientos_educativos e
left join public.catalog_municipios_colombia m on m.id = e.municipio_id
left join public.catalog_departamentos_colombia d on d.id = m.departamento_id;

grant select on public.vw_catalog_departamentos_colombia to anon, authenticated;
grant select on public.vw_catalog_municipios_colombia to anon, authenticated;
grant select on public.vw_catalog_establecimientos to anon, authenticated;

create or replace function public.lookup_inscripcion_publica_status(p_radicado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := upper(btrim(coalesce(p_radicado, '')));
  v_row public.inscripciones%rowtype;
  v_bank_uploaded_at timestamptz := null;
  v_bank_storage_path text := '';
begin
  if v_query = '' then
    return null;
  end if;

  select *
    into v_row
  from public.inscripciones i
  where upper(btrim(coalesce(i.radicado, ''))) = v_query
  order by coalesce(i.updated_at, i.created_at) desc
  limit 1;

  if v_row.id is null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inscripciones'
        and column_name = 'numero_radicado'
    ) then
    execute $sql$
      select *
      from public.inscripciones i
      where upper(btrim(coalesce(i.numero_radicado, ''))) = $1
      order by coalesce(i.updated_at, i.created_at) desc
      limit 1
    $sql$
    into v_row
    using v_query;
  end if;

  if v_row.id is null then
    return null;
  end if;

  if to_regclass('public.inscripciones_documentos') is not null then
    begin
      execute $sql$
        select
          coalesce(d.uploaded_at, d.created_at, d.updated_at) as uploaded_at,
          coalesce(d.storage_path, '') as storage_path
        from public.inscripciones_documentos d
        where d.inscripcion_id = $1
          and d.tipo_documento = 'certificado_bancario'
        order by coalesce(d.uploaded_at, d.created_at, d.updated_at) desc nulls last
        limit 1
      $sql$
      into v_bank_uploaded_at, v_bank_storage_path
      using v_row.id;
    exception
      when undefined_column then
        execute $sql$
          select null::timestamptz as uploaded_at, coalesce(d.storage_path, '') as storage_path
          from public.inscripciones_documentos d
          where d.inscripcion_id = $1
            and d.tipo_documento = 'certificado_bancario'
          limit 1
        $sql$
        into v_bank_uploaded_at, v_bank_storage_path
        using v_row.id;
    end;
  end if;

  return jsonb_build_object(
    'radicado', coalesce(v_row.radicado, v_query),
    'documento', coalesce(v_row.n_documento, ''),
    'nombre_completo', coalesce(v_row.nombre_completo, ''),
    'modalidad', coalesce(v_row.modalidad, v_row.modalidad_aspira, 'No disponible'),
    'programa', coalesce(v_row.programa_academico, v_row.programa, v_row.institucion_superior, 'No disponible'),
    'estado', coalesce(v_row.estado, 'En revisión'),
    'observacion', coalesce(v_row.observacion_publica, v_row.observacion, v_row.observaciones, ''),
    'updated_at', coalesce(v_row.updated_at, v_row.created_at),
    'etapa', coalesce(v_row.etapa, 'aspirante'),
    'permite_reemplazo_soportes', coalesce(v_row.permite_reemplazo_soportes, false),
    'cert_bancario_requerido', coalesce(v_row.cert_bancario_requerido, false),
    'certificado_bancario_uploaded_at', v_bank_uploaded_at,
    'certificado_bancario_storage_path', coalesce(v_bank_storage_path, '')
  );
end;
$$;

revoke all on function public.lookup_inscripcion_publica_status(text) from public;
grant execute on function public.lookup_inscripcion_publica_status(text) to anon, authenticated;

do $$
begin
  if to_regclass('public.convocatorias') is not null then
    alter table public.convocatorias enable row level security;

    drop policy if exists convocatorias_public_read on public.convocatorias;
    create policy convocatorias_public_read
      on public.convocatorias
      for select
      to anon, authenticated
      using (
        coalesce(is_activa, false) = true
        or public.is_portal_admin(auth.uid())
      );

    drop policy if exists convocatorias_admin_all on public.convocatorias;
    create policy convocatorias_admin_all
      on public.convocatorias
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.inscripciones') is not null then
    alter table public.inscripciones enable row level security;

    drop policy if exists inscripciones_admin_all on public.inscripciones;
    create policy inscripciones_admin_all
      on public.inscripciones
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));

    drop policy if exists inscripciones_owner_read on public.inscripciones;
    create policy inscripciones_owner_read
      on public.inscripciones
      for select
      to authenticated
      using (
        lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );

    drop policy if exists inscripciones_owner_update on public.inscripciones;
    create policy inscripciones_owner_update
      on public.inscripciones
      for update
      to authenticated
      using (
        lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      with check (
        lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
  end if;
end
$$;

do $$
begin
  if to_regclass('public.personas') is not null then
    alter table public.personas enable row level security;

    drop policy if exists personas_admin_all on public.personas;
    create policy personas_admin_all
      on public.personas
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.actualizaciones_semestrales') is not null then
    alter table public.actualizaciones_semestrales enable row level security;

    drop policy if exists actualizaciones_semestrales_admin_all on public.actualizaciones_semestrales;
    create policy actualizaciones_semestrales_admin_all
      on public.actualizaciones_semestrales
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.pagos') is not null then
    alter table public.pagos enable row level security;

    drop policy if exists pagos_admin_all on public.pagos;
    create policy pagos_admin_all
      on public.pagos
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.configuracion') is not null then
    alter table public.configuracion enable row level security;

    drop policy if exists configuracion_admin_all on public.configuracion;
    create policy configuracion_admin_all
      on public.configuracion
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.bitacora') is not null then
    alter table public.bitacora enable row level security;

    drop policy if exists bitacora_admin_all on public.bitacora;
    create policy bitacora_admin_all
      on public.bitacora
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.import_staging') is not null then
    alter table public.import_staging enable row level security;

    drop policy if exists import_staging_admin_all on public.import_staging;
    create policy import_staging_admin_all
      on public.import_staging
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.stg_divipola_municipios') is not null then
    alter table public.stg_divipola_municipios enable row level security;

    drop policy if exists stg_divipola_municipios_admin_all on public.stg_divipola_municipios;
    create policy stg_divipola_municipios_admin_all
      on public.stg_divipola_municipios
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.otp_tokens') is not null then
    alter table public.otp_tokens enable row level security;

    drop policy if exists otp_tokens_admin_all on public.otp_tokens;
    create policy otp_tokens_admin_all
      on public.otp_tokens
      for all
      to authenticated
      using (public.is_portal_admin(auth.uid()))
      with check (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.portal_admin_auditoria') is not null then
    alter table public.portal_admin_auditoria enable row level security;

    drop policy if exists portal_admin_auditoria_admin_read on public.portal_admin_auditoria;
    create policy portal_admin_auditoria_admin_read
      on public.portal_admin_auditoria
      for select
      to authenticated
      using (public.is_portal_admin(auth.uid()));
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;