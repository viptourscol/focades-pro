-- Reporte admin de beneficiarios sin actualizar + auditoría de campañas de notificación

create index if not exists idx_portal_actualizaciones_ventana_beneficiario_created
  on public.portal_actualizaciones(ventana_id, beneficiario_id, created_at desc, id desc);

create table if not exists public.portal_notificacion_campanias (
  id bigserial primary key,
  ventana_id bigint references public.portal_ventanas_actualizacion(id) on delete set null,
  plantilla_codigo text not null,
  plantilla_nombre text not null,
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  total_fallidos integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (plantilla_codigo in ('ultimo_aviso', 'cierre_periodo_sin_pago'))
);

create table if not exists public.portal_notificacion_campania_detalles (
  id bigserial primary key,
  campania_id bigint not null references public.portal_notificacion_campanias(id) on delete cascade,
  beneficiario_id bigint references public.portal_beneficiarios(id) on delete set null,
  email text,
  nombre_completo text,
  estado_envio text not null default 'pendiente',
  proveedor_id text,
  error_detalle text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (estado_envio in ('pendiente','enviado','fallido'))
);

create index if not exists idx_portal_notif_campanias_created_at
  on public.portal_notificacion_campanias(created_at desc);

create index if not exists idx_portal_notif_detalles_campania
  on public.portal_notificacion_campania_detalles(campania_id, created_at desc);

alter table public.portal_notificacion_campanias enable row level security;
alter table public.portal_notificacion_campania_detalles enable row level security;

drop policy if exists portal_notificacion_campanias_admin_all on public.portal_notificacion_campanias;
create policy portal_notificacion_campanias_admin_all
  on public.portal_notificacion_campanias for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

drop policy if exists portal_notificacion_detalles_admin_all on public.portal_notificacion_campania_detalles;
create policy portal_notificacion_detalles_admin_all
  on public.portal_notificacion_campania_detalles for all
  to authenticated
  using (public.is_portal_admin(auth.uid()))
  with check (public.is_portal_admin(auth.uid()));

create or replace function public.admin_beneficiarios_sin_actualizar(
  p_ventana_id bigint,
  p_query text default null,
  p_limit integer default 2000
)
returns table (
  beneficiario_id bigint,
  nombre_completo text,
  n_documento text,
  email text,
  estado_beneficiario text,
  ventana_id bigint,
  ventana_nombre text,
  tipo_alerta text,
  ultimo_estado_actualizacion text,
  ultima_actualizacion_id bigint,
  ultima_actualizacion_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 2000), 10000));
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if p_ventana_id is null then
    raise exception 'Debe indicar el periodo (ventana_id).' using errcode = 'P0001';
  end if;

  if not public.is_portal_admin(auth.uid()) then
    raise exception 'Solo administradores pueden consultar este reporte.' using errcode = '42501';
  end if;

  return query
  with ventana_sel as (
    select v.id, v.nombre
    from public.portal_ventanas_actualizacion v
    where v.id = p_ventana_id
  ),
  ultimas as (
    select distinct on (a.beneficiario_id)
      a.beneficiario_id,
      a.id as actualizacion_id,
      a.estado,
      a.created_at
    from public.portal_actualizaciones a
    where a.ventana_id = p_ventana_id
    order by a.beneficiario_id, a.created_at desc, a.id desc
  )
  select
    b.id as beneficiario_id,
    b.nombre_completo,
    b.n_documento,
    lower(b.email) as email,
    b.estado_beneficiario,
    v.id as ventana_id,
    v.nombre as ventana_nombre,
    case
      when u.actualizacion_id is null then 'no_enviado'
      when u.estado = 'rechazada' then 'rechazada'
      else 'ok'
    end as tipo_alerta,
    u.estado as ultimo_estado_actualizacion,
    u.actualizacion_id as ultima_actualizacion_id,
    u.created_at as ultima_actualizacion_at
  from public.portal_beneficiarios b
  cross join ventana_sel v
  left join ultimas u on u.beneficiario_id = b.id
  where b.deleted_at is null
    and b.estado_beneficiario = 'activo'
    and (u.actualizacion_id is null or u.estado = 'rechazada')
    and (
      v_query is null
      or lower(coalesce(b.nombre_completo, '')) like ('%' || lower(v_query) || '%')
      or lower(coalesce(b.n_documento, '')) like ('%' || lower(v_query) || '%')
      or lower(coalesce(b.email, '')) like ('%' || lower(v_query) || '%')
    )
  order by b.nombre_completo nulls last, b.id
  limit v_limit;
end;
$$;

revoke all on function public.admin_beneficiarios_sin_actualizar(bigint, text, integer) from public;
grant execute on function public.admin_beneficiarios_sin_actualizar(bigint, text, integer) to authenticated;
