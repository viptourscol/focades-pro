-- Corrección: portal_beneficiarios.convocatoria_id fue creada como bigint pero
-- inscripciones.convocatoria_id (y convocatorias.id) son uuid.
-- La columna no tiene datos (ningún insert exitoso aún), se hace drop + re-add.

alter table public.portal_beneficiarios
  drop column if exists convocatoria_id;

alter table public.portal_beneficiarios
  add column convocatoria_id uuid;
