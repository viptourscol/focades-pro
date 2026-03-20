-- Nueva tabla: Portal de notificaciones a beneficiarios
-- Almacena el historial de notificaciones enviadas por correo para que se vean en el portal

create table if not exists public.portal_notificaciones_beneficiarios (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  
  -- Tipo de notificación
  tipo text not null check (tipo in (
    'actualización_confirmada',
    'actualización_rechazada',
    'actualización_aprobada',
    'documentos_incompletos',
    'plazo_próximo',
    'elegibilidad_confirmada',
    'pago_efectuado',
    'anuncio_general',
    'estados_vigente'
  )),
  
  -- Contenido
  titulo text not null,
  descripcion text,
  estado_actualizacion_id bigint references public.portal_actualizaciones(id) on delete set null,
  
  -- Datos adjuntos al contexto
  contexto jsonb not null default '{}'::jsonb,
  -- Ejemplo: {"documentos_faltantes": ["certificado_notas"], "plazo_cierre": "2026-03-20T23:59:00Z", "monto_elegible": 500000}
  
  -- Control de lectura
  leida boolean not null default false,
  leida_at timestamptz,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_portal_notif_beneficiario 
  on public.portal_notificaciones_beneficiarios(beneficiario_id, created_at desc);

create index if not exists idx_portal_notif_leida 
  on public.portal_notificaciones_beneficiarios(beneficiario_id, leida, created_at desc);

create index if not exists idx_portal_notif_tipo 
  on public.portal_notificaciones_beneficiarios(beneficiario_id, tipo, created_at desc);

-- RLS (Row Level Security)
alter table public.portal_notificaciones_beneficiarios enable row level security;

create policy "Beneficiarios ven solo sus notificaciones"
  on public.portal_notificaciones_beneficiarios
  for select
  using (
    auth.uid() in (
      select auth_user_id from public.portal_beneficiarios where id = beneficiario_id
    )
  );

create policy "Solo admins pueden insertar notificaciones"
  on public.portal_notificaciones_beneficiarios
  for insert
  with check (
    exists (select 1 from public.portal_admin_users where user_id = auth.uid())
  );

create policy "Solo admins pueden actualizar notificaciones"
  on public.portal_notificaciones_beneficiarios
  for update
  using (
    exists (select 1 from public.portal_admin_users where user_id = auth.uid())
  );

-- Trigger para actualizar updated_at
create or replace function public.update_portal_notif_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_portal_notif_updated_at
  before update on public.portal_notificaciones_beneficiarios
  for each row
  execute function public.update_portal_notif_updated_at();

-- Trigger para marcar como leída
create or replace function public.mark_notification_read()
returns trigger
language plpgsql
as $$
begin
  if new.leida = true and old.leida = false then
    new.leida_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_mark_notif_read
  before update on public.portal_notificaciones_beneficiarios
  for each row
  when (new.leida is distinct from old.leida)
  execute function public.mark_notification_read();
