# Fix: Error 400 en subida de documentos - Onboarding Beneficiarios

## Problema
Los beneficiarios que están completando el onboarding reciben un error **400 Bad Request** al intentar subir documentos:

```
POST https://[project].supabase.co/storage/v1/object/soportes/beneficiarios_historicos/[id]/documentos/acta_grado.pdf 400 (Bad Request)
```

## Causa Raíz
Hay **políticas de RLS conflictivas** en el bucket `soportes` de Supabase Storage:

1. La política antigua `beneficiarios_historicos_storage_insert_self` (creada en `202603260001_onboarding_beneficiario_rls.sql`) requiere:
   - `auth.uid() IS NOT NULL` — **Solo usuarios autenticados**
   
2. La migración `202608180001_fix_docs_rls_onboarding.sql` intentó permitir uploads anónimos, pero:
   - No eliminó correctamente la política antigua
   - Las políticas conflictivas siguen aplicándose simultáneamente

3. Como Postgres **requiere que todas las políticas de INSERT se cumplan**, el upload falla para usuarios anónimos

## Solución

### Opción A: Aplicar automáticamente (Recomendado)

Ejecuta esta migración creada específicamente:

```bash
# Desde la raíz del proyecto
cd /Users/janyermartinez/Documents/Proyectos/focades-pro

# Aplicar la migración a la base de datos
supabase migration list  # Verifica que haya conexión

# Luego aplica la migración directamente
supabase db push
```

La nueva migración `202609150001_fix_storage_rls_conflicts.sql`:
- Elimina **todas** las políticas antiguas conflictivas
- Crea nuevas políticas claras que permiten usuarios anónimos
- Mantiene acceso de admins sin cambios

### Opción B: Aplicar manualmente (Supabase Dashboard)

1. Ve a **Supabase Dashboard** → Tu proyecto
2. Abre **SQL Editor**
3. Copia y ejecuta el contenido de:
   ```
   supabase/migrations/202609150001_fix_storage_rls_conflicts.sql
   ```

## Verificación

Después de aplicar la migración:

1. **Prueba unitaria**: Un beneficiario intenta subir un PDF en el onboarding
2. **Verificar en Supabase Dashboard**:
   - Ve a Storage → soportes
   - Confirma que los archivos se suben correctamente a `beneficiarios_historicos/{id}/documentos/`

3. **Revisar políticas** (SQL):
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'objects' 
   AND schemaname = 'storage'
   ORDER BY policyname;
   ```

   Deberías ver estas políticas:
   - `storage_insert_beneficiarios_historicos`
   - `storage_select_beneficiarios_historicos`
   - `storage_admin_full_access`
   - `storage_admin_update_delete`
   - `storage_admin_delete`

## Detalles Técnicos

### La Nueva Solución

```sql
-- Permite INSERT anónimo y autenticado a beneficiarios_historicos
CREATE POLICY "storage_insert_beneficiarios_historicos"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'soportes' 
    AND (storage.foldername(name))[1] = 'beneficiarios_historicos'
  );
```

**Por qué funciona:**
- `TO anon, authenticated` permite cualquier usuario (incluido anónimo)
- `(storage.foldername(name))[1] = 'beneficiarios_historicos'` limita a la carpeta específica
- No hay restricción de `auth.uid()` que bloquee usuarios sin autenticar

### Seguridad

Aunque permite uploads anónimos, es seguro porque:
1. Solo se permite en la carpeta `beneficiarios_historicos`
2. La tabla `portal_beneficiario_documentos_historicos` valida que el `beneficiario_id` exista
3. Los admins siempre pueden ver/editar/eliminar archivos
4. El Edge Function `auth-credentials` valida la solicitud servidor-lado

## Migración Anterior (Que Causó el Problema)

El archivo `202608180001_fix_docs_rls_onboarding.sql` intentó arreglarlo pero:

```sql
-- ❌ Esto no funcionó porque no eliminó la política antigua
DROP POLICY IF EXISTS "Beneficiarios pueden subir sus documentos" ON storage.objects;
-- ^ El nombre no coincidía con la política existente "beneficiarios_historicos_storage_insert_self"

-- Entonces ambas políticas quedaron activas:
-- 1. beneficiarios_historicos_storage_insert_self (requiere auth.uid())
-- 2. "Permitir upload de documentos onboarding" (permite anon)
-- Como ambas deben pasar, falla para usuarios anónimos
```

## Impacto en el Negocio

- **Beneficiarios** no pueden completar onboarding
- **Becas** no se procesan hasta completar onboarding
- **Documentos requeridos**: cédula, acta de grado, diploma, pruebas SABER, etc.

## Next Steps

1. ✅ Crear migración → **HECHO** (`202609150001_fix_storage_rls_conflicts.sql`)
2. ⬜ Aplicar con `supabase db push`
3. ⬜ Probar con un beneficiario real
4. ⬜ Monitorear que no haya errores de permisos en logs

---

**Nota:** Este fix es retroactivo. Los documentos subidos anteriormente quedan en Storage.
