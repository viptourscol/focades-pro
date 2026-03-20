-- Modulo de condonaciones (fase inicial):
-- - Condonacion semestral por pago efectuado
-- - Condonacion final con documentos
-- - Certificados verificables por codigo (on-demand, sin almacenamiento masivo)
-- - Sugerencias de cobro coactivo sobre ultimo pago

create extension if not exists pgcrypto;

create table if not exists public.portal_condonacion_semestral (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  pago_id bigint not null unique references public.portal_beneficiario_pagos(id) on delete cascade,
  actualizacion_id bigint references public.portal_actualizaciones(id) on delete set null,
  semestre_texto text not null,
  monto_desembolsado numeric(12,2) not null check (monto_desembolsado >= 0),
  promedio_reportado numeric(4,2),
  estado_condonacion text not null default 'pendiente_admin',
  motivo_no_condonada text,
  revisado_por_user_id uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado_condonacion in ('pendiente_admin','condonada','no_condonada'))
);

create index if not exists idx_cond_sem_beneficiario on public.portal_condonacion_semestral(beneficiario_id, created_at desc);
create index if not exists idx_cond_sem_estado on public.portal_condonacion_semestral(estado_condonacion, created_at desc);

create table if not exists public.portal_condonacion_final (
  id bigserial primary key,
  beneficiario_id bigint not null unique references public.portal_beneficiarios(id) on delete cascade,
  estado text not null default 'pendiente_documentos',
  observacion_admin text,
  preaprobado_at timestamptz,
  revisado_por_user_id uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado in ('pendiente_documentos','preaprobada_sistema','aprobada_admin','rechazada_admin'))
);

create table if not exists public.portal_condonacion_final_documentos (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  tipo_documento text not null,
  storage_path text not null,
  nombre_original text,
  mime_type text,
  size_bytes bigint,
  estado_validacion text not null default 'pendiente',
  observacion_admin text,
  revisado_por_user_id uuid references auth.users(id) on delete set null,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo_documento in ('diploma','acta_grado','historico_notas')),
  check (estado_validacion in ('pendiente','aprobado','rechazado'))
);

create index if not exists idx_cond_final_docs_benef on public.portal_condonacion_final_documentos(beneficiario_id, created_at desc);

create table if not exists public.portal_sugerencias_cobro_coactivo (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  pago_id bigint references public.portal_beneficiario_pagos(id) on delete set null,
  condonacion_semestral_id bigint references public.portal_condonacion_semestral(id) on delete set null,
  motivo_causal text not null,
  monto_sugerido numeric(12,2) not null check (monto_sugerido >= 0),
  estado text not null default 'sugerido',
  observacion_admin text,
  gestionado_por_user_id uuid references auth.users(id) on delete set null,
  gestionado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (motivo_causal in ('promedio_bajo','no_actualizo','retiro')),
  check (estado in ('sugerido','confirmado_admin','descartado_admin'))
);

create index if not exists idx_sugerencias_cobro_benef on public.portal_sugerencias_cobro_coactivo(beneficiario_id, created_at desc);
create index if not exists idx_sugerencias_cobro_estado on public.portal_sugerencias_cobro_coactivo(estado, created_at desc);

create table if not exists public.portal_condonacion_certificados (
  id bigserial primary key,
  beneficiario_id bigint not null references public.portal_beneficiarios(id) on delete cascade,
  condonacion_semestral_id bigint not null unique references public.portal_condonacion_semestral(id) on delete cascade,
  codigo_certificado text not null unique,
  hash_integridad text not null,
  qr_payload jsonb not null default '{}'::jsonb,
  estado text not null default 'vigente',
  emitido_por_user_id uuid references auth.users(id) on delete set null,
  revocado_at timestamptz,
  revocado_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado in ('vigente','revocado'))
);

create index if not exists idx_cond_cert_benef on public.portal_condonacion_certificados(beneficiario_id, created_at desc);
create index if not exists idx_cond_cert_estado on public.portal_condonacion_certificados(estado, created_at desc);

