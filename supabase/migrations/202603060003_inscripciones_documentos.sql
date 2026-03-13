create table if not exists public.inscripciones_documentos (
  id bigserial primary key,
  inscripcion_id bigint not null references public.inscripciones(id) on delete cascade,
  tipo_documento text not null,
  storage_path text not null,
  nombre_original text,
  mime_type text,
  size_bytes bigint,
  version integer not null default 1,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_inscripciones_documentos_inscripcion
  on public.inscripciones_documentos (inscripcion_id);

create index if not exists idx_inscripciones_documentos_tipo
  on public.inscripciones_documentos (tipo_documento);

alter table public.inscripciones_documentos enable row level security;

drop policy if exists "inscripciones_documentos_select_authenticated" on public.inscripciones_documentos;
create policy "inscripciones_documentos_select_authenticated"
  on public.inscripciones_documentos
  for select
  to authenticated
  using (true);

drop policy if exists "inscripciones_documentos_insert_authenticated" on public.inscripciones_documentos;
create policy "inscripciones_documentos_insert_authenticated"
  on public.inscripciones_documentos
  for insert
  to authenticated
  with check (true);

drop policy if exists "inscripciones_documentos_update_authenticated" on public.inscripciones_documentos;
create policy "inscripciones_documentos_update_authenticated"
  on public.inscripciones_documentos
  for update
  to authenticated
  using (true)
  with check (true);
