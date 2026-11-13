import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowDownToLine, Check, History, List, Plus, Save, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CAMPOS_RP, FIJOS_RP, nuevaFilaRP, validarFilaRP, validacionesDocumentoRP, vistaPreviaNumeracionRP } from '../lib/rpCargue'
import { descargarExcelRP } from '../lib/exportarRP'

const claveFila = (fila) => fila.id ?? fila.origen
const control = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-600'
const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

export default function EditorRP({ documentoId, userRole, onCambiosPendientes, onGuardado }) {
  const [documento, setDocumento] = useState(null)
  const [filas, setFilas] = useState([])
  const [guardadas, setGuardadas] = useState('[]')
  const [tercerosId, setTercerosId] = useState('')
  const [opciones, setOpciones] = useState([])
  const [activo, setActivo] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [filtro, setFiltro] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [ocupado, setOcupado] = useState(true)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)
  const [tabla, setTabla] = useState(false)
  const [campoNumero, setCampoNumero] = useState('no_rp')
  const [modoNumero, setModoNumero] = useState('consecutivo')
  const [inicio, setInicio] = useState('')
  const [previa, setPrevia] = useState(null)
  const [pagina, setPagina] = useState(0)
  const educacion = userRole === 'admin_educacion' && documento?.estado === 'borrador'
  const presupuesto = userRole === 'admin_presupuesto' && documento?.estado === 'enviado_para_revision'
  const editable = educacion || presupuesto
  const pendiente = JSON.stringify(filas) !== guardadas || tercerosId !== (documento?.terceros_id || '') || Boolean(previa)
  const fila = filas.find((f) => claveFila(f) === activo)
  const visibles = filas.filter((f) => `${f.nombre} ${f.tercero_presupuestal}`.toLocaleLowerCase().includes(filtro.toLocaleLowerCase()))
  const paginas = Math.max(1, Math.ceil(visibles.length / 25))
  const paginaActual = Math.min(pagina, paginas - 1)
  const mostrar = visibles.slice(paginaActual * 25, (paginaActual + 1) * 25)
  const cargar = useCallback(() => {
    return supabase.rpc('leer_rp_cargue', { p_documento_id: documentoId }).then(async ({ data, error: fallo }) => {
      setOcupado(true)
      setError(null)
      if (fallo) throw fallo
      if (!data || !Array.isArray(data.filas) || !Array.isArray(data.historial)) throw new Error('No se pudo leer el documento RP completo.')
      const { data: fuentes, error: falloFuentes } = await supabase.from('portal_documentos_cargue')
        .select('id,creado_en,cantidad_registros').eq('tipo_documento', 'terceros').eq('convocatoria_id', data.convocatoria_id)
        .in('estado', ['aprobado', 'finalizado']).not('aprobado_por', 'is', null).order('creado_en', { ascending: false })
      if (falloFuentes) throw falloFuentes
      setDocumento(data)
      setFilas(data.filas)
      setGuardadas(JSON.stringify(data.filas))
      setTercerosId(data.terceros_id || '')
      setOpciones(fuentes)
      setActivo(data.filas[0] ? claveFila(data.filas[0]) : null)
      setSeleccion([])
      setPrevia(null)
    }).catch((e) => setError(e.message)).finally(() => setOcupado(false))
  }, [documentoId])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    onCambiosPendientes?.(pendiente)
    return () => onCambiosPendientes?.(false)
  }, [pendiente, onCambiosPendientes])
  useEffect(() => {
    if (!pendiente) return
    const avisar = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pendiente])

  const ejecutar = async (accion) => {
    setOcupado(true); setError(null); setExito(null)
    try { await accion() } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const actualizar = (campo, valor) => {
    setFilas((anteriores) => anteriores.map((f) => claveFila(f) === activo ? {
      ...f, [campo]: valor,
      ...(campo === 'valor' ? { liquidacion: valor, valor_confirmado: false } : {}),
      ...(presupuesto && campo !== 'tercero_confirmado' ? { tercero_confirmado: false } : {})
    } : f))
    setPrevia(null); setExito(null)
  }
  const incorporar = () => ejecutar(async () => {
    if (!tercerosId) throw new Error('Selecciona el documento TERCEROS aprobado.')
    const { data, error: fallo } = await supabase.rpc('personas_terceros_rp', { p_terceros_id: tercerosId })
    if (fallo) throw fallo
    if (!Array.isArray(data)) throw new Error('No se pudo leer el documento TERCEROS aprobado.')
    const nuevas = [...filas]
    for (const persona of data) {
      const existente = nuevas.findIndex((r) => r.tercero_presupuestal === persona.identificacion)
      if (existente === -1) nuevas.push(nuevaFilaRP(persona))
      else if (!nuevas[existente].origen) nuevas[existente] = { ...nuevas[existente], origen: persona.origen, nombre: persona.nombre, modalidad: persona.modalidad || '' }
    }
    if (!data.length) throw new Error('El documento TERCEROS no tiene personas.')
    setFilas(nuevas); setActivo(claveFila(nuevas[0])); setSeleccion([]); setPrevia(null)
    setExito('Personas incorporadas sin sobrescribir importes. Revisa y guarda el borrador.')
  })
  const buscar = () => ejecutar(async () => {
    setResultados([])
    const { data, error: fallo } = await supabase.rpc('buscar_personas_rp', { p_busqueda: busqueda.trim() })
    if (fallo) throw fallo
    if (!Array.isArray(data)) throw new Error('La búsqueda no devolvió una lista válida.')
    setResultados(data)
    if (!data.length) setExito('No se encontraron personas con identificación numérica válida.')
  })
  const agregar = (persona) => {
    const existente = filas.find((f) => f.tercero_presupuestal === persona.identificacion)
    if (existente?.origen) { setError('Esta persona ya está en el documento.'); return }
    if (existente) {
      setFilas((anteriores) => anteriores.map((f) => f === existente ? {
        ...f, origen: persona.origen, nombre: persona.nombre, modalidad: persona.modalidad || ''
      } : f))
      setActivo(claveFila(existente)); setPrevia(null); setError(null)
      setExito('Origen vinculado sin reemplazar los importes ni los campos existentes. Revisa y guarda.')
      return
    }
    const nueva = nuevaFilaRP(persona)
    setFilas((anteriores) => [...anteriores, nueva]); setActivo(claveFila(nueva)); setPrevia(null); setExito(null)
  }
  const guardar = () => ejecutar(async () => {
    if (previa) throw new Error('Aplica o cancela la vista previa de numeración.')
    const errores = validacionesDocumentoRP(filas, 'borrador')
    if (!filas.length) errores.splice(0, 1)
    if (errores.length) throw new Error(errores.map((e) => `Fila ${e.fila_numero}: ${e.mensaje_error}`).join('\n'))
    const { data, error: fallo } = await supabase.rpc('guardar_rp_cargue', {
      p_documento_id: documentoId, p_terceros_id: tercerosId || null, p_filas: filas, p_editado_en: documento.editado_en
    })
    if (fallo) throw fallo
    if (!data || !Array.isArray(data.filas) || !data.editado_en || !Array.isArray(data.historial)) throw new Error('No se confirmó el guardado. Recarga para verificar.')
    setDocumento(data); setFilas(data.filas); setGuardadas(JSON.stringify(data.filas)); setSeleccion([])
    setActivo(data.filas[0] ? claveFila(data.filas[0]) : null)
    setExito('Cambios guardados. Guardar no envía ni aprueba el documento.'); onGuardado?.(data)
  })
  const exportar = () => ejecutar(async () => {
    if (pendiente) throw new Error('Guarda o descarta los cambios antes de descargar.')
    const { data, error: fallo } = await supabase.rpc('obtener_rp_exportacion', { p_documento_id: documentoId })
    if (fallo) throw fallo
    if (!Array.isArray(data)) throw new Error('No se recibió el documento completo para exportar.')
    await descargarExcelRP(data, `rp-${documentoId}.xlsx`)
    setExito('Excel de 16 columnas descargado. La descarga no aprueba el documento.')
  })
  const previsualizar = () => {
    try { setError(null); setPrevia({ campo: campoNumero, filas: vistaPreviaNumeracionRP(filas, seleccion, campoNumero, modoNumero, inicio) }) }
    catch (e) { setError(e.message) }
  }
  const aplicarNumeracion = () => {
    if (previa.filas.some((f) => f.anterior && f.anterior !== f.nuevo) && !window.confirm('Se reemplazarán números existentes en las filas indicadas. ¿Confirmas el reemplazo?')) return
    setFilas((anteriores) => anteriores.map((f) => {
      const cambio = previa.filas.find((p) => p.clave === claveFila(f))
      return cambio ? { ...f, [previa.campo]: cambio.nuevo, tercero_confirmado: false } : f
    }))
    setPrevia(null); setExito('Numeración aplicada localmente. Revisa y guarda para registrarla.')
  }
  const cambiarSeleccion = (clave) => {
    setSeleccion((antes) => antes.includes(clave) ? antes.filter((id) => id !== clave) : [...antes, clave])
    setPrevia(null)
  }

  if (!documento) return <div className="space-y-3">{error ? <><p role="alert" className="text-sm text-red-700">{error}</p><button className={boton} disabled={ocupado} onClick={cargar}>Reintentar</button></> : <p role="status">Consultando registro presupuestal…</p>}</div>
  const erroresFila = fila ? validarFilaRP(fila, educacion ? 'educacion' : 'completo') : {}
  const etapa = documento.estado === 'borrador' ? 'educacion' : 'completo'
  const pendientes = validacionesDocumentoRP(filas, etapa).length
  return <section className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-800">Educación / Presupuesto</p><h2 className="mt-1 text-xl font-bold text-slate-900">Registro presupuestal</h2>
        <p className="mt-2 text-sm text-slate-500">{filas.length} personas · {pendientes} pendientes para {etapa === 'educacion' ? 'enviar' : 'completar'} · {documento.estado.replaceAll('_', ' ')}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={boton} onClick={() => setTabla(!tabla)}><List size={16} />{tabla ? 'Vista de edición' : 'Ver 16 columnas'}</button>
        <button className={boton} disabled={ocupado || pendiente || !['admin_educacion', 'admin_presupuesto'].includes(userRole) || !['enviado_para_revision', 'aprobado', 'finalizado'].includes(documento.estado) || validacionesDocumentoRP(filas).length > 0}
          onClick={exportar}><ArrowDownToLine size={16} />Excel (.xlsx)</button>
        {editable && <button className={`${boton} !border-emerald-800 !bg-emerald-800 !text-white`} disabled={ocupado || !pendiente || Boolean(previa)} onClick={guardar}><Save size={16} />{ocupado ? 'Procesando…' : 'Guardar cambios'}</button>}
        {pendiente && <button className={boton} disabled={ocupado} onClick={() => { if (window.confirm('¿Descartar todos los cambios sin guardar?')) { setOcupado(true); cargar() } }}>Descartar</button>}
      </div>
    </header>
    {error && <p role="alert" className="flex items-start gap-2 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} className="shrink-0" />{error}</p>}
    {exito && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{exito}</p>}
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label htmlFor="rp-origen" className="text-xs font-bold uppercase tracking-wide text-slate-600">Documento TERCEROS aprobado de origen</label>
      <div className="mt-2 flex flex-wrap gap-2"><select id="rp-origen" className={`${control} !w-auto min-w-0 flex-1`} value={tercerosId} disabled={!educacion || ocupado || Boolean(documento.terceros_id)}
        onChange={(e) => { setTercerosId(e.target.value); setPrevia(null) }}>
        <option value="">Seleccionar documento aprobado…</option>
        {opciones.map((o) => <option key={o.id} value={o.id}>{o.id.slice(0, 8)} · {new Date(o.creado_en).toLocaleDateString('es-CO')} · {o.cantidad_registros} personas</option>)}
      </select>{educacion && <button className={boton} disabled={ocupado || !tercerosId} onClick={incorporar}><Plus size={16} />Incorporar personas</button>}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">Se copian los datos, no se modifican los perfiles originales. Los importes se digitan y confirman, sin calcular salarios mínimos. La búsqueda adicional permite otras convocatorias; Presupuesto verifica su existencia y los códigos en el programa externo.</p>
    </div>
    {educacion && <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); buscar() }}>
        <label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-semibold text-slate-600">Agregar desde la base de datos (todas las convocatorias)</span>
          <input className={control} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o identificación, mínimo 3 caracteres" /></label>
        <button className={`${boton} self-end`} disabled={ocupado || busqueda.trim().length < 3}><Search size={16} />Buscar</button>
      </form>
      {resultados.length > 0 && <ul className="max-h-64 divide-y divide-slate-100 overflow-auto">{resultados.map((p) => <li key={p.origen} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="min-w-0 break-words"><strong>{p.nombre}</strong><span className="block text-xs text-slate-500">{p.identificacion} · {p.modalidad || 'Modalidad sin informar'} · {p.origen.split(':')[0]}</span></span>
        <button className={boton} disabled={ocupado || filas.some((f) => f.tercero_presupuestal === p.identificacion && f.origen)} onClick={() => agregar(p)} aria-label={`${filas.some((f) => f.tercero_presupuestal === p.identificacion) ? 'Vincular' : 'Agregar'} ${p.nombre}`}><Plus size={16} /></button>
      </li>)}</ul>}
    </div>}
    {presupuesto && <fieldset disabled={ocupado} className="min-w-0 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h3 className="text-sm font-bold text-slate-900">Asignación de No. RP y No. CDP</h3>
      <p className="text-xs leading-5 text-slate-600">Manual: edita cada persona. Para asignación común o consecutiva, selecciona personas y revisa la vista previa. El orden es el de la lista completa, no cambia al filtrar. RP y CDP se asignan por separado.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">Columna<select className={`${control} mt-1`} value={campoNumero} onChange={(e) => { setCampoNumero(e.target.value); setPrevia(null) }}><option value="no_rp">No. RP</option><option value="no_cdp">No. CDP</option></select></label>
        <label className="text-xs font-semibold">Modo<select className={`${control} mt-1`} value={modoNumero} onChange={(e) => { setModoNumero(e.target.value); setPrevia(null) }}><option value="consecutivo">Consecutivo</option><option value="comun">Mismo número</option></select></label>
        <label className="text-xs font-semibold">Número inicial<input className={`${control} mt-1`} inputMode="numeric" maxLength={10} value={inicio} onChange={(e) => { setInicio(e.target.value); setPrevia(null) }} /></label>
        <button className={`${boton} self-end`} disabled={ocupado || !seleccion.length} onClick={previsualizar}>Vista previa ({seleccion.length})</button>
      </div>
      <div className="flex flex-wrap gap-2"><button className={boton} disabled={ocupado} onClick={() => { setSeleccion(visibles.map(claveFila)); setPrevia(null) }}>Seleccionar filtrados ({visibles.length})</button><button className={boton} disabled={ocupado} onClick={() => { setSeleccion([]); setPrevia(null) }}>Quitar selección</button></div>
      {previa && <div className="space-y-3 rounded-lg border border-amber-300 bg-white p-3">
        <p className="text-sm font-bold">{previa.campo === 'no_rp' ? 'No. RP' : 'No. CDP'} · {previa.filas.length} cambios por confirmar</p>
        <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Tercero / orden</th><th className="p-2">Anterior</th><th className="p-2">Nuevo</th></tr></thead><tbody>{previa.filas.map((p, i) => <tr key={p.clave}><td className="p-2">{i + 1}. {p.identificacion} · {p.nombre}</td><td className="p-2">{p.anterior || 'Vacío'}</td><td className="p-2 font-mono">{p.nuevo}</td></tr>)}</tbody></table></div>
        <div className="flex gap-2"><button className={boton} disabled={ocupado} onClick={aplicarNumeracion}><Check size={16} />Confirmar aplicación</button><button className={boton} disabled={ocupado} onClick={() => setPrevia(null)}>Cancelar</button></div>
      </div>}
    </fieldset>}
    <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Filtrar personas del documento</span><input className={control} value={filtro} onChange={(e) => { setFiltro(e.target.value); setPagina(0) }} placeholder="Nombre o identificación" /></label>
    {tabla ? <div className="max-h-[650px] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full whitespace-nowrap text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{CAMPOS_RP.map((c) => <th key={c.name} className="p-3">{c.label}</th>)}</tr></thead><tbody>{mostrar.map((f) => <tr key={claveFila(f)} className="border-t border-slate-100">{CAMPOS_RP.map((c) => <td key={c.name} className="max-w-80 whitespace-normal break-words p-3">{f[c.name] || '—'}</td>)}</tr>)}</tbody></table>
    </div> : <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(230px,1fr)_minmax(0,2fr)]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200">
        <p className="border-b border-slate-200 bg-slate-50 p-3 text-xs font-bold uppercase tracking-wide">Personas · orden del documento</p>
        <ul className="max-h-[700px] divide-y divide-slate-100 overflow-auto">{mostrar.map((f) => <li key={claveFila(f)} className={`flex items-start gap-2 p-3 ${activo === claveFila(f) ? 'bg-emerald-50' : 'bg-white'}`}>
          {presupuesto && <input type="checkbox" className="mt-2 h-4 w-4 shrink-0" aria-label={`Seleccionar ${f.nombre}`} checked={seleccion.includes(claveFila(f))} disabled={ocupado} onChange={() => cambiarSeleccion(claveFila(f))} />}
          <button className="min-w-0 flex-1 text-left" onClick={() => setActivo(claveFila(f))}><span className="block break-words text-sm font-semibold text-slate-900">{f.nombre}</span><span className="mt-1 block text-xs text-slate-500">{f.tercero_presupuestal} · {f.modalidad || 'Sin modalidad'}</span><span className={`mt-2 block text-[11px] font-semibold ${Object.keys(validarFilaRP(f, etapa)).length ? 'text-amber-700' : 'text-emerald-800'}`}>{Object.keys(validarFilaRP(f, etapa)).length ? 'Por completar' : 'Datos confirmados'}</span></button>
        </li>)}</ul>
        {!mostrar.length && <p className="p-4 text-sm text-slate-500">No hay personas para mostrar.</p>}
      </div>
      {fila ? <div className="min-w-0 space-y-5 rounded-xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold text-slate-900">{fila.nombre}</h3><p className="mt-1 break-all font-mono text-xs text-slate-500">{fila.tercero_presupuestal} · {fila.origen || 'Origen pendiente de vincular'}</p></div>
          {educacion && <button className={boton} disabled={ocupado} aria-label={`Quitar ${fila.nombre} del RP`} onClick={() => {
            if (!window.confirm('¿Quitar esta persona del borrador RP? No elimina su perfil ni el TERCERO aprobado.')) return
            setFilas((antes) => antes.filter((f) => claveFila(f) !== activo)); setActivo(null); setSeleccion([]); setPrevia(null)
          }}><Trash2 size={16} /></button>}</div>
        {['educacion', 'presupuesto'].map((rol) => <fieldset key={rol} disabled={ocupado || !(rol === 'educacion' ? educacion : presupuesto)} className="space-y-3">
          <legend className="mb-3 w-full border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{rol === 'educacion' ? '01 · Completa Educación' : '02 · Completa Presupuesto'}</legend>
          <div className="grid gap-4 sm:grid-cols-2">{CAMPOS_RP.filter((c) => c.rol === rol).map((c) => <label key={c.name} className={`min-w-0 text-xs font-semibold text-slate-700 ${c.name === 'descripcion' ? 'sm:col-span-2' : ''}`}>
            {c.label}{!c.opcional && ' *'}{c.name in FIJOS_RP && <span className="ml-1 font-normal text-slate-400">Fijo</span>}
            {c.name === 'descripcion' ? <textarea className={`${control} mt-1 min-h-24`} maxLength={500} value={fila[c.name]} onChange={(e) => actualizar(c.name, e.target.value)} /> :
              <input className={`${control} mt-1 font-mono`} value={fila[c.name]} disabled={c.name in FIJOS_RP || ['tercero_presupuestal', 'liquidacion'].includes(c.name)}
                inputMode={c.importe ? 'decimal' : c.max || c.fecha ? 'numeric' : 'text'} maxLength={c.max || c.maxLength || (c.fecha ? 8 : undefined)}
                placeholder={c.fecha ? 'DDMMYYYY' : c.importe ? '0.00' : ''} onChange={(e) => actualizar(c.name, e.target.value)} />}
            {erroresFila[c.name] && <span className="mt-1 block text-[11px] font-normal text-amber-800">{erroresFila[c.name]}</span>}
          </label>)}</div>
          {rol === 'educacion' ? <label className="flex items-start gap-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-950"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={fila.valor_confirmado} onChange={(e) => actualizar('valor_confirmado', e.target.checked)} />Confirmo el valor a pagar para esta persona y su modalidad. Liquidación tiene el mismo importe.</label> :
            <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={fila.tercero_confirmado} onChange={(e) => actualizar('tercero_confirmado', e.target.checked)} />Verifiqué que el tercero, entidad, rubro y fuente existen en el sistema externo de Presupuesto. No basta con encontrarlos en FOCADES.</label>}
        </fieldset>)}
      </div> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">Selecciona una persona para revisar sus 16 campos.</p>}
    </div>}
    <nav aria-label="Páginas de personas RP" className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{visibles.length} resultados · Página {paginaActual + 1} de {paginas} · 25 por página</span><div className="flex gap-2"><button className={boton} disabled={paginaActual === 0} onClick={() => setPagina(paginaActual - 1)}>Anterior</button><button className={boton} disabled={paginaActual >= paginas - 1} onClick={() => setPagina(paginaActual + 1)}>Siguiente</button></div></nav>
    <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700"><History size={16} className="mr-2 inline" />Historial de guardados y decisiones ({documento.historial.length})</summary>
      <ul className="mt-3 max-h-96 space-y-3 overflow-auto">{documento.historial.map((h) => <li key={h.id} className="rounded-lg bg-slate-50 p-3 text-xs leading-5"><strong>{h.comentario}</strong><p>{new Date(h.fecha).toLocaleString('es-CO')} · {h.rol_quien_transiciona} · {h.usuario_id}</p>
        {h.datos_cambio?.antes && <details><summary className="cursor-pointer font-semibold">Ver copia anterior y nueva</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all p-2 text-[10px]">{JSON.stringify(h.datos_cambio, null, 2)}</pre></details>}</li>)}</ul>
    </details>
  </section>
}
