alter table public.portal_admin_users
  add column if not exists nombre_completo text,
  add column if not exists email text,
  add column if not exists role text not null default 'admin',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists notes text;

update public.portal_admin_users a
set
  email = coalesce(a.email, lower(nullif(trim(u.email), ''))),
  nombre_completo = coalesce(
    nullif(trim(a.nombre_completo), ''),
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))), '')
  ),
  role = case
    when a.created_by_user_id is null then 'super_admin'
    else coalesce(nullif(trim(a.role), ''), 'admin')
  end,
  is_active = coalesce(a.is_active, true),
  updated_at = coalesce(a.updated_at, now())
from auth.users u
where u.id = a.user_id;

alter table public.portal_admin_users
  drop constraint if exists portal_admin_users_role_check;

alter table public.portal_admin_users
  add constraint portal_admin_users_role_check
  check (role in ('super_admin', 'admin'));

create index if not exists idx_portal_admin_users_active
  on public.portal_admin_users(is_active, created_at desc);

create index if not exists idx_portal_admin_users_role
  on public.portal_admin_users(role, is_active);

create unique index if not exists idx_portal_admin_users_email_unique
  on public.portal_admin_users((lower(email)))
  where email is not null;

create table if not exists public.portal_admin_auditoria (
  id bigserial primary key,
  target_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_state jsonb,
  next_state jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_admin_auditoria_target
  on public.portal_admin_auditoria(target_user_id, created_at desc);

create index if not exists idx_portal_admin_auditoria_actor
  on public.portal_admin_auditoria(actor_user_id, created_at desc);

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
      and coalesce(a.is_active, true) = true
  );
$$;

create or replace function public.is_portal_super_admin(p_user_id uuid default auth.uid())
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
      and coalesce(a.is_active, true) = true
      and a.role = 'super_admin'
  );
$$;

create or replace function public.registrar_evento_portal_admin(
  p_target_user_id uuid,
  p_action text,
  p_previous_state jsonb default null,
  p_next_state jsonb default null,
  p_note text default null,
  p_actor_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portal_admin_auditoria (
    target_user_id,
    actor_user_id,
    action,
    previous_state,
    next_state,
    note
  )
  values (
    p_target_user_id,
    p_actor_user_id,
    coalesce(nullif(trim(p_action), ''), 'admin_updated'),
    p_previous_state,
    p_next_state,
    nullif(trim(p_note), '')
  );
end;
$$;

create or replace function public.admin_upsert_portal_admin(
  p_email text,
  p_role text default 'admin',
  p_nombre_completo text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, 'admin')));
  v_user auth.users%rowtype;
  v_existing public.portal_admin_users%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_resolved_name text;
begin
  if not public.is_portal_super_admin(v_actor) then
    raise exception 'Solo un super administrador puede gestionar administradores.';
  end if;

  if v_email = '' then
    raise exception 'Debes indicar el correo del administrador.';
  end if;

  if v_role not in ('super_admin', 'admin') then
    raise exception 'Rol inválido para administrador.';
  end if;

  select *
    into v_user
  from auth.users
  where lower(email) = v_email
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'No existe un usuario autenticado con ese correo. Debe iniciar sesión al menos una vez con Google antes de habilitarlo como administrador.'
    );
  end if;

  v_resolved_name := coalesce(
    nullif(trim(p_nombre_completo), ''),
    nullif(trim(coalesce(v_user.raw_user_meta_data ->> 'full_name', v_user.raw_user_meta_data ->> 'name', split_part(v_user.email, '@', 1))), '')
  );

  select *
    into v_existing
  from public.portal_admin_users
  where user_id = v_user.id
  for update;

  if found then
    v_before := to_jsonb(v_existing);

    update public.portal_admin_users
       set email = v_email,
           nombre_completo = coalesce(v_resolved_name, v_existing.nombre_completo),
           role = v_role,
           is_active = true,
           updated_at = now(),
           deactivated_at = null,
           deactivated_by_user_id = null,
           notes = coalesce(nullif(trim(p_note), ''), v_existing.notes)
     where user_id = v_user.id
     returning * into v_existing;

    v_after := to_jsonb(v_existing);
    v_action := case when coalesce((v_before ->> 'is_active')::boolean, true) = false then 'admin_reactivated' else 'admin_updated' end;
  else
    insert into public.portal_admin_users (
      user_id,
      nombre_completo,
      email,
      role,
      is_active,
      created_by_user_id,
      updated_at,
      notes
    )
    values (
      v_user.id,
      v_resolved_name,
      v_email,
      v_role,
      true,
      v_actor,
      now(),
      nullif(trim(p_note), '')
    )
    returning * into v_existing;

    v_after := to_jsonb(v_existing);
    v_action := 'admin_created';
  end if;

  perform public.registrar_evento_portal_admin(v_user.id, v_action, v_before, v_after, p_note, v_actor);

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'user_id', v_existing.user_id,
    'email', v_existing.email,
    'nombre_completo', v_existing.nombre_completo,
    'role', v_existing.role,
    'is_active', v_existing.is_active
  );
