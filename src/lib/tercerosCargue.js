export const CAMPOS_TERCEROS = [
  { name: 'cc_nit', label: 'Número de identificación', type: 'text', required: true, maxLength: 15 },
  { name: 'nombre_razon_social', label: 'Nombre completo o razón social', type: 'text', required: true, maxLength: 200 },
  { name: 'tipo_identificacion', label: 'Tipo de identificación', type: 'select', options: ['CC', 'TI', 'CE', 'NIT', 'PAS', 'PPT'], maxLength: 10 },
  { name: 'email', label: 'Correo electrónico', type: 'email', maxLength: 100 },
  { name: 'telefono', label: 'Teléfono', type: 'tel', maxLength: 20 },
  { name: 'direccion', label: 'Dirección de residencia', type: 'text', maxLength: 255 },
  { name: 'ciudad', label: 'Ciudad o municipio', type: 'text', maxLength: 100 }
]

export const validarTercero = (fila) => {
  const errores = {}
  CAMPOS_TERCEROS.forEach((campo) => {
    const valor = String(fila[campo.name] || '').trim()
    if (campo.required && !valor) {
      errores[campo.name] = `${campo.label} es obligatorio.`
    } else if (valor.length > campo.maxLength) {
      errores[campo.name] = `Usa máximo ${campo.maxLength} caracteres.`
    } else if (campo.type === 'email' && valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      errores[campo.name] = 'Ingresa un correo válido, por ejemplo nombre@dominio.com.'
    }
  })
  return errores
}

export const camposPendientesTercero = (fila) =>
  CAMPOS_TERCEROS.filter((campo) => !String(fila[campo.name] || '').trim())

export const normalizarBusquedaTercero = (valor) =>
  String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export const terceroDesdeRegistro = (registro) => ({
  id: String(registro.id),
  cc_nit: registro.identificacion || '',
  nombre_razon_social: registro.nombre_beneficiario || '',
  tipo_identificacion: registro.tipo_identificacion || '',
  email: registro.email || '',
  telefono: registro.telefono || '',
  direccion: registro.direccion || '',
  ciudad: registro.ciudad || ''
})
