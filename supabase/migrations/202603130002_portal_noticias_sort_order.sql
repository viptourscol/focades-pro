-- Agrega columna sort_order a portal_noticias para control manual del orden de publicación.
-- El orden en el portal público será: sort_order ASC nulls last, luego publish_at DESC.

alter table public.portal_noticias
  add column if not exists sort_order integer;

-- Poblar sort_order según el orden actual (más reciente = número más bajo)
with ranked as (
  select id, row_number() over (order by publish_at desc, id desc) as rn
  from public.portal_noticias
)
update public.portal_noticias n
set sort_order = r.rn
from ranked r
where n.id = r.id;
