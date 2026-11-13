export const FIJOS_RP = Object.freeze({
  origen_legal_apropiacion: '5', proyecto: '841', entidad: '9901',
  rubro_presupuestal: '2.3.2.02.02.009', firma_mecanica: 'NO'
})

export const CAMPOS_RP = [
  { name: 'no_rp', label: 'No. RP', rol: 'presupuesto', max: 10 },
  { name: 'subconsecutivo', label: 'SubConsecutivo', rol: 'presupuesto', max: 4 },
  { name: 'descripcion', label: 'Descripción', rol: 'presupuesto', maxLength: 500 },
  { name: 'fecha', label: 'Fecha', rol: 'presupuesto', fecha: true },
  { name: 'no_cdp', label: 'No. CDP', rol: 'presupuesto', max: 10 },
  { name: 'subconsecutivo_cdp', label: 'SubConsecutivo CDP', rol: 'presupuesto', max: 4 },
  { name: 'tercero_presupuestal', label: 'Tercero Presupuestal', rol: 'educacion', max: 15 },
  { name: 'origen_legal_apropiacion', label: 'Origen Legal Apropiación', rol: 'educacion', max: 4 },
  { name: 'proyecto', label: 'Proyecto', rol: 'educacion', max: 4 },
  { name: 'entidad', label: 'Entidad', rol: 'educacion', max: 4 },
  { name: 'rubro_presupuestal', label: 'Rubro Presupuestal', rol: 'educacion', maxLength: 30 },
  { name: 'fuente_financiacion', label: 'Fuente de Financiación', rol: 'presupuesto', max: 4 },
  { name: 'valor', label: 'Valor', rol: 'educacion', importe: true },
  { name: 'liquidacion', label: 'Liquidación', rol: 'educacion', importe: true },
  { name: 'contrato', label: 'Contrato', rol: 'presupuesto', opcional: true },
  { name: 'firma_mecanica', label: 'Firma Mecánica', rol: 'educacion' }
]

export const importeValidoRP = (valor) => typeof valor === 'string' && /^\d{1,13}(\.\d{1,2})?$/.test(valor) && /[1-9]/.test(valor)

export const fechaValidaRP = (valor) => {
  if (typeof valor !== 'string' || !/^\d{8}$/.test(valor)) return false
  const dia = Number(valor.slice(0, 2)), mes = Number(valor.slice(2, 4)), anio = Number(valor.slice(4))
  const fecha = new Date(0)
  fecha.setUTCFullYear(anio, mes - 1, dia)
  return anio > 0 && fecha.getUTCDate() === dia && fecha.getUTCMonth() === mes - 1 && fecha.getUTCFullYear() === anio
}

export const nuevaFilaRP = (persona) => ({
  ...Object.fromEntries(CAMPOS_RP.map((c) => [c.name, ''])), ...FIJOS_RP,
  id: null, origen: persona.origen, nombre: persona.nombre, modalidad: persona.modalidad || '',
  tercero_presupuestal: persona.identificacion, valor_confirmado: false, tercero_confirmado: false
})

export const validarFilaRP = (fila, etapa = 'completo') => {
  const errores = {}
  if (etapa !== 'borrador' && !fila.origen) errores.origen = 'Vincula la persona a una fuente antes de enviar.'
  for (const campo of CAMPOS_RP) {
    const valor = fila[campo.name] ?? ''
    const requerido = etapa === 'completo' || (etapa === 'educacion' && campo.rol === 'educacion')
    if (typeof valor !== 'string') { errores[campo.name] = `${campo.label}: se requiere texto.`; continue }
    if (!valor) {
      if (requerido && !campo.opcional) errores[campo.name] = `${campo.label} es obligatorio.`
      continue
    }
    if (campo.max && !new RegExp(`^\\d{1,${campo.max}}$`).test(valor)) errores[campo.name] = `${campo.label}: máximo ${campo.max} dígitos.`
    if (campo.maxLength && [...valor].length > campo.maxLength) errores[campo.name] = `${campo.label}: máximo ${campo.maxLength} caracteres.`
    if (campo.importe && !importeValidoRP(valor)) errores[campo.name] = `${campo.label}: importe mayor que cero, hasta 13 enteros y 2 decimales, con punto decimal.`
    if (campo.fecha && !fechaValidaRP(valor)) errores[campo.name] = 'Fecha inválida; usa DDMMYYYY.'
  }
  for (const [campo, valor] of Object.entries(FIJOS_RP)) if (fila[campo] !== valor) errores[campo] = `El valor fijo debe ser ${valor}.`
  if (fila.valor && fila.liquidacion && importeValidoRP(fila.valor) && importeValidoRP(fila.liquidacion)) {
    if (centavosRP(fila.valor) !== centavosRP(fila.liquidacion)) errores.liquidacion = 'Liquidación debe ser igual a Valor.'
  }
  if (etapa !== 'borrador' && fila.valor_confirmado !== true) errores.valor_confirmado = 'Educación debe confirmar el importe.'
  if (etapa === 'completo' && fila.tercero_confirmado !== true) errores.tercero_confirmado = 'Presupuesto debe confirmar la existencia del tercero y los códigos en el sistema externo.'
  return errores
}

export const centavosRP = (valor) => {
  const [entero, decimal = ''] = valor.split('.')
  return BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'))
}

export const validacionesDocumentoRP = (filas, etapa = 'completo') => {
  const errores = []
  const ids = new Set()
  if (!filas.length) errores.push({ tipo_error: 'validacion_referencia', mensaje_error: 'Agrega al menos una persona.' })
  filas.forEach((fila, i) => {
    for (const [campo, mensaje] of Object.entries(validarFilaRP(fila, etapa))) errores.push({
      tipo_error: 'validacion_formato', fila_numero: i + 2, columna_nombre: campo, mensaje_error: mensaje
    })
    if (ids.has(fila.tercero_presupuestal)) errores.push({ tipo_error: 'duplicado', fila_numero: i + 2, mensaje_error: 'Tercero repetido en el documento.' })
    ids.add(fila.tercero_presupuestal)
  })
  return errores
}

export const vistaPreviaNumeracionRP = (filas, ids, campo, modo, inicio) => {
  if (!['no_rp', 'no_cdp'].includes(campo) || !['comun', 'consecutivo'].includes(modo)) throw new Error('Configuración de numeración inválida.')
  if (!/^\d{1,10}$/.test(inicio)) throw new Error('Indica un número inicial de hasta 10 dígitos.')
  const seleccionadas = filas.filter((f) => ids.includes(f.id ?? f.origen))
  if (!seleccionadas.length) throw new Error('Selecciona al menos una persona.')
  return seleccionadas.map((fila, i) => {
    const numero = (BigInt(inicio) + (modo === 'consecutivo' ? BigInt(i) : 0n)).toString().padStart(inicio.length, '0')
    if (numero.length > 10) throw new Error('La secuencia supera los 10 dígitos. No se aplicó ningún cambio.')
    return { clave: fila.id ?? fila.origen, nombre: fila.nombre, identificacion: fila.tercero_presupuestal, anterior: fila[campo], nuevo: numero }
  })
}
