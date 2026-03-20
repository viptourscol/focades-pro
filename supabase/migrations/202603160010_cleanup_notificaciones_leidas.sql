-- Limpieza física programada de notificaciones leídas (> 2 días)

create or replace function public.cleanup_read_notifications(
  p_retention interval default interval '2 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.portal_notificaciones_beneficiarios
  where leida = true
    and coalesce(leida_at, updated_at, created_at) < (now() - p_retention);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.cleanup_read_notifications(interval)
is 'Elimina físicamente notificaciones leídas más antiguas que el intervalo dado.';

-- Programar tarea automática con pg_cron (si está disponible)
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when others then
      -- Si la plataforma restringe extensiones, se mantiene la función para ejecución manual.
      raise notice 'No se pudo crear extensión pg_cron: %', sqlerrm;
      return;
  end;

  -- Evitar duplicar jobs con el mismo nombre
  begin
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-read-notifications-2d';
  exception
    when others then
      null;
  end;

  perform cron.schedule(
    'cleanup-read-notifications-2d',
    '5 * * * *',
    $job$select public.cleanup_read_notifications(interval '2 days');$job$
  );
end;
$$;