create or replace function public.portal_condonaciones_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cond_sem_updated_at on public.portal_condonacion_semestral;
create trigger trg_cond_sem_updated_at
before update on public.portal_condonacion_semestral
for each row execute function public.portal_condonaciones_set_updated_at();

drop trigger if exists trg_cond_final_updated_at on public.portal_condonacion_final;
create trigger trg_cond_final_updated_at
before update on public.portal_condonacion_final
for each row execute function public.portal_condonaciones_set_updated_at();

drop trigger if exists trg_cond_final_docs_updated_at on public.portal_condonacion_final_documentos;
create trigger trg_cond_final_docs_updated_at
before update on public.portal_condonacion_final_documentos
for each row execute function public.portal_condonaciones_set_updated_at();

drop trigger if exists trg_sugerencias_cobro_updated_at on public.portal_sugerencias_cobro_coactivo;
create trigger trg_sugerencias_cobro_updated_at
before update on public.portal_sugerencias_cobro_coactivo
for each row execute function public.portal_condonaciones_set_updated_at();

drop trigger if exists trg_cond_cert_updated_at on public.portal_condonacion_certificados;
create trigger trg_cond_cert_updated_at
before update on public.portal_condonacion_certificados
for each row execute function public.portal_condonaciones_set_updated_at();

alter table public.portal_condonacion_semestral enable row level security;
alter table public.portal_condonacion_final enable row level security;
alter table public.portal_condonacion_final_documentos enable row level security;
alter table public.portal_sugerencias_cobro_coactivo enable row level security;
alter table public.portal_condonacion_certificados enable row level security;

