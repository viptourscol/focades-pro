-- Vista 360 de beneficiarios: historial de estado, revisión admin de actualizaciones y pagos manuales.

alter table public.portal_actualizaciones
  add column if not exists observacion_admin text,
  add column if not exists revisado_por_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revisado_at timestamptz;

create table if not exists public.portal_beneficiario_estado_historial (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  estado_anterior text,
  estado_nuevo text not null,
  motivo text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now(),
  check (estado_nuevo in ('activo','suspendido','retirado','condonado','egresado'))
);

create index if not exists idx_portal_benef_estado_hist_beneficiario
  on public.portal_beneficiario_estado_historial(beneficiario_id, created_at desc);

create table if not exists public.portal_beneficiario_pagos (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  concepto text not null,
  periodo text,
  referencia text,
  monto numeric(12,2) not null,
  fecha_programada date,
  fecha_efectiva date,
  estado text not null default 'programado',
  observacion text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (monto >= 0),
  check (estado in ('programado','efectuado','pendiente','anulado'))
);

create index if not exists idx_portal_benef_pagos_beneficiario
  on public.portal_beneficiario_pagos(beneficiario_id, created_at desc);

alter table public.portal_beneficiario_estado_historial enable row level security;
alter table public.portal_beneficiario_pagos enable row level security;

drop policy if exists portal_benef_estado_hist_admin_all on public.portal_beneficiario_estado_historial;
create policy portal_benef_estado_hist_admin_all
  on public.portal_beneficiario_estado_historial for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists portal_benef_pagos_admin_all on public.portal_beneficiario_pagos;
create policy portal_benef_pagos_admin_all
  on public.portal_beneficiario_pagos for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));
