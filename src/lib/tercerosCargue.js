export const TIPOS_IDENTIFICACION = {
  13: 'Cédula de ciudadanía', 11: 'Registro', 12: 'Tarjeta de Identidad',
  21: 'Tarjeta de Extranjería', 22: 'Cédula de Extranjería', 14: 'Cuenta',
  31: 'NIT', 41: 'Pasaporte', 42: 'Tipo de Documento Extranjero',
  43: 'Sin Identificación del Exterior', 44: 'Otros'
}

export const FIJOS_TERCERO = {
  nombre_razon_social: '', codigo_cargo: '', codigo_dependencia: '4',
  digito_verificador: '', tipo_tercero: 'OTROS', naturaleza: '0',
  regimen: '0', pais: '52', departamento: '23', ciudad_codigo: '466'
}

export const CAMPOS_TERCEROS = [
  { name: 'cc_nit', label: 'C.C/NIT', required: true, maxLength: 15, numerico: true },
  { name: 'nombre_razon_social', label: 'Nombre/Razón Social', maxLength: 120, readonly: true },
  { name: 'segundo_apellido', label: 'Segundo Apellido', required: true, maxLength: 120 },
  { name: 'primer_apellido', label: 'Primer Apellido', required: true, maxLength: 120 },
  { name: 'segundo_nombre', label: 'Segundo Nombre', maxLength: 120 },
  { name: 'primer_nombre', label: 'Primer Nombre', required: true, maxLength: 120 },
  { name: 'tipo_identificacion', label: 'Tipo Identificación', required: true, type: 'select', options: Object.keys(TIPOS_IDENTIFICACION), maxLength: 2 },
  { name: 'codigo_cargo', label: 'Código Cargo', readonly: true },
  { name: 'codigo_dependencia', label: 'Código Dependencia', readonly: true },
  { name: 'email', label: 'Email', required: true, type: 'email', maxLength: 100 },
  { name: 'telefono', label: 'Teléfono', required: true, type: 'tel', maxLength: 30 },
  { name: 'direccion', label: 'Dirección', required: true, maxLength: 500 },
  { name: 'digito_verificador', label: 'Digito Verificador', readonly: true },
  { name: 'tipo_tercero', label: 'Tipo Tercero', readonly: true },
  { name: 'naturaleza', label: 'Naturaleza', readonly: true },
  { name: 'regimen', label: 'Régimen', readonly: true },
  { name: 'pais', label: 'País', readonly: true },
  { name: 'departamento', label: 'Departamento', readonly: true },
  { name: 'ciudad_codigo', label: 'Ciudad', readonly: true },
  { name: 'banco', label: 'Banco', required: true },
  { name: 'tipo_cuenta', label: 'Tipo Cuenta', required: true, type: 'select', options: ['AHORROS', 'CORRIENTE'] },
  { name: 'numero_cuenta', label: 'Numero cuenta', required: true, numerico: true }
].map((campo) => ({ type: 'text', ...campo }))

export const normalizarBusquedaTercero = (valor) =>
  String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export const codigoIdentificacionTercero = (valor) => {
  const normalizado = normalizarBusquedaTercero(valor).replace(/[^a-z0-9]/g, '')
  const alias = { cc: '13', ceduladeciudadania: '13', rc: '11', registro: '11', registrocivil: '11',
    ti: '12', tarjetadeidentidad: '12', te: '21', tarjetadeextranjeria: '21',
    ce: '22', ceduladeextranjeria: '22', cuenta: '14', nit: '31', pas: '41',
    pa: '41', pasaporte: '41', tipodedocumentoextranjero: '42', sinidentificaciondelexterior: '43', otros: '44' }
  return TIPOS_IDENTIFICACION[normalizado] ? normalizado : alias[normalizado] || String(valor ?? '').trim()
}

export const tipoCuentaTercero = (valor) => {
  const normalizado = normalizarBusquedaTercero(valor).trim()
  if (['ahorro', 'ahorros', 'cuenta de ahorro', 'cuenta de ahorros'].includes(normalizado)) return 'AHORROS'
  if (['corriente', 'cuenta corriente'].includes(normalizado)) return 'CORRIENTE'
  return String(valor ?? '').trim()
}

