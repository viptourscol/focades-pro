-- Seed/normalizacion de convocatorias reales FOCADES
-- Fuente funcional entregada por administracion (totales de admitidos por cohorte).

begin;

alter table public.convocatorias
  add column if not exists total_admitidos integer,
  add column if not exists admitidos_suenos integer,
  add column if not exists admitidos_merito integer;

-- La realidad operativa incluye convocatorias semestrales (ej. 2017-1 y 2017-2),
-- por lo tanto no puede existir unicidad por solo anio.
alter table public.convocatorias
  drop constraint if exists convocatorias_anio_key;

create unique index if not exists idx_convocatorias_nombre_unique
  on public.convocatorias (lower(nombre))
  where nombre is not null and btrim(nombre) <> '';

-- Normalizar registros legacy por anio para evitar ambigüedad con cohortes semestrales.
update public.convocatorias c
set
  nombre = c.anio::text || '-1',
  fecha_inicio = coalesce(c.fecha_inicio, make_timestamptz(c.anio, 1, 1, 0, 0, 0, 'UTC')),
  fecha_fin = coalesce(c.fecha_fin, make_timestamptz(c.anio, 6, 30, 23, 59, 59, 'UTC'))
where c.anio in (2017, 2018, 2019)
  and (c.nombre is null or btrim(c.nombre) = '' or btrim(c.nombre) = c.anio::text)
  and not exists (
    select 1
    from public.convocatorias c2
    where lower(coalesce(c2.nombre, '')) = lower(c.anio::text || '-1')
      and c2.id <> c.id
  );

with source_data as (
  select *
  from (
    values
      ('2017-1'::text, 2017::integer, '1'::text, 95::integer, 80::integer, 10::integer),
      ('2017-2', 2017, '2', 95, 80, 10),
      ('2018-1', 2018, '1', 95, 80, 10),
      ('2018-2', 2018, '2', 95, 80, 10),
      ('2019-1', 2019, '1', 95, 80, 10),
      ('2019-2', 2019, '2', 95, 80, 10),
      ('2020', 2020, null, 90, 80, 10),
      ('2021', 2021, null, 93, 83, 10),
      ('2022', 2022, null, 89, 83, 6),
      ('2023', 2023, null, 112, 105, 7),
      ('2024', 2024, null, 8, 0, 8),
      ('2025', 2025, null, 75, 75, 5)
  ) as v(nombre, anio, semestre, total_admitidos, admitidos_suenos, admitidos_merito)
),
normalized as (
  select
    s.nombre,
    s.anio,
    s.total_admitidos,
    s.admitidos_suenos,
    s.admitidos_merito,
    case
      when s.semestre = '1' then make_timestamptz(s.anio, 1, 1, 0, 0, 0, 'UTC')
      when s.semestre = '2' then make_timestamptz(s.anio, 7, 1, 0, 0, 0, 'UTC')
      else make_timestamptz(s.anio, 1, 1, 0, 0, 0, 'UTC')
    end as fecha_inicio,
    case
      when s.semestre = '1' then make_timestamptz(s.anio, 6, 30, 23, 59, 59, 'UTC')
      when s.semestre = '2' then make_timestamptz(s.anio, 12, 31, 23, 59, 59, 'UTC')
      else make_timestamptz(s.anio, 12, 31, 23, 59, 59, 'UTC')
    end as fecha_fin
  from source_data s
),
updated as (
  update public.convocatorias c
  set
    anio = coalesce(c.anio, n.anio),
    nombre = coalesce(nullif(btrim(c.nombre), ''), n.nombre),
    fecha_inicio = coalesce(c.fecha_inicio, n.fecha_inicio),
    fecha_fin = coalesce(c.fecha_fin, n.fecha_fin),
    total_admitidos = coalesce(c.total_admitidos, n.total_admitidos),
    admitidos_suenos = coalesce(c.admitidos_suenos, n.admitidos_suenos),
    admitidos_merito = coalesce(c.admitidos_merito, n.admitidos_merito)
  from normalized n
  where
    lower(coalesce(c.nombre, '')) = lower(n.nombre)
    or (
      c.anio = n.anio
      and (
        c.nombre is null
        or btrim(c.nombre) = ''
      )
    )
  returning c.id
)
insert into public.convocatorias (
  nombre,
  anio,
  fecha_inicio,
  fecha_fin,
  is_activa,
  total_admitidos,
  admitidos_suenos,
  admitidos_merito
)
select
  n.nombre,
  n.anio,
  n.fecha_inicio,
  n.fecha_fin,
  false,
  n.total_admitidos,
  n.admitidos_suenos,
  n.admitidos_merito
from normalized n
where not exists (
  select 1
  from public.convocatorias c
  where lower(coalesce(c.nombre, '')) = lower(n.nombre)
);

-- Completar registros historicos con datos faltantes cuando se puedan inferir.
update public.convocatorias c
set anio = regexp_replace(c.nombre, '^([0-9]{4}).*$', '\\1')::integer
where c.anio is null
  and c.nombre ~ '^[0-9]{4}(-[12])?$';

update public.convocatorias c
set nombre = c.anio::text
where (c.nombre is null or btrim(c.nombre) = '')
  and c.anio is not null;

update public.convocatorias c
set
  fecha_inicio = case
    when c.nombre ~ '^[0-9]{4}-1$' then make_timestamptz(c.anio, 1, 1, 0, 0, 0, 'UTC')
    when c.nombre ~ '^[0-9]{4}-2$' then make_timestamptz(c.anio, 7, 1, 0, 0, 0, 'UTC')
    else make_timestamptz(c.anio, 1, 1, 0, 0, 0, 'UTC')
  end,
  fecha_fin = case
    when c.nombre ~ '^[0-9]{4}-1$' then make_timestamptz(c.anio, 6, 30, 23, 59, 59, 'UTC')
    when c.nombre ~ '^[0-9]{4}-2$' then make_timestamptz(c.anio, 12, 31, 23, 59, 59, 'UTC')
    else make_timestamptz(c.anio, 12, 31, 23, 59, 59, 'UTC')
  end
where c.anio is not null
  and (c.fecha_inicio is null or c.fecha_fin is null);

-- Si por alguna razon quedaron nulos, derivarlos del total.
update public.convocatorias c
set admitidos_merito = greatest(coalesce(c.total_admitidos, 0) - coalesce(c.admitidos_suenos, 0), 0)
where c.admitidos_merito is null
  and c.total_admitidos is not null
  and c.admitidos_suenos is not null;

update public.convocatorias c
set total_admitidos = coalesce(c.admitidos_suenos, 0) + coalesce(c.admitidos_merito, 0)
where c.total_admitidos is null
  and (c.admitidos_suenos is not null or c.admitidos_merito is not null);

notify pgrst, 'reload schema';

commit;
