-- Permite que un beneficiario reclame su registro usando el mismo correo autenticado en Supabase Auth.

drop policy if exists portal_beneficiarios_self_claim_by_email on public.portal_beneficiarios;

create policy portal_beneficiarios_self_claim_by_email
  on public.portal_beneficiarios for update
  to authenticated
  using (
    auth_user_id is null
    and email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    auth_user_id = auth.uid()
    and email is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
