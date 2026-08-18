# Fix: Departamento y Municipio Selects Vacíos

## Problema
Los selects de "Departamento" y "Municipio" en el formulario de onboarding no muestran opciones.

## Causa
Las vistas `vw_catalog_departamentos_colombia` y `vw_catalog_municipios_colombia` están devolviendo columnas con nombres incorrectos:
- Devolviendo: `nombre`
- Esperado: `departamento` y `municipio`

## Solución

### Ejecutar en Supabase SQL Editor

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard/project/jwifxjzxdxjntbdqbyku
2. Navega a **SQL Editor**
3. Copia y pega el siguiente SQL:

```sql
begin;

-- Recrear vista de departamentos con el nombre de columna esperado
drop view if exists public.vw_catalog_departamentos_colombia;
create view public.vw_catalog_departamentos_colombia
with (security_invoker = true) as
select
  d.id,
  d.nombre as departamento
from public.catalog_departamentos_colombia d;

-- Recrear vista de municipios con el nombre de columna esperado
drop view if exists public.vw_catalog_municipios_colombia;
create view public.vw_catalog_municipios_colombia
with (security_invoker = true) as
select
  m.id,
  m.nombre as municipio,
  d.nombre as departamento
from public.catalog_municipios_colombia m
join public.catalog_departamentos_colombia d on d.id = m.departamento_id;

-- Mantener los permisos
grant select on public.vw_catalog_departamentos_colombia to anon, authenticated;
grant select on public.vw_catalog_municipios_colombia to anon, authenticated;

commit;
```

4. Haz clic en **Run** o presiona `Ctrl+Enter`
5. Verifica que se ejecutó correctamente (debería mostrar "Success")

### Verificar

Después de ejecutar el SQL, recarga la página del formulario de onboarding y verifica que los selects de Departamento y Municipio ahora muestren opciones.

## Archivos Modificados

- ✅ **supabase/migrations/20260818000001_fix_catalog_views_columns.sql** - Migración creada
- ℹ️ **src/pages/BeneficiarioOnboardingCompleto.jsx** - No requiere cambios (código ya esperaba los nombres correctos)

## Nota

Esta migración también está guardada en `supabase/migrations/` por lo que si reseteas la base de datos o la recreas desde cero, el fix se aplicará automáticamente.