end;
$$;

create or replace function public.admin_update_portal_admin_role(
  p_target_user_id uuid,
  p_role text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_role, '')));
  v_row public.portal_admin_users%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_super_admin_count integer := 0;
begin
  if not public.is_portal_super_admin(v_actor) then
    raise exception 'Solo un super administrador puede cambiar roles.';
  end if;

  if v_role not in ('super_admin', 'admin') then
    raise exception 'Rol inválido.';
  end if;

  select *
    into v_row
  from public.portal_admin_users
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Administrador no encontrado.');
  end if;

  if v_row.user_id = v_actor and v_role <> 'super_admin' then
    raise exception 'No puedes degradarte a ti mismo.';
  end if;

  if v_row.role = 'super_admin' and v_role <> 'super_admin' and coalesce(v_row.is_active, true) = true then
    select count(*)
      into v_super_admin_count
    from public.portal_admin_users
    where role = 'super_admin'
      and coalesce(is_active, true) = true;

    if v_super_admin_count <= 1 then
      raise exception 'No puedes cambiar el rol del último super administrador activo.';
    end if;
  end if;

  v_before := to_jsonb(v_row);

  update public.portal_admin_users
     set role = v_role,
         updated_at = now(),
         notes = coalesce(nullif(trim(p_note), ''), notes)
   where user_id = p_target_user_id
   returning * into v_row;

  v_after := to_jsonb(v_row);
  perform public.registrar_evento_portal_admin(v_row.user_id, 'admin_role_updated', v_before, v_after, p_note, v_actor);

  return jsonb_build_object('ok', true, 'role', v_row.role, 'user_id', v_row.user_id);
end;
$$;

create or replace function public.admin_deactivate_portal_admin(
  p_target_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.portal_admin_users%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_super_admin_count integer := 0;
begin
  if not public.is_portal_super_admin(v_actor) then
    raise exception 'Solo un super administrador puede desactivar administradores.';
  end if;

  select *
    into v_row
  from public.portal_admin_users
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Administrador no encontrado.');
  end if;

  if v_row.user_id = v_actor then
    raise exception 'No puedes desactivarte a ti mismo.';
  end if;

  if coalesce(v_row.is_active, true) = false then
    return jsonb_build_object('ok', false, 'message', 'El administrador ya estaba inactivo.');
  end if;

  if v_row.role = 'super_admin' then
    select count(*)
      into v_super_admin_count
    from public.portal_admin_users
    where role = 'super_admin'
      and coalesce(is_active, true) = true;

    if v_super_admin_count <= 1 then
      raise exception 'No puedes desactivar al último super administrador activo.';
    end if;
  end if;

  v_before := to_jsonb(v_row);

  update public.portal_admin_users
     set is_active = false,
         updated_at = now(),
         deactivated_at = now(),
         deactivated_by_user_id = v_actor,
         notes = coalesce(nullif(trim(p_note), ''), notes)
   where user_id = p_target_user_id
   returning * into v_row;

  v_after := to_jsonb(v_row);
  perform public.registrar_evento_portal_admin(v_row.user_id, 'admin_deactivated', v_before, v_after, p_note, v_actor);

  return jsonb_build_object('ok', true, 'user_id', v_row.user_id, 'is_active', v_row.is_active);
end;
$$;

create or replace function public.admin_reactivate_portal_admin(
  p_target_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.portal_admin_users%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_portal_super_admin(v_actor) then
    raise exception 'Solo un super administrador puede reactivar administradores.';
  end if;

  select *
    into v_row
  from public.portal_admin_users
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Administrador no encontrado.');
  end if;

  if coalesce(v_row.is_active, true) = true then
    return jsonb_build_object('ok', false, 'message', 'El administrador ya está activo.');
  end if;

  v_before := to_jsonb(v_row);

  update public.portal_admin_users
     set is_active = true,
         updated_at = now(),
         deactivated_at = null,
         deactivated_by_user_id = null,
         notes = coalesce(nullif(trim(p_note), ''), notes)
   where user_id = p_target_user_id
   returning * into v_row;

  v_after := to_jsonb(v_row);
  perform public.registrar_evento_portal_admin(v_row.user_id, 'admin_reactivated', v_before, v_after, p_note, v_actor);

  return jsonb_build_object('ok', true, 'user_id', v_row.user_id, 'is_active', v_row.is_active);
end;
$$;

drop policy if exists portal_admin_users_self_select on public.portal_admin_users;
drop policy if exists portal_admin_users_admin_select on public.portal_admin_users;

create policy portal_admin_users_admin_select
  on public.portal_admin_users for select
  to authenticated
  using (user_id = auth.uid() or public.is_portal_admin(auth.uid()));
