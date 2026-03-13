begin;

insert into public.catalog_departamentos_colombia (nombre)
values
  ('Antioquia'),
  ('Atlántico'),
  ('Bogotá D.C.'),
  ('Bolívar'),
  ('Córdoba'),
  ('Cundinamarca'),
  ('Norte de Santander'),
  ('Santander'),
  ('Sucre'),
  ('Valle del Cauca')
on conflict (nombre) do nothing;

insert into public.catalog_municipios_colombia (departamento_id, nombre)
select d.id, m.nombre
from public.catalog_departamentos_colombia d
join (
  values
    ('Antioquia', 'Medellín'),
    ('Antioquia', 'Bello'),
    ('Atlántico', 'Barranquilla'),
    ('Bogotá D.C.', 'Bogotá D.C.'),
    ('Bolívar', 'Cartagena'),
    ('Córdoba', 'Montería'),
    ('Córdoba', 'Montelíbano'),
    ('Cundinamarca', 'Soacha'),
    ('Norte de Santander', 'Cúcuta'),
    ('Santander', 'Bucaramanga'),
    ('Sucre', 'Sincelejo'),
    ('Valle del Cauca', 'Cali')
) as m(departamento, nombre)
  on d.nombre = m.departamento
on conflict (departamento_id, nombre) do nothing;

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'catalog_establecimientos_educativos'
      and c.is_nullable = 'NO'
      and c.column_default is null
      and coalesce(c.is_identity, 'NO') = 'NO'
      and coalesce(c.is_generated, 'NEVER') = 'NEVER'
      and c.column_name not in ('id', 'nombre', 'municipio_id')
  ) then
    raise notice 'Se omite seed de catalog_establecimientos_educativos por columnas obligatorias adicionales sin valor por defecto.';
  else
    insert into public.catalog_establecimientos_educativos (nombre, municipio_id)
    select x.nombre, m.id
    from (
      values
        ('Institución Educativa José María Córdoba', 'Montelíbano'),
        ('Institución Educativa San José', 'Montería'),
        ('Colegio Distrital de Barranquilla', 'Barranquilla'),
        ('Colegio Mayor de Bogotá', 'Bogotá D.C.'),
        ('Institución Educativa Técnica de Cali', 'Cali')
    ) as x(nombre, municipio)
    left join public.catalog_municipios_colombia m
      on m.nombre = x.municipio
    where not exists (
      select 1
      from public.catalog_establecimientos_educativos e
      where lower(e.nombre) = lower(x.nombre)
    );
  end if;
end $$;

commit;
