# Documentación: Subida de Documentos y Firma Digital

## Resumen
Se implementó la funcionalidad completa de subida de documentos y firma digital en el proceso de onboarding de beneficiarios (11 pasos).

## Componentes Modificados

### 1. BeneficiarioOnboardingCompleto.jsx

#### Nuevas Dependencias
```javascript
import SignatureCanvas from 'react-signature-canvas';
import { CheckCircle, Trash2 } from 'lucide-react';
```

#### Nuevos Estados
```javascript
const [uploadedDocs, setUploadedDocs] = useState({});
const [uploadingDoc, setUploadingDoc] = useState(null);
const signatureRef = useRef(null);
```

#### Funciones Implementadas

##### handleUploadDocument(tipoDoc, file)
- **Propósito**: Subir documento individual a Supabase Storage
- **Validaciones**:
  - Solo archivos PDF
  - Tamaño máximo 10MB
- **Proceso**:
  1. Valida tipo y tamaño
  2. Sube a Storage: `beneficiarios_historicos/{beneficiario_id}/documentos/{tipo}-{timestamp}.pdf`
  3. Registra en tabla `portal_beneficiario_documentos_historicos`
  4. Actualiza estado local `uploadedDocs`
- **Feedback**: Alerts de éxito/error

##### handleRemoveDocument(tipoDoc)
- **Propósito**: Eliminar documento de la lista local (permite re-subir)
- **Nota**: Solo elimina del estado, no de Storage (para evitar pérdida accidental)

##### handleSaveSignature()
- **Propósito**: Validar y guardar firma digital del canvas
- **Proceso**:
  1. Verifica que el canvas no esté vacío
  2. Convierte firma a base64 (PNG)
  3. Guarda en `formData.firma_digital`
- **Retorna**: boolean (true si éxito, false si error)

##### handleClearSignature()
- **Propósito**: Limpiar canvas de firma
- **Efecto**: Limpia canvas y resetea `formData.firma_digital`

##### getDocumentTitle(tipo)
- **Propósito**: Obtener título legible para tipo de documento
- **Mapeo**: `documento_identidad` → "Documento de Identidad"

## Paso 9: Documentos

### Documentos Obligatorios (7)
1. Documento de Identidad
2. Acta de Grado Bachillerato
3. Diploma de Bachiller
4. Resultados Pruebas Saber 11
5. Certificado de Matrícula
6. Certificado de Notas Actual
7. Certificado Bancario

### Documentos Condicionales (2)
8. **Ficha SISBEN**: Obligatorio si `sisben_grupo` ≠ 'NO_APLICA'
9. **Certificado Enfoque Diferencial**: Obligatorio si `enfoque_diferencial` ≠ 'NINGUNO'

### Interfaz de Usuario
- Input file por documento con icono de folder
- Estado visual: 
  - Sin subir: Input file estándar
  - Subiendo: Spinner animado
  - Subido: Badge verde con nombre, tamaño y botón eliminar
- Validación en tiempo real con mensajes de error

### Almacenamiento
- **Bucket**: `soportes`
- **Ruta**: `beneficiarios_historicos/{beneficiario_id}/documentos/{tipo}-{timestamp}.pdf`
- **Registro DB**: `portal_beneficiario_documentos_historicos`
  - `beneficiario_id`
  - `titulo`
  - `tipo_documento`
  - `estado`: 'cargado'
  - `storage_bucket`: 'soportes'
  - `storage_path`: `soportes/{path}`
  - `archivo_mime_type`: 'application/pdf'
  - `archivo_size_bytes`

## Paso 10: Términos y Firma

### Elementos
1. **Checkbox**: Acepto términos y condiciones
2. **Checkbox**: Autorizo tratamiento de datos personales
3. **Canvas de Firma Digital**: SignatureCanvas de react-signature-canvas

### Canvas de Firma
- **Dimensiones**: Full width × 192px (h-48)
- **Fondo**: Blanco
- **Color pluma**: Negro
- **Grosor**: 0.5px - 2.5px
- **Controles**:
  - Botón "Limpiar" (Trash2 icon)
  - Indicador "Firma guardada" (CheckCircle icon)

### Validación
- Ambos checkboxes obligatorios
- Firma digital obligatoria (canvas no puede estar vacío)

### Proceso de Guardado (handleComplete)
1. Valida paso 10 (checkboxes + firma)
2. Llama `handleSaveSignature()` para validar firma
3. Convierte firma base64 a Blob
4. Sube a Storage: `beneficiarios_historicos/{beneficiario_id}/firma-digital-{timestamp}.png`
5. Registra en `portal_beneficiario_documentos_historicos` con `tipo_documento: 'firma_digital'`
6. Actualiza perfil con `updateProfile()`
7. Marca onboarding completado con Edge Function `complete-onboarding`
8. Limpia localStorage
9. Avanza a paso 11 (Resumen)

## Paso 11: Resumen