drop policy if exists cond_sem_admin_all on public.portal_condonacion_semestral;
create policy cond_sem_admin_all
on public.portal_condonacion_semestral for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists cond_sem_self_select on public.portal_condonacion_semestral;
create policy cond_sem_self_select
on public.portal_condonacion_semestral for select
to authenticated
using (
  exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = beneficiario_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists cond_final_admin_all on public.portal_condonacion_final;
create policy cond_final_admin_all
on public.portal_condonacion_final for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists cond_final_self_select on public.portal_condonacion_final;
create policy cond_final_self_select
on public.portal_condonacion_final for select
to authenticated
using (
  exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = beneficiario_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists cond_final_docs_admin_all on public.portal_condonacion_final_documentos;
create policy cond_final_docs_admin_all
on public.portal_condonacion_final_documentos for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists cond_final_docs_self_select on public.portal_condonacion_final_documentos;
create policy cond_final_docs_self_select
on public.portal_condonacion_final_documentos for select
to authenticated
using (
  exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = beneficiario_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists cobro_sugerencias_admin_all on public.portal_sugerencias_cobro_coactivo;
create policy cobro_sugerencias_admin_all
on public.portal_sugerencias_cobro_coactivo for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists cobro_sugerencias_self_select on public.portal_sugerencias_cobro_coactivo;
create policy cobro_sugerencias_self_select
on public.portal_sugerencias_cobro_coactivo for select
to authenticated
using (
  exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = beneficiario_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists cond_cert_admin_all on public.portal_condonacion_certificados;
create policy cond_cert_admin_all
on public.portal_condonacion_certificados for all
to authenticated
using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

drop policy if exists cond_cert_self_select on public.portal_condonacion_certificados;
create policy cond_cert_self_select
on public.portal_condonacion_certificados for select
to authenticated
using (
  exists (
    select 1
    from public.portal_beneficiarios b
    where b.id = beneficiario_id
      and b.auth_user_id = auth.uid()
  )
);

create or replace function public.crear_o_actualizar_condonacion_semestral_por_pago(
  p_pago_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.portal_beneficiario_pagos%rowtype;
  v_update_id bigint;
  v_semestre_texto text;
  v_promedio numeric(4,2);
  v_cond_id bigint;
begin
  select * into v_pago
  from public.portal_beneficiario_pagos
  where id = p_pago_id;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if coalesce(v_pago.estado, '') <> 'efectuado' then
    raise exception 'Solo se puede crear condonacion para pagos efectuados.';
  end if;

  select a.id, a.promedio_semestre_anterior
  into v_update_id, v_promedio
  from public.portal_actualizaciones a
  where a.beneficiario_id = v_pago.beneficiario_id
    and a.estado = 'aprobada'
  order by coalesce(a.revisado_at, a.updated_at, a.created_at) desc
  limit 1;

  v_semestre_texto := coalesce(
    nullif(v_pago.periodo, ''),
    (select case when a.semestre_actual is null then null else ('Semestre ' || a.semestre_actual::text) end from public.portal_actualizaciones a where a.id = v_update_id),
    'Periodo no informado'
  );

  insert into public.portal_condonacion_semestral (
    beneficiario_id,
    pago_id,
    actualizacion_id,
    semestre_texto,
    monto_desembolsado,
    promedio_reportado,
    estado_condonacion
  ) values (
    v_pago.beneficiario_id,
    v_pago.id,
    v_update_id,
    v_semestre_texto,
    coalesce(v_pago.monto, 0),
    v_promedio,
    'pendiente_admin'
  )
  on conflict (pago_id)
  do update set
    actualizacion_id = excluded.actualizacion_id,
    semestre_texto = excluded.semestre_texto,
    monto_desembolsado = excluded.monto_desembolsado,
    promedio_reportado = excluded.promedio_reportado,
    updated_at = now()
  returning id into v_cond_id;

  return jsonb_build_object(
    'ok', true,
    'condonacion_id', v_cond_id,
    'pago_id', v_pago.id,
    'beneficiario_id', v_pago.beneficiario_id,
    'estado', 'pendiente_admin'
  );
end;
$$;

create or replace function public.sugerir_cobro_coactivo_ultimo_pago(
  p_beneficiario_id bigint,
  p_motivo_causal text,
  p_condonacion_semestral_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago public.portal_beneficiario_pagos%rowtype;
  v_id bigint;
  v_motivo text := lower(coalesce(p_motivo_causal, ''));
begin
  if v_motivo not in ('promedio_bajo','no_actualizo','retiro') then
    raise exception 'Motivo causal invalido.';
  end if;

  select p.* into v_pago
  from public.portal_beneficiario_pagos p
  where p.beneficiario_id = p_beneficiario_id
    and p.estado = 'efectuado'
  order by coalesce(p.fecha_efectiva, p.created_at::date) desc, p.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No hay pagos efectuados para sugerir cobro.');
  end if;

  if exists (
    select 1
    from public.portal_sugerencias_cobro_coactivo s
    where s.beneficiario_id = p_beneficiario_id
      and s.pago_id = v_pago.id
      and s.motivo_causal = v_motivo
      and s.estado in ('sugerido','confirmado_admin')
  ) then
    return jsonb_build_object('ok', true, 'message', 'Ya existe sugerencia previa para este caso.');
  end if;

  insert into public.portal_sugerencias_cobro_coactivo (
    beneficiario_id,
    pago_id,
    condonacion_semestral_id,
    motivo_causal,
    monto_sugerido,
    estado
  ) values (
    p_beneficiario_id,
    v_pago.id,
    p_condonacion_semestral_id,
    v_motivo,
    coalesce(v_pago.monto, 0),
    'sugerido'
  ) returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'sugerencia_id', v_id,
    'pago_id', v_pago.id,
    'monto_sugerido', v_pago.monto
  );
end;
$$;

create or replace function public.admin_revisar_condonacion_semestral(
  p_condonacion_id bigint,
  p_aprobar boolean,
  p_motivo_no_condonada text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.portal_condonacion_semestral%rowtype;
  v_estado text;
begin
  if not exists (select 1 from public.portal_admin_users a where a.user_id = v_actor) then
    raise exception 'Solo administradores pueden revisar condonaciones.';
  end if;

  select * into v_row
  from public.portal_condonacion_semestral
  where id = p_condonacion_id;

  if not found then
    raise exception 'Condonacion semestral no encontrada.';
  end if;

  v_estado := case when p_aprobar then 'condonada' else 'no_condonada' end;

  update public.portal_condonacion_semestral
  set
    estado_condonacion = v_estado,
    motivo_no_condonada = case when p_aprobar then null else nullif(trim(coalesce(p_motivo_no_condonada, '')), '') end,
    revisado_por_user_id = v_actor,
    revisado_at = now(),
    updated_at = now()
  where id = p_condonacion_id;

  if not p_aprobar then
    perform public.sugerir_cobro_coactivo_ultimo_pago(
      v_row.beneficiario_id,
      case
        when coalesce(v_row.promedio_reportado, 0) > 0 and coalesce(v_row.promedio_reportado, 0) < 3.2 then 'promedio_bajo'
        else 'no_actualizo'
      end,
      v_row.id
    );
  end if;

  return jsonb_build_object('ok', true, 'condonacion_id', p_condonacion_id, 'estado', v_estado);
end;
$$;

create or replace function public.portal_condonacion_handle_pago_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.estado = 'efectuado' then
    perform public.crear_o_actualizar_condonacion_semestral_por_pago(new.id);
  elsif tg_op = 'UPDATE' and new.estado = 'efectuado' and coalesce(old.estado, '') <> 'efectuado' then
    perform public.crear_o_actualizar_condonacion_semestral_por_pago(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_portal_condonacion_on_pago on public.portal_beneficiario_pagos;
create trigger trg_portal_condonacion_on_pago
after insert or update of estado on public.portal_beneficiario_pagos
for each row
execute function public.portal_condonacion_handle_pago_trigger();

create or replace function public.portal_condonacion_handle_benef_estado_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.estado_beneficiario, '') <> coalesce(new.estado_beneficiario, '')
     and new.estado_beneficiario = 'retirado' then
    perform public.sugerir_cobro_coactivo_ultimo_pago(new.id, 'retiro', null);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_portal_condonacion_on_benef_estado on public.portal_beneficiarios;
create trigger trg_portal_condonacion_on_benef_estado
after update of estado_beneficiario on public.portal_beneficiarios
for each row
execute function public.portal_condonacion_handle_benef_estado_trigger();

create or replace function public.crear_certificado_condonacion_semestral(
  p_condonacion_id bigint
)
returns table (
  codigo_certificado text,
  verify_url text,
  beneficiario_nombre text,
  semestre_texto text,
  monto_condonado numeric,
  fecha_emision timestamptz,
  estado text,
  hash_integridad text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_cond public.portal_condonacion_semestral%rowtype;
  v_benef public.portal_beneficiarios%rowtype;
  v_cert public.portal_condonacion_certificados%rowtype;
  v_code text;
  v_payload text;
  v_hash text;
  v_base_url text := 'https://app.focades.info/verificar-certificado';
  v_is_admin boolean := false;
begin
  select * into v_cond
  from public.portal_condonacion_semestral
  where id = p_condonacion_id;

  if not found then
    raise exception 'Condonacion semestral no encontrada.';
  end if;

  select * into v_benef
  from public.portal_beneficiarios
  where id = v_cond.beneficiario_id;

  select exists (select 1 from public.portal_admin_users a where a.user_id = v_actor)
  into v_is_admin;

  if not v_is_admin and coalesce(v_benef.auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_actor then
    raise exception 'No autorizado para generar este certificado.';
  end if;

  if v_cond.estado_condonacion <> 'condonada' then
    raise exception 'Solo se puede generar certificado para condonaciones aprobadas.';
  end if;

  select * into v_cert
  from public.portal_condonacion_certificados c
  where c.condonacion_semestral_id = v_cond.id
    and c.estado = 'vigente'
  limit 1;

  if found then
    return query
    select
      v_cert.codigo_certificado,
      v_base_url || '?code=' || v_cert.codigo_certificado,
      coalesce(v_benef.nombre_completo, 'Beneficiario'),
      v_cond.semestre_texto,
      v_cond.monto_desembolsado,
      v_cert.created_at,
      v_cert.estado,
      v_cert.hash_integridad;
    return;
  end if;

  v_code := 'COND-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_cond.id::text, 8, '0');
  v_payload := coalesce(v_benef.nombre_completo, '') || '|' || coalesce(v_benef.n_documento, '') || '|' || coalesce(v_cond.semestre_texto, '') || '|' || coalesce(v_cond.monto_desembolsado::text, '0') || '|' || v_code;
  v_hash := encode(digest(v_payload, 'sha256'), 'hex');

  insert into public.portal_condonacion_certificados (
    beneficiario_id,
    condonacion_semestral_id,
    codigo_certificado,
    hash_integridad,
    qr_payload,
    estado,
    emitido_por_user_id,
    created_at,
    updated_at
  ) values (
    v_cond.beneficiario_id,
    v_cond.id,
    v_code,
    v_hash,
    jsonb_build_object(
      'code', v_code,
      'verify_url', v_base_url || '?code=' || v_code,
      'beneficiario_id', v_cond.beneficiario_id,
      'condonacion_id', v_cond.id
    ),
    'vigente',
    v_actor,
    now(),
    now()
  ) returning * into v_cert;

  return query
  select
    v_cert.codigo_certificado,
    v_base_url || '?code=' || v_cert.codigo_certificado,
    coalesce(v_benef.nombre_completo, 'Beneficiario'),
    v_cond.semestre_texto,
    v_cond.monto_desembolsado,
    v_cert.created_at,
    v_cert.estado,
    v_cert.hash_integridad;
end;
$$;

create or replace function public.verify_condonacion_certificado_publico(
  p_codigo text
)
returns table (
  es_valido boolean,
  estado text,
  codigo_certificado text,
  beneficiario_nombre text,
  beneficiario_documento text,
  semestre_texto text,
  monto_condonado numeric,
  fecha_emision timestamptz,
  mensaje text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert public.portal_condonacion_certificados%rowtype;
  v_cond public.portal_condonacion_semestral%rowtype;
  v_benef public.portal_beneficiarios%rowtype;
begin
  select * into v_cert
  from public.portal_condonacion_certificados c
  where c.codigo_certificado = trim(coalesce(p_codigo, ''))
  limit 1;

  if not found then
    return query
    select false, 'no_encontrado', trim(coalesce(p_codigo, '')), null::text, null::text, null::text, null::numeric, null::timestamptz, 'Certificado no encontrado.';
    return;
  end if;

  select * into v_cond
  from public.portal_condonacion_semestral
  where id = v_cert.condonacion_semestral_id;

  select * into v_benef
  from public.portal_beneficiarios
  where id = v_cert.beneficiario_id;

  if v_cert.estado <> 'vigente' then
    return query
    select false, v_cert.estado, v_cert.codigo_certificado, coalesce(v_benef.nombre_completo, 'No disponible'), coalesce(v_benef.n_documento, 'No disponible'), coalesce(v_cond.semestre_texto, 'No disponible'), coalesce(v_cond.monto_desembolsado, 0), v_cert.created_at, 'Certificado revocado o no vigente.';
    return;
  end if;

  return query
  select true, v_cert.estado, v_cert.codigo_certificado, coalesce(v_benef.nombre_completo, 'No disponible'), coalesce(v_benef.n_documento, 'No disponible'), coalesce(v_cond.semestre_texto, 'No disponible'), coalesce(v_cond.monto_desembolsado, 0), v_cert.created_at, 'Certificado valido.';
end;
$$;

create or replace function public.beneficiario_subir_documento_condonacion_final(
  p_tipo_documento text,
  p_storage_path text,
  p_nombre_original text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_beneficiario_id bigint;
  v_count int;
begin
  select b.id into v_beneficiario_id
  from public.portal_beneficiarios b
  where b.auth_user_id = v_actor
    and b.deleted_at is null
  limit 1;

  if v_beneficiario_id is null then
    raise exception 'No hay beneficiario vinculado a la sesión.';
  end if;

  if lower(coalesce(p_tipo_documento, '')) not in ('diploma','acta_grado','historico_notas') then
    raise exception 'Tipo de documento final invalido.';
  end if;

  insert into public.portal_condonacion_final_documentos (
    beneficiario_id,
    tipo_documento,
    storage_path,
    nombre_original,
    mime_type,
    size_bytes,
    estado_validacion
  ) values (
    v_beneficiario_id,
    lower(p_tipo_documento),
    p_storage_path,
    p_nombre_original,
    p_mime_type,
    p_size_bytes,
    'pendiente'
  );

  insert into public.portal_condonacion_final (beneficiario_id, estado)
  values (v_beneficiario_id, 'pendiente_documentos')
  on conflict (beneficiario_id)
  do nothing;

  select count(distinct d.tipo_documento)
  into v_count
  from public.portal_condonacion_final_documentos d
  where d.beneficiario_id = v_beneficiario_id;

  update public.portal_condonacion_final
  set
    estado = case when v_count >= 3 then 'preaprobada_sistema' else 'pendiente_documentos' end,
    preaprobado_at = case when v_count >= 3 then now() else preaprobado_at end,
    updated_at = now()
  where beneficiario_id = v_beneficiario_id;

  return jsonb_build_object(
    'ok', true,
    'beneficiario_id', v_beneficiario_id,
    'documentos_cargados', v_count,
    'estado_final', case when v_count >= 3 then 'preaprobada_sistema' else 'pendiente_documentos' end
  );
end;
$$;

create or replace function public.beneficiario_modulo_condonacion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_beneficiario_id bigint;
  v_result jsonb;
begin
  select b.id into v_beneficiario_id
  from public.portal_beneficiarios b
  where b.auth_user_id = v_actor
    and b.deleted_at is null
  limit 1;

  if v_beneficiario_id is null then
    return jsonb_build_object('ok', false, 'message', 'No hay beneficiario vinculado.');
  end if;

  with cond as (
    select
      c.id,
      c.pago_id,
      c.actualizacion_id,
      c.semestre_texto,
      c.monto_desembolsado,
      c.promedio_reportado,
      c.estado_condonacion,
      c.motivo_no_condonada,
      c.revisado_at,
      cert.codigo_certificado
    from public.portal_condonacion_semestral c
    left join public.portal_condonacion_certificados cert
      on cert.condonacion_semestral_id = c.id
      and cert.estado = 'vigente'
    where c.beneficiario_id = v_beneficiario_id
    order by c.created_at desc
  ),
  docs as (
    select
      d.id,
      d.tipo_documento,
      d.storage_path,
      d.nombre_original,
      d.estado_validacion,
      d.created_at
    from public.portal_condonacion_final_documentos d
    where d.beneficiario_id = v_beneficiario_id
    order by d.created_at desc
  ),
  cobro as (
    select
      s.id,
      s.motivo_causal,
      s.monto_sugerido,
      s.estado,
      s.created_at
    from public.portal_sugerencias_cobro_coactivo s
    where s.beneficiario_id = v_beneficiario_id
    order by s.created_at desc
  )
  select jsonb_build_object(
    'ok', true,
    'beneficiario_id', v_beneficiario_id,
    'condonaciones', coalesce((select jsonb_agg(to_jsonb(cond)) from cond), '[]'::jsonb),
    'condonacion_final', (
      select to_jsonb(f)
      from public.portal_condonacion_final f
      where f.beneficiario_id = v_beneficiario_id
      limit 1
    ),
    'documentos_finales', coalesce((select jsonb_agg(to_jsonb(docs)) from docs), '[]'::jsonb),
    'sugerencias_cobro', coalesce((select jsonb_agg(to_jsonb(cobro)) from cobro), '[]'::jsonb)
  ) into v_result;

  return coalesce(v_result, jsonb_build_object('ok', true));
end;
$$;

grant execute on function public.crear_o_actualizar_condonacion_semestral_por_pago(bigint) to authenticated;
grant execute on function public.sugerir_cobro_coactivo_ultimo_pago(bigint, text, bigint) to authenticated;
grant execute on function public.admin_revisar_condonacion_semestral(bigint, boolean, text) to authenticated;
grant execute on function public.crear_certificado_condonacion_semestral(bigint) to authenticated;
grant execute on function public.beneficiario_subir_documento_condonacion_final(text, text, text, text, bigint) to authenticated;
grant execute on function public.beneficiario_modulo_condonacion() to authenticated;
grant execute on function public.verify_condonacion_certificado_publico(text) to anon, authenticated;

-- Recarga de schema para PostgREST
notify pgrst, 'reload schema';
