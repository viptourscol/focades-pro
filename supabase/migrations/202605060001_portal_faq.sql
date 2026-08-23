-- ============================================================
-- PORTAL FAQ: preguntas frecuentes editables desde el admin
-- ============================================================

create table if not exists public.portal_faq (
  id          bigserial primary key,
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Trigger updated_at
create or replace function public.set_updated_at_portal_faq()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_portal_faq_updated_at on public.portal_faq;
create trigger set_portal_faq_updated_at
  before update on public.portal_faq
  for each row execute procedure public.set_updated_at_portal_faq();

-- RLS
alter table public.portal_faq enable row level security;

-- Lectura pública: solo preguntas activas
drop policy if exists "faq_anon_select" on public.portal_faq;
create policy "faq_anon_select"
  on public.portal_faq
  for select
  to anon, authenticated
  using (is_active = true);

-- Escritura admin
drop policy if exists "faq_admin_write" on public.portal_faq;
create policy "faq_admin_write"
  on public.portal_faq
  for all
  to authenticated
  using (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.portal_admin_users a where a.user_id = auth.uid()));

-- ── SEED: preguntas frecuentes iniciales ──────────────────────
-- Solo insertar si la tabla está vacía
insert into public.portal_faq (sort_order, question, answer)
select * from (values
(1,  '¿Qué es el Fondo Educativo para el Apoyo de la Educación Superior (FOCADES)?',
     'FOCADES es un programa del Municipio de Montelíbano que otorga créditos educativos condonables a jóvenes de escasos recursos económicos para financiar estudios técnicos, tecnológicos o profesionales en instituciones reconocidas por el SNIES.'),
(2,  '¿Cuáles son las modalidades de apoyo que ofrece FOCADES?',
     '• Apoyo al Mérito Educativo: Para el mejor puntaje en pruebas Saber 11 por institución educativa oficial (3 salarios mínimos semestrales).
• Apoyo a Sueños Educativos: Para 75 estudiantes (1 salario mínimo semestral), con prioridad para zonas rurales.
• PAET UNAL: Para estudiantes de Medicina, Fisioterapia o Nutrición en la Universidad Nacional (1.5 salarios mínimos mensuales).'),
(3,  '¿Cuáles son los requisitos generales para aplicar?',
     'Ser egresado de una institución educativa oficial de Montelíbano. Tener domicilio en el municipio (estudiante y núcleo familiar). Estar matriculado en programas registrados en el SNIES con el 100% de créditos. Promedio académico mínimo de 3.5 (excepto primer semestre). No tener otras becas superiores al apoyo de FOCADES.'),
(4,  '¿Cómo y cuándo se realiza el desembolso?',
     'Mérito y Sueños: Dos veces al año (por semestre), después de la selección.
PAET UNAL: Mensualmente, al inicio de cada mes.'),
(5,  '¿Qué pasa si mi promedio es inferior a 3.5?',
     'Pierdes el beneficio. Sin embargo, puedes solicitar reingreso si no han pasado más de 2 semestres desde la pérdida, cumples los requisitos iniciales y firmas un acuerdo de pago (si aplica).'),
(6,  '¿Cuántas veces puedo recibir el apoyo?',
     'Técnicos: Máximo 4 apoyos.
Tecnológicos: Máximo 6 apoyos.
Pregrados: Máximo 10 apoyos.
No se permiten cambios de carrera sin reiniciar el proceso.'),
(7,  '¿Qué pasa si no cumplo con el promedio mínimo en un semestre?',
     'Pierdes el beneficio para ese semestre, pero puedes solicitar reingreso si regularizas tu situación académica (promedio ≥ 3.5 en el siguiente semestre), no han pasado más de 2 semestres desde la pérdida, y cumples con los requisitos iniciales y, si aplica, firmas un acuerdo de pago.'),
(8,  '¿Puedo cambiar de carrera y seguir recibiendo el apoyo?',
     'No. Si cambias de carrera, debes aplicar como estudiante nuevo y se reinicia el conteo de apoyos según el nuevo programa.'),
(9,  '¿El apoyo de FOCADES cubre matrícula o manutención?',
     'Es un crédito condonable en dinero, que puede usarse para gastos educativos o manutención, según las necesidades del estudiante.'),
(10, '¿Qué instituciones educativas son elegibles?',
     'Todas las registradas en el SNIES (Sistema Nacional de Información de la Educación Superior). Para PAET UNAL, solo aplica la Universidad Nacional de Colombia (sede Bogotá).'),
(11, '¿Cuánto tiempo tengo para usar el crédito después de ser seleccionado?',
     'Mérito Educativo: Hasta el 30 de agosto del año siguiente a graduarte de bachillerato.
Sueños y PAET UNAL: Debes matricular el semestre inmediato a la convocatoria.'),
(12, '¿Qué debo hacer si pierdo el semestre por razones de fuerza mayor?',
     'Informar por escrito al Comité de FOCADES con soportes (ej. certificado médico). Se evaluará caso por caso.'),
(13, '¿Hay seguimiento académico para los beneficiarios?',
     'Sí. Debes presentar certificados de notas y matrícula cada semestre para renovar el apoyo.'),
(14, '¿Qué pasa si me transfiero a una institución fuera del SNIES?',
     'Pierdes el beneficio automáticamente, ya que FOCADES solo aplica para instituciones reconocidas por el SNIES.')
) as v(sort_order, question, answer)
where not exists (select 1 from public.portal_faq limit 1);
