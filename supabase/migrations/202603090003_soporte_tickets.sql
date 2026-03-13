create table if not exists public.soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_codigo text not null unique,
  inscripcion_id uuid references public.inscripciones(id) on delete set null,
  radicado text not null,
  email_contacto text not null,
  nombre_contacto text,
  asunto text not null,
  mensaje_aspirante text not null,
  estado text not null default 'recibido' check (estado in ('recibido', 'en_revision', 'respondido', 'cerrado')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  respuesta_admin text,
  respondido_at timestamptz,
  response_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists soporte_tickets_radicado_idx on public.soporte_tickets(radicado);
create index if not exists soporte_tickets_email_idx on public.soporte_tickets(email_contacto);
create index if not exists soporte_tickets_estado_idx on public.soporte_tickets(estado);
create index if not exists soporte_tickets_created_idx on public.soporte_tickets(created_at desc);

create or replace function public.set_soporte_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_soporte_tickets_updated_at on public.soporte_tickets;
create trigger trg_soporte_tickets_updated_at
before update on public.soporte_tickets
for each row
execute function public.set_soporte_tickets_updated_at();

alter table public.soporte_tickets enable row level security;

drop policy if exists "soporte_tickets_select_none" on public.soporte_tickets;
create policy "soporte_tickets_select_none"
on public.soporte_tickets
for select
using (false);

drop policy if exists "soporte_tickets_insert_none" on public.soporte_tickets;
create policy "soporte_tickets_insert_none"
on public.soporte_tickets
for insert
with check (false);

drop policy if exists "soporte_tickets_update_none" on public.soporte_tickets;
create policy "soporte_tickets_update_none"
on public.soporte_tickets
for update
using (false)
with check (false);

drop policy if exists "soporte_tickets_delete_none" on public.soporte_tickets;
create policy "soporte_tickets_delete_none"
on public.soporte_tickets
for delete
using (false);
