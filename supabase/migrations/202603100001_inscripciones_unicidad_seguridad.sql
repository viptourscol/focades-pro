update public.inscripciones
set
  email = lower(btrim(email)),
  tipo_documento = upper(btrim(tipo_documento)),
  n_documento = btrim(n_documento),
  radicado = upper(btrim(radicado))
where true;

update public.personas
set
  email = lower(btrim(email)),
  tipo_documento = upper(btrim(tipo_documento)),
  n_documento = btrim(n_documento)
where true;

create unique index if not exists uq_inscripciones_radicado_ci
  on public.inscripciones ((upper(btrim(radicado))))
  where coalesce(btrim(radicado), '') <> '';

create unique index if not exists uq_inscripciones_conv_identidad_correo
  on public.inscripciones (
    convocatoria_id,
    (upper(btrim(tipo_documento))),
    (btrim(n_documento)),
    (lower(btrim(email)))
  )
  where convocatoria_id is not null
    and coalesce(btrim(tipo_documento), '') <> ''
    and coalesce(btrim(n_documento), '') <> ''
    and coalesce(btrim(email), '') <> '';

create unique index if not exists uq_personas_tipo_documento_numero
  on public.personas (
    (upper(btrim(tipo_documento))),
    (btrim(n_documento))
  )
  where coalesce(btrim(tipo_documento), '') <> ''
    and coalesce(btrim(n_documento), '') <> '';

create unique index if not exists uq_inscripciones_drafts_email_ci
  on public.inscripciones_drafts ((lower(btrim(email))))
  where coalesce(btrim(email), '') <> '';
