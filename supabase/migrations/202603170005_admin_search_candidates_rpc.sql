create or replace function public.admin_search_users_for_management(
  p_query text default null,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  email text,
  nombre_sugerido text,
  last_sign_in_at timestamptz,
  is_portal_admin boolean,
  admin_role text,
  admin_is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_portal_super_admin(v_actor) then
    raise exception 'Solo un super administrador puede consultar usuarios para gestión administrativa.';
  end if;

  return query
  select
    u.id as user_id,
    lower(coalesce(u.email, '')) as email,
    coalesce(
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    ) as nombre_sugerido,
    u.last_sign_in_at,
    (a.user_id is not null) as is_portal_admin,
    a.role as admin_role,
    a.is_active as admin_is_active
  from auth.users u
  left join public.portal_admin_users a on a.user_id = u.id
  where (
    v_query = ''
    or lower(coalesce(u.email, '')) like '%' || v_query || '%'
    or lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')) like '%' || v_query || '%'
  )
  order by
    case
      when lower(coalesce(u.email, '')) = v_query then 0
      when lower(coalesce(u.email, '')) like v_query || '%' then 1
      else 2
    end,
    coalesce(u.last_sign_in_at, u.created_at) desc
  limit v_limit;
end;
$$;