export const sugerirNombresTercero = (nombre) => {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  return {
    primer_nombre: partes[0] || '',
    segundo_nombre: partes.length > 3 ? partes.slice(1, -2).join(' ') : '',
    primer_apellido: partes.length >= 3 ? partes.at(-2) : partes[1] || '',
    segundo_apellido: partes.length >= 3 ? partes.at(-1) : ''
  }
}

export const nombreVisibleTercero = (fila) =>
  fila.nombre_referencia || [fila.primer_nombre, fila.segundo_nombre, fila.primer_apellido, fila.segundo_apellido].filter(Boolean).join(' ') || 'Nuevo tercero'

export const validarTercero = (fila, { completo = false } = {}) => {
  const errores = {}
  CAMPOS_TERCEROS.forEach((campo) => {
    const valor = String(fila[campo.name] ?? '').trim()
    if (completo && campo.required && !valor) errores[campo.name] = `${campo.label} es obligatorio.`
    else if (campo.maxLength && valor.length > campo.maxLength) errores[campo.name] = `Usa máximo ${campo.maxLength} caracteres.`
    else if (campo.numerico && valor && !/^\d+$/.test(valor)) errores[campo.name] = 'Usa solamente dígitos, sin espacios ni separadores.'
    else if (campo.type === 'select' && valor && !campo.options.includes(valor)) errores[campo.name] = 'Selecciona un valor admitido por Presupuesto.'
    else if (campo.type === 'email' && valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) errores[campo.name] = 'Ingresa un correo válido.'
  })
  if (completo && fila.nombres_confirmados !== true) errores.nombres_confirmados = 'Educación debe confirmar los nombres y apellidos.'
  return errores
}

export const camposPendientesTercero = (fila) => {
  const errores = validarTercero(fila, { completo: true })
  return [...CAMPOS_TERCEROS, { name: 'nombres_confirmados', label: 'Confirmación de nombres' }].filter((campo) => errores[campo.name])
}

export const validacionesDocumentoTerceros = (filas) => {
  const identificaciones = new Set()
  const errores = filas.flatMap((fila, i) => {
    const campos = validarTercero(fila, { completo: true })
    const identificacion = String(fila.cc_nit ?? '').trim()
    if (identificacion && identificaciones.has(identificacion)) campos.cc_nit = 'Identificación duplicada en el documento.'
    identificaciones.add(identificacion)
    return Object.entries(campos).map(([columna, mensaje]) => ({
      tipo_error: 'validacion_formato', fila_numero: i + 2, columna_nombre: columna, mensaje_error: mensaje
    }))
  })
  if (!filas.length) errores.push({ tipo_error: 'validacion_formato', mensaje_error: 'El documento no tiene terceros.' })
  return errores
}

export const terceroDesdeRegistro = (registro) => {
  const datos = registro.datos_tercero || {}
  const referencia = registro.nombre_beneficiario || ''
  const sugeridos = sugerirNombresTercero(referencia)
  const nombres = Object.fromEntries(Object.keys(sugeridos).map((clave) => [clave, datos[clave] ?? sugeridos[clave]]))
  return {
    id: String(registro.id), ...nombres,
    cc_nit: registro.identificacion || '', nombre_referencia: referencia,
    tipo_identificacion: codigoIdentificacionTercero(registro.tipo_identificacion),
    email: registro.email || '', telefono: registro.telefono || '',
    direccion: registro.direccion || '', ciudad_residencia: registro.ciudad || '',
    banco: datos.banco || '', tipo_cuenta: tipoCuentaTercero(datos.tipo_cuenta),
    numero_cuenta: datos.numero_cuenta || '', nombres_confirmados: datos.nombres_confirmados === true,
    ...FIJOS_TERCERO
  }
}

export const filaExportacionTercero = (fila) =>
  CAMPOS_TERCEROS.map(({ name }) => String(FIJOS_TERCERO[name] ?? fila[name] ?? '').trim())