### Información Mostrada
- Correo electrónico
- Número de documento
- Universidad
- Programa académico
- Banco y tipo de cuenta
- **Cantidad de documentos subidos**

### Mensaje Final
- ✓ Perfil completado al 100%
- Mensaje sobre acceso al portal de beneficiarios

## Validaciones Actualizadas

### validateStep(9)
- Verifica que todos los documentos obligatorios estén en `uploadedDocs`
- Verifica documentos condicionales según datos ingresados
- Usa `uploadedDocs` en lugar de `formData.documentos`

### validateStep(10)
- `acepta_terminos` = true
- `acepta_datos` = true
- `firma_digital` ≠ null (firma debe existir)

## Consideraciones de Seguridad

### Storage
- **RLS**: Políticas ya configuradas en migración `202608140001`
- **Permisos**: Beneficiarios pueden subir a su propia carpeta
- **Bucket**: `soportes` (público con RLS)

### Tamaños de Archivo
- **Máximo**: 10MB por documento
- **Validación**: Frontend antes de subir
- **Total estimado**: ~70-90MB para todos los documentos

### Tipos de Archivo
- **Permitidos**: Solo PDF (documentos) y PNG (firma)
- **Validación**: `file.type` en frontend
- **MIME type**: Registrado en DB para verificación posterior

## Flujo de Usuario Completo

1. **Paso 1**: Verifica documento → Pre-carga datos existentes
2. **Paso 2**: Revisa email
3. **Paso 3**: Establece contraseña
4. **Paso 4**: Datos personales
5. **Paso 5**: Info socioeconómica
6. **Paso 6**: Formación secundaria
7. **Paso 7**: Formación superior (muestra info beca)
8. **Paso 8**: Información bancaria
9. **Paso 9**: 📄 **SUBE 7-9 DOCUMENTOS PDF** ← NUEVO
10. **Paso 10**: ✍️ **FIRMA DIGITALMENTE** ← NUEVO
11. **Paso 11**: Resumen y finalización

## Próximos Pasos

### Implementado ✅
- [x] Subida de documentos individuales con validación
- [x] Canvas de firma digital funcional
- [x] Almacenamiento en Supabase Storage
- [x] Registro en tabla de documentos históricos
- [x] Validaciones completas
- [x] Feedback visual (spinners, badges, iconos)
- [x] Manejo de errores

### Pendiente (Opcional)
- [ ] Drag & drop para documentos
- [ ] Preview de documentos subidos (PDF viewer)
- [ ] Compresión de imágenes de firma
- [ ] Progress bar para uploads grandes
- [ ] Batch upload (múltiples archivos a la vez)
- [ ] Edición de firma (deshacer/rehacer)

## Dependencias Nuevas

```json
{
  "react-signature-canvas": "^1.0.6"
}
```

## Testing

### Manual Testing Checklist
1. [ ] Subir documento válido (PDF < 10MB)
2. [ ] Intentar subir archivo no-PDF → Error
3. [ ] Intentar subir PDF > 10MB → Error
4. [ ] Eliminar documento y re-subir
5. [ ] Firmar en canvas
6. [ ] Limpiar firma y volver a firmar
7. [ ] Intentar avanzar sin firma → Error
8. [ ] Completar todo el flujo → Éxito
9. [ ] Verificar documentos en tabla `portal_beneficiario_documentos_historicos`
10. [ ] Verificar archivos en Storage `soportes/beneficiarios_historicos/{id}/`

### Edge Cases
- Usuario cierra navegador durante upload → Auto-guardado en localStorage
- Red lenta → Spinner visible, timeout de 30s
- Usuario intenta subir mismo documento 2 veces → Permitido (timestamp diferente)
- Usuario no tiene SISBEN pero intenta subir ficha → Permitido, no obligatorio

## Notas Técnicas

### Auto-guardado
- El estado `uploadedDocs` NO se guarda en localStorage
- Razón: Evitar inconsistencias con Storage real
- Consecuencia: Si recarga página, debe re-subir documentos
- Solución futura: Al cargar, consultar tabla de documentos

### Performance
- Upload secuencial (uno a la vez)
- No bloquea navegación entre pasos
- Validación solo al intentar avanzar

### Accesibilidad
- Labels descriptivos en todos los inputs
- Estados visuales claros (colores + iconos)
- Keyboard navigation en canvas de firma (limitado por SignatureCanvas)

## Comandos Útiles

```bash
# Instalar dependencias
npm install react-signature-canvas

# Ver logs de Storage
# Ir a: Supabase Dashboard → Storage → soportes → beneficiarios_historicos

# Consultar documentos de un beneficiario
SELECT * FROM portal_beneficiario_documentos_historicos 
WHERE beneficiario_id = {id} 
ORDER BY created_at DESC;
```

## Contacto y Soporte
- **Documentación Supabase Storage**: https://supabase.com/docs/guides/storage
- **SignatureCanvas Docs**: https://github.com/agilgur5/react-signature-canvas
