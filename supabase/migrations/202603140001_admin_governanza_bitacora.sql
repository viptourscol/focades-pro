-- Gobernanza administrativa: soft delete beneficiarios, asignación de revisores y bitácora unificada.

create or replace function public.is_portal_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_admin_users a
    where a.user_id = p_user_id
  );
$$;

alter table public.portal_beneficiarios
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text,
  add column if not exists deletion_note text;

create index if not exists idx_portal_beneficiarios_deleted_at
  on public.portal_beneficiarios(deleted_at);

create table if not exists public.portal_beneficiario_eliminaciones (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  deleted_by_user_id uuid references auth.users(id) on delete set null,
  motivo text not null,
  nota text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_aspirante_revisor_asignaciones (
  id bigserial primary key,
  inscripcion_id uuid not null references public.inscripciones(id) on delete cascade,
  revisor_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  note text,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_aspirante_revisor_asig_inscripcion
  on public.portal_aspirante_revisor_asignaciones(inscripcion_id, assigned_at desc);

create index if not exists idx_aspirante_revisor_asig_active
  on public.portal_aspirante_revisor_asignaciones(inscripcion_id, is_active)
  where is_active = true;

create table if not exists public.portal_actualizacion_revisor_asignaciones (
  id bigserial primary key,
  actualizacion_id bigint not null references public.portal_actualizaciones(id) on delete cascade,
  revisor_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  note text,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_actualizacion_revisor_asig_actualizacion
  on public.portal_actualizacion_revisor_asignaciones(actualizacion_id, assigned_at desc);

create index if not exists idx_actualizacion_revisor_asig_active
  on public.portal_actualizacion_revisor_asignaciones(actualizacion_id, is_active)
  where is_active = true;

alter table public.inscripciones
  add column if not exists revisor_asignado_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revisor_asignado_at timestamptz;

alter table public.portal_actualizaciones
  add column if not exists revisor_asignado_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revisor_asignado_at timestamptz;

create table if not exists public.portal_beneficiario_bitacora (
  id bigserial primary key,
  beneficiario_id bigint references public.portal_beneficiarios(id) on delete set null,
  inscripcion_id uuid references public.inscripciones(id) on delete set null,
  actualizacion_id bigint references public.portal_actualizaciones(id) on delete set null,
  tipo_evento text not null,
  categoria text not null default 'general',
  accion text not null default 'update',
  campo_cambio text,
  estado_anterior jsonb,
  estado_nuevo jsonb,
  nota text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_bitacora_beneficiario
  on public.portal_beneficiario_bitacora(beneficiario_id, created_at desc);

create index if not exists idx_portal_bitacora_inscripcion
  on public.portal_beneficiario_bitacora(inscripcion_id, created_at desc);

create index if not exists idx_portal_bitacora_actualizacion
  on public.portal_beneficiario_bitacora(actualizacion_id, created_at desc);

create index if not exists idx_portal_bitacora_actor
  on public.portal_beneficiario_bitacora(actor_user_id, created_at desc);

create index if not exists idx_portal_bitacora_tipo
  on public.portal_beneficiario_bitacora(tipo_evento, created_at desc);

create or replace function public.registrar_evento_bitacora(
  p_beneficiario_id bigint default null,
  p_inscripcion_id uuid default null,
  p_actualizacion_id bigint default null,
  p_tipo_evento text default 'evento',
  p_categoria text default 'general',
  p_accion text default 'update',
  p_campo_cambio text default null,
  p_estado_anterior jsonb default null,
  p_estado_nuevo jsonb default null,
  p_nota text default null,
  p_actor_user_id uuid default auth.uid(),
  p_actor_email text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portal_beneficiario_bitacora (
    beneficiario_id,
    inscripcion_id,
    actualizacion_id,
    tipo_evento,
    categoria,
    accion,
    campo_cambio,
    estado_anterior,
    estado_nuevo,
    nota,
    actor_user_id,
    actor_email,
    metadata
  )
  values (
    p_beneficiario_id,
    p_inscripcion_id,
    p_actualizacion_id,
    coalesce(nullif(trim(p_tipo_evento), ''), 'evento'),
    coalesce(nullif(trim(p_categoria), ''), 'general'),
    coalesce(nullif(trim(p_accion), ''), 'update'),
    p_campo_cambio,
    p_estado_anterior,
    p_estado_nuevo,
    p_nota,
    p_actor_user_id,
    p_actor_email,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.soft_delete_beneficiario(
  p_beneficiario_id bigint,
  p_reason text,
  p_note text default null,
  p_confirm text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.portal_beneficiarios%rowtype;
  v_updates_count integer := 0;
  v_pagos_count integer := 0;
  v_result jsonb;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden eliminar beneficiarios.';
  end if;

  if coalesce(trim(p_confirm), '') <> 'ELIMINAR' then
    raise exception 'Confirmación inválida. Debe enviar ELIMINAR.';
  end if;

  select *
    into v_row
  from public.portal_beneficiarios
  where id = p_beneficiario_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Beneficiario no encontrado.');
  end if;

  if v_row.deleted_at is not null then
    return jsonb_build_object('ok', false, 'message', 'El beneficiario ya estaba eliminado.');
  end if;

  select count(*) into v_updates_count
    from public.portal_actualizaciones
   where beneficiario_id = p_beneficiario_id;

  select count(*) into v_pagos_count
    from public.portal_beneficiario_pagos
   where beneficiario_id = p_beneficiario_id;

  update public.portal_beneficiarios
     set deleted_at = now(),
         deleted_by_user_id = v_actor,
         deletion_reason = coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa'),
         deletion_note = nullif(trim(p_note), ''),
         estado_beneficiario = 'retirado',
         updated_at = now()
   where id = p_beneficiario_id;

  insert into public.portal_beneficiario_eliminaciones(
    beneficiario_id,
    deleted_by_user_id,
    motivo,
    nota,
    snapshot
  )
  values (
    p_beneficiario_id,
    v_actor,
    coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa'),
    nullif(trim(p_note), ''),
    to_jsonb(v_row)
  );

  perform public.registrar_evento_bitacora(
    p_beneficiario_id := p_beneficiario_id,
    p_inscripcion_id := v_row.inscripcion_pk,
    p_tipo_evento := 'beneficiario_eliminado',
    p_categoria := 'beneficiario',
    p_accion := 'soft_delete',
    p_estado_anterior := jsonb_build_object('estado_beneficiario', v_row.estado_beneficiario, 'deleted_at', null),
    p_estado_nuevo := jsonb_build_object('estado_beneficiario', 'retirado', 'deleted_at', now()),
    p_nota := coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa'),
    p_actor_user_id := v_actor,
    p_metadata := jsonb_build_object(
      'actualizaciones_relacionadas', v_updates_count,
      'pagos_relacionados', v_pagos_count,
      'confirm', p_confirm
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'message', 'Beneficiario marcado como eliminado.',
    'related_updates', v_updates_count,
    'related_payments', v_pagos_count
  );

  return v_result;
end;
$$;

create or replace function public.restore_beneficiario(
  p_beneficiario_id bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prev_deleted_at timestamptz;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden restaurar beneficiarios.';
  end if;

  select deleted_at into v_prev_deleted_at
  from public.portal_beneficiarios
  where id = p_beneficiario_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Beneficiario no encontrado.');
  end if;

  if v_prev_deleted_at is null then
    return jsonb_build_object('ok', false, 'message', 'El beneficiario no está eliminado.');
  end if;

  update public.portal_beneficiarios
     set deleted_at = null,
         deleted_by_user_id = null,
         deletion_reason = null,
         deletion_note = null,
         updated_at = now()
   where id = p_beneficiario_id;

  perform public.registrar_evento_bitacora(
    p_beneficiario_id := p_beneficiario_id,
    p_tipo_evento := 'beneficiario_restaurado',
    p_categoria := 'beneficiario',
    p_accion := 'restore',
    p_nota := nullif(trim(p_note), ''),
    p_actor_user_id := v_actor,
    p_metadata := jsonb_build_object('previous_deleted_at', v_prev_deleted_at)
  );

  return jsonb_build_object('ok', true, 'message', 'Beneficiario restaurado.');
end;
$$;

create or replace function public.asignar_revisor_aspirante(
  p_inscripcion_id uuid,
  p_revisor_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_previous uuid;
  v_beneficiario_id bigint;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden asignar revisores.';
  end if;

  if p_revisor_user_id is null then
    raise exception 'Debes seleccionar un revisor.';
  end if;

  if not exists (select 1 from public.portal_admin_users a where a.user_id = p_revisor_user_id) then
    raise exception 'El revisor seleccionado no es administrador del portal.';
  end if;

  select revisor_asignado_user_id, beneficiario_portal_id
    into v_previous, v_beneficiario_id
  from public.inscripciones
  where id = p_inscripcion_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Inscripción no encontrada.');
  end if;

  update public.portal_aspirante_revisor_asignaciones
     set is_active = false,
         ended_at = now()
   where inscripcion_id = p_inscripcion_id
     and is_active = true;

  insert into public.portal_aspirante_revisor_asignaciones(
    inscripcion_id,
    revisor_user_id,
    assigned_by_user_id,
    note,
    is_active,
    assigned_at
  )
  values (
    p_inscripcion_id,
    p_revisor_user_id,
    v_actor,
    nullif(trim(p_note), ''),
    true,
    now()
  );

  update public.inscripciones
     set revisor_asignado_user_id = p_revisor_user_id,
         revisor_asignado_at = now(),
         updated_at = now()
   where id = p_inscripcion_id;

  perform public.registrar_evento_bitacora(
    p_beneficiario_id := v_beneficiario_id,
    p_inscripcion_id := p_inscripcion_id,
    p_tipo_evento := 'revisor_asignado_aspirante',
    p_categoria := 'asignacion',
    p_accion := case when v_previous is null then 'create' else 'update' end,
    p_estado_anterior := jsonb_build_object('revisor_asignado_user_id', v_previous),
    p_estado_nuevo := jsonb_build_object('revisor_asignado_user_id', p_revisor_user_id),
    p_nota := nullif(trim(p_note), ''),
    p_actor_user_id := v_actor
  );

  return jsonb_build_object('ok', true, 'message', 'Revisor asignado al aspirante.');
end;
$$;

create or replace function public.asignar_revisor_actualizacion(
  p_actualizacion_id bigint,
  p_revisor_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_previous uuid;
  v_beneficiario_id bigint;
begin
  if not public.is_portal_admin(v_actor) then
    raise exception 'Solo administradores pueden asignar revisores.';
  end if;

  if p_revisor_user_id is null then
    raise exception 'Debes seleccionar un revisor.';
  end if;

  if not exists (select 1 from public.portal_admin_users a where a.user_id = p_revisor_user_id) then
    raise exception 'El revisor seleccionado no es administrador del portal.';
  end if;

  select revisor_asignado_user_id, beneficiario_id
    into v_previous, v_beneficiario_id
  from public.portal_actualizaciones
  where id = p_actualizacion_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Actualización no encontrada.');
  end if;

  update public.portal_actualizacion_revisor_asignaciones
     set is_active = false,
         ended_at = now()
   where actualizacion_id = p_actualizacion_id
     and is_active = true;

  insert into public.portal_actualizacion_revisor_asignaciones(
    actualizacion_id,
    revisor_user_id,
    assigned_by_user_id,
    note,
    is_active,
    assigned_at
  )
  values (
    p_actualizacion_id,
    p_revisor_user_id,
    v_actor,
    nullif(trim(p_note), ''),
    true,
    now()
  );

  update public.portal_actualizaciones
     set revisor_asignado_user_id = p_revisor_user_id,
         revisor_asignado_at = now(),
         updated_at = now()
   where id = p_actualizacion_id;

  perform public.registrar_evento_bitacora(
    p_beneficiario_id := v_beneficiario_id,
    p_actualizacion_id := p_actualizacion_id,
    p_tipo_evento := 'revisor_asignado_actualizacion',
    p_categoria := 'asignacion',
    p_accion := case when v_previous is null then 'create' else 'update' end,
    p_estado_anterior := jsonb_build_object('revisor_asignado_user_id', v_previous),
    p_estado_nuevo := jsonb_build_object('revisor_asignado_user_id', p_revisor_user_id),
    p_nota := nullif(trim(p_note), ''),
    p_actor_user_id := v_actor
  );

  return jsonb_build_object('ok', true, 'message', 'Revisor asignado a la actualización.');
end;
$$;

create or replace function public.trg_log_portal_actualizaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento_bitacora(
      p_beneficiario_id := new.beneficiario_id,
      p_actualizacion_id := new.id,
      p_tipo_evento := 'actualizacion_creada',
      p_categoria := 'actualizacion',
      p_accion := 'create',
      p_estado_nuevo := to_jsonb(new),
      p_actor_user_id := auth.uid()
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (old.estado is distinct from new.estado)
      or (old.observacion_admin is distinct from new.observacion_admin)
      or (old.revisado_por_user_id is distinct from new.revisado_por_user_id)
      or (old.revisor_asignado_user_id is distinct from new.revisor_asignado_user_id) then
      perform public.registrar_evento_bitacora(
        p_beneficiario_id := new.beneficiario_id,
        p_actualizacion_id := new.id,
        p_tipo_evento := 'actualizacion_actualizada',
        p_categoria := 'actualizacion',
        p_accion := 'update',
        p_estado_anterior := jsonb_build_object(
          'estado', old.estado,
          'observacion_admin', old.observacion_admin,
          'revisado_por_user_id', old.revisado_por_user_id,
          'revisor_asignado_user_id', old.revisor_asignado_user_id
        ),
        p_estado_nuevo := jsonb_build_object(
          'estado', new.estado,
          'observacion_admin', new.observacion_admin,
          'revisado_por_user_id', new.revisado_por_user_id,
          'revisor_asignado_user_id', new.revisor_asignado_user_id
        ),
        p_actor_user_id := auth.uid()
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_portal_actualizaciones_bitacora on public.portal_actualizaciones;
create trigger trg_portal_actualizaciones_bitacora
  after insert or update on public.portal_actualizaciones
  for each row
  execute function public.trg_log_portal_actualizaciones();

create or replace function public.trg_log_portal_beneficiarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (old.email is distinct from new.email)
      or (old.telefono is distinct from new.telefono)
      or (old.direccion is distinct from new.direccion)
      or (old.estado_beneficiario is distinct from new.estado_beneficiario)
      or (old.deleted_at is distinct from new.deleted_at) then
      perform public.registrar_evento_bitacora(
        p_beneficiario_id := new.id,
        p_inscripcion_id := new.inscripcion_pk,
        p_tipo_evento := 'beneficiario_actualizado',
        p_categoria := 'beneficiario',
        p_accion := 'update',
        p_estado_anterior := jsonb_build_object(
          'email', old.email,
          'telefono', old.telefono,
          'direccion', old.direccion,
          'estado_beneficiario', old.estado_beneficiario,
          'deleted_at', old.deleted_at
        ),
        p_estado_nuevo := jsonb_build_object(
          'email', new.email,
          'telefono', new.telefono,
          'direccion', new.direccion,
          'estado_beneficiario', new.estado_beneficiario,
          'deleted_at', new.deleted_at
        ),
        p_actor_user_id := auth.uid()
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_portal_beneficiarios_bitacora on public.portal_beneficiarios;
create trigger trg_portal_beneficiarios_bitacora
  after update on public.portal_beneficiarios
  for each row
  execute function public.trg_log_portal_beneficiarios();

alter table public.portal_beneficiario_eliminaciones enable row level security;
alter table public.portal_aspirante_revisor_asignaciones enable row level security;
alter table public.portal_actualizacion_revisor_asignaciones enable row level security;
alter table public.portal_beneficiario_bitacora enable row level security;

drop policy if exists portal_benef_eliminaciones_admin_all on public.portal_beneficiario_eliminaciones;
create policy portal_benef_eliminaciones_admin_all
  on public.portal_beneficiario_eliminaciones for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_aspirante_revisor_admin_all on public.portal_aspirante_revisor_asignaciones;
create policy portal_aspirante_revisor_admin_all
  on public.portal_aspirante_revisor_asignaciones for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_actualizacion_revisor_admin_all on public.portal_actualizacion_revisor_asignaciones;
create policy portal_actualizacion_revisor_admin_all
  on public.portal_actualizacion_revisor_asignaciones for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_bitacora_admin_all on public.portal_beneficiario_bitacora;
create policy portal_bitacora_admin_all
  on public.portal_beneficiario_bitacora for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_bitacora_beneficiario_own_read on public.portal_beneficiario_bitacora;
create policy portal_bitacora_beneficiario_own_read
  on public.portal_beneficiario_bitacora for select
  to authenticated
  using (
    beneficiario_id in (
      select b.id
      from public.portal_beneficiarios b
      where b.auth_user_id = auth.uid()
    )
  );
