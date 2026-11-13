import { createElement, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert,
  Download, MapPin, Pencil, Phone, Plus, Save, Search, ShieldCheck,
  Trash2, UserRound, Users
} from 'lucide-react'
import {
  CAMPOS_TERCEROS, camposPendientesTercero, normalizarBusquedaTercero, validarTercero
} from '../lib/tercerosCargue'

const GRUPOS = [
  { titulo: 'Identificación', descripcion: 'Los datos que identifican al tercero.', icono: UserRound, campos: ['nombre_razon_social', 'tipo_identificacion', 'cc_nit'] },
  { titulo: 'Contacto', descripcion: 'Canales para comunicarse con esta persona.', icono: Phone, campos: ['email', 'telefono'] },
  { titulo: 'Ubicación', descripcion: 'Dirección y municipio de residencia.', icono: MapPin, campos: ['direccion', 'ciudad'] }
]
const POR_PAGINA = 8
const accion = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const TextoTercero = ({ value, ...props }) => {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const elemento = ref.current
    let ancho = -1
    const ajustar = () => {
      elemento.style.height = 'auto'
      elemento.style.height = `${elemento.scrollHeight + 2}px`
    }
    ajustar()
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada.contentRect.width === ancho) return
      ancho = entrada.contentRect.width
      ajustar()
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [value])
  return <textarea {...props} ref={ref} value={value} />
}

const EditorTerceros = ({
  filas, campos, ocupado, puedeEditar, puedePrecargar, hayCambios, onActualizar,
  onAgregar, onEliminar, onGuardar, onPrecargar, onCancelar
}) => {
  const prefijo = useId()
  const detalleRef = useRef(null)
  const listaRef = useRef(null)
  const agregarRef = useRef(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [seleccionId, setSeleccionId] = useState(null)
  const [identificacionSeleccionada, setIdentificacionSeleccionada] = useState('')
  const [editando, setEditando] = useState(false)
  const [mostrarDetalleMovil, setMostrarDetalleMovil] = useState(false)
  const [eliminandoId, setEliminandoId] = useState(null)

  const completos = filas.filter((fila) => camposPendientesTercero(fila).length === 0).length
  const termino = normalizarBusquedaTercero(busqueda).trim()
  const filtradas = filas.filter((fila) => {
    if (editando && fila.id === seleccionId) return true
    const coincide = CAMPOS_TERCEROS.some((campo) => normalizarBusquedaTercero(fila[campo.name]).includes(termino))
    return coincide && (filtro === 'todos' || camposPendientesTercero(fila).length > 0)
  })
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const filaSeleccionada = filtradas.find((fila) => fila.id === seleccionId) ||
    (identificacionSeleccionada && filtradas.find((fila) => fila.cc_nit.trim() === identificacionSeleccionada.trim()))
  const paginaActual = filaSeleccionada ? Math.floor(filtradas.indexOf(filaSeleccionada) / POR_PAGINA) + 1 : Math.min(pagina, paginas)
  const visibles = filtradas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)
  const seleccionada = filaSeleccionada || visibles[0]
  const errores = seleccionada ? validarTercero(seleccionada) : {}
  const pendientes = seleccionada ? camposPendientesTercero(seleccionada) : []
  const indice = seleccionada ? filtradas.findIndex((fila) => fila.id === seleccionada.id) : -1

  const enfocarDetalle = () => {
    requestAnimationFrame(() => detalleRef.current?.focus())
  }

  const seleccionar = (fila, editar = false) => {
    setSeleccionId(fila.id)
    setIdentificacionSeleccionada(fila.cc_nit || '')
    setEditando(editar)
    setEliminandoId(null)
    setMostrarDetalleMovil(true)
    enfocarDetalle()
  }

  const agregar = () => {
    const id = onAgregar()
    setBusqueda('')
    setFiltro('todos')
    setPagina(Math.ceil((filas.length + 1) / POR_PAGINA))
    seleccionar({ id }, true)
  }

  const mover = (direccion) => {
    const siguiente = filtradas[indice + direccion]
    if (!siguiente) return
    setPagina(Math.floor((indice + direccion) / POR_PAGINA) + 1)
    seleccionar(siguiente)
  }

  const eliminar = () => {
    const siguiente = filtradas[indice + 1] || filtradas[indice - 1]
    onEliminar(seleccionada.id)
    setSeleccionId(siguiente?.id || null)
    setIdentificacionSeleccionada(siguiente?.cc_nit || '')
    setEliminandoId(null)
    setEditando(false)
    if (siguiente) enfocarDetalle()
    else {
      setMostrarDetalleMovil(false)
      requestAnimationFrame(() => agregarRef.current?.focus())
    }
  }

  const volverALista = () => {
    setMostrarDetalleMovil(false)
    requestAnimationFrame(() => listaRef.current?.focus())
  }

  return (
    <section aria-label="Editor de terceros" className="min-w-0 space-y-5 text-slate-800">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Gestión de datos · Terceros</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cada tercero, en detalle.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Encuentra una persona, revisa su ficha completa y edita sin perder de vista el listado.
          </p>
          {!puedeEditar && <p className="mt-2 text-xs font-medium text-slate-500">Solo lectura. La edición requiere un documento en borrador y un rol autorizado.</p>}
        </div>
        {puedeEditar && (
          <button ref={agregarRef} type="button" onClick={agregar} disabled={ocupado} className={`${accion} shrink-0 bg-slate-900 text-white hover:bg-slate-700`}>
            <Plus size={17} aria-hidden="true" /> Nuevo tercero
          </button>
        )}
      </header>

      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50/70 py-4">
        {[
          { valor: filas.length, etiqueta: 'Terceros', color: 'text-slate-900' },
          { valor: completos, etiqueta: 'Fichas completas', color: 'text-emerald-700' },
          { valor: filas.length - completos, etiqueta: 'Por completar', color: 'text-amber-700' }
        ].map((item) => (
          <div key={item.etiqueta} className="min-w-0 px-3 sm:px-5">
            <p className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.valor}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.etiqueta}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.7fr)]">
        <div className={`${mostrarDetalleMovil ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col border-slate-200 bg-slate-50/60 lg:border-r`}>
          <div className="space-y-3 border-b border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 ref={listaRef} tabIndex={-1} className="text-sm font-bold outline-none">Directorio</h3>
              <span role="status" className="text-xs tabular-nums text-slate-500">{filtradas.length} de {filas.length}</span>
            </div>
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden="true" />
              <input
                type="search" aria-label="Buscar terceros" value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); setEliminandoId(null); setEditando(false); setSeleccionId(null); setIdentificacionSeleccionada('') }}
                placeholder="Nombre, documento, correo…"
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
              />
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Filtrar terceros">
              {[['todos', 'Todos'], ['pendientes', 'Por completar']].map(([valor, texto]) => (
                <button key={valor} type="button" aria-pressed={filtro === valor}
                  onClick={() => { setFiltro(valor); setPagina(1); setEliminandoId(null); setEditando(false); setSeleccionId(null); setIdentificacionSeleccionada('') }}
                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${filtro === valor ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
                  {texto}
                </button>
              ))}
            </div>
          </div>
          <nav aria-label="Listado de terceros" className="max-h-[560px] flex-1 overflow-y-auto p-2">
            {visibles.map((fila) => {
              const activa = fila.id === seleccionada?.id
              const completo = camposPendientesTercero(fila).length === 0
              return (
                <button type="button" key={fila.id} onClick={() => seleccionar(fila)}
                  aria-current={activa ? 'true' : undefined}
                  className={`mb-1 flex min-h-20 w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${activa ? 'border-emerald-200 bg-white shadow-sm' : 'border-transparent hover:bg-white'}`}>
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${activa ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`} aria-hidden="true">
                    {(fila.nombre_razon_social || '?').trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toLocaleUpperCase('es')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold leading-5 text-slate-900">{fila.nombre_razon_social || 'Nuevo tercero'}</span>
                    <span className="mt-1 block break-all text-xs text-slate-500">{fila.tipo_identificacion || 'Documento'} · {fila.cc_nit || 'Sin identificación'}</span>
                    <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-medium ${completo ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {completo ? <Check size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}
                      {completo ? 'Ficha completa' : 'Datos por completar'}
                    </span>
                  </span>
                  {activa && <ArrowRight size={15} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />}
                </button>
              )
            })}
            {visibles.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Search size={24} className="mx-auto mb-3 text-slate-400" aria-hidden="true" />
                <p className="text-sm font-semibold">{filas.length ? 'Sin coincidencias' : 'Tu directorio está vacío'}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{filas.length ? 'Prueba otro nombre o cambia los filtros.' : 'Precarga aspirantes o agrega un tercero.'}</p>
                {filas.length > 0 && (
                  <button type="button" onClick={() => { setBusqueda(''); setFiltro('todos'); setPagina(1) }} className="mt-3 min-h-10 text-sm font-semibold text-emerald-700 underline underline-offset-4">Limpiar filtros</button>
                )}
              </div>
            )}
          </nav>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <span className="text-xs text-slate-500">Página {paginaActual} de {paginas}</span>
            <div className="flex gap-1">
              <button type="button" aria-label="Página anterior" onClick={() => { setPagina(paginaActual - 1); setSeleccionId(null); setIdentificacionSeleccionada(''); setEditando(false) }} disabled={paginaActual === 1} className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-30"><ChevronLeft size={18} /></button>
              <button type="button" aria-label="Página siguiente" onClick={() => { setPagina(paginaActual + 1); setSeleccionId(null); setIdentificacionSeleccionada(''); setEditando(false) }} disabled={paginaActual === paginas} className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-30"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>

        <div className={`${mostrarDetalleMovil ? 'block' : 'hidden lg:block'} min-w-0`}>
          {seleccionada ? (
            <article key={seleccionada.id} aria-label="Ficha del tercero" className="min-w-0">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <button type="button" onClick={volverALista} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600 lg:hidden"><ArrowLeft size={16} /> Volver al directorio</button>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Ficha del tercero · {indice + 1} de {filtradas.length}</span>
                  <div className="flex gap-1">
                    <button type="button" aria-label="Tercero anterior" onClick={() => mover(-1)} disabled={indice <= 0} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-30"><ChevronLeft size={17} /></button>
                    <button type="button" aria-label="Tercero siguiente" onClick={() => mover(1)} disabled={indice >= filtradas.length - 1} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-30"><ChevronRight size={17} /></button>
                  </div>
                </div>
                <h3 ref={detalleRef} tabIndex={-1} className="mt-2 break-words text-xl font-bold leading-7 tracking-tight text-slate-900 outline-none sm:text-2xl">{seleccionada.nombre_razon_social || 'Nuevo tercero'}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pendientes.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                    {pendientes.length ? <CircleAlert size={13} aria-hidden="true" /> : <ShieldCheck size={13} aria-hidden="true" />}
                    {7 - pendientes.length} de 7 campos completos
                  </span>
                  {puedeEditar && (
                    <button type="button" onClick={() => {
                      setSeleccionId(seleccionada.id)
                      setIdentificacionSeleccionada(seleccionada.cc_nit || '')
                      setEditando(!editando)
                    }} disabled={ocupado}
                      aria-pressed={editando}
                      className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50">
                      {editando ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
                      {editando ? 'Ver ficha' : 'Editar ficha'}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-7 p-5 sm:p-6">
                {editando && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">Los cambios se conservan al cambiar de ficha. Usa <strong>Guardar cambios</strong> para guardarlos en el documento. Solo los campos con * son obligatorios.</p>}
                {GRUPOS.map(({ titulo, descripcion, icono, campos: nombres }) => (
                  <section key={titulo} aria-label={titulo}>
                    <div className="mb-4 flex items-start gap-3">
                      <span className="rounded-lg bg-slate-100 p-2 text-slate-500">{createElement(icono, { size: 16, 'aria-hidden': true })}</span>
                      <div><h4 className="text-sm font-bold text-slate-900">{titulo}</h4><p className="mt-0.5 text-xs leading-5 text-slate-500">{descripcion}</p></div>
                    </div>
                    <dl className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                      {nombres.map((nombre) => {
                        const campo = campos.find((item) => item.name === nombre)
                        const id = `${prefijo}-${nombre}`
                        const error = errores[nombre]
                        const valor = seleccionada[nombre] || ''
                        const anchoCompleto = ['nombre_razon_social', 'email', 'direccion'].includes(nombre)
                        const actualizar = (valor) => {
                          if (nombre === 'cc_nit') setIdentificacionSeleccionada(valor)
                          onActualizar(seleccionada.id, nombre, valor)
                        }
                        const clase = `min-h-11 w-full min-w-0 rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-emerald-600/15 disabled:bg-slate-50 ${error ? 'border-red-400' : 'border-slate-300 focus:border-emerald-600'}`
                        return (
                          <div key={nombre} className={`min-w-0 ${anchoCompleto ? 'sm:col-span-2' : ''}`}>
                            <dt className="mb-1.5 text-xs font-medium text-slate-500">
                              {editando ? <label htmlFor={id}>{campo.label}{campo.required && <span className="text-emerald-700"> *</span>}</label> : campo.label}
                            </dt>
                            <dd className="min-w-0">
                              {editando ? (
                                <>
                                  {campo.type === 'select' ? (
                                    <select id={id} value={valor} disabled={ocupado} onChange={(e) => actualizar(e.target.value)} className={clase}>
                                      <option value="">Sin registrar</option>
                                      {valor && !campo.options.includes(valor) && <option value={valor}>{valor}</option>}
                                      {campo.options.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
                                    </select>
                                  ) : anchoCompleto || nombre === 'ciudad' ? (
                                    <TextoTercero id={id} rows={2} value={valor} disabled={ocupado}
                                      required={campo.required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
                                      autoComplete={nombre === 'email' ? 'email' : nombre === 'direccion' ? 'street-address' : nombre === 'ciudad' ? 'address-level2' : 'name'}
                                      inputMode={nombre === 'email' ? 'email' : 'text'}
                                      onChange={(e) => actualizar(e.target.value.replace(/[\r\n]/g, ' '))}
                                      className={`${clase} resize-none overflow-hidden break-words`} />
                                  ) : (
                                    <input id={id} type={campo.type} value={valor} required={campo.required} disabled={ocupado}
                                      aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
                                      onChange={(e) => actualizar(e.target.value)} className={clase} />
                                  )}
                                  {error && <p id={`${id}-error`} className="mt-1.5 text-xs leading-5 text-red-700">{error}</p>}
                                </>
                              ) : (
                                <p className={`break-words text-sm leading-6 [overflow-wrap:anywhere] ${valor ? 'text-slate-900' : 'italic text-slate-400'}`}>{valor || 'Sin registrar'}</p>
                              )}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                  </section>
                ))}
                {pendientes.length > 0 && (
                  <p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
                    <span className="font-semibold text-amber-800">Por completar: </span>
                    {pendientes.map((campo) => campo.label.toLocaleLowerCase('es')).join(', ')}.
                    {' '}Los datos opcionales no impiden guardar.
                  </p>
                )}
              </div>

              {puedeEditar && (
                <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                  {eliminandoId === seleccionada.id ? (
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">¿Quitar este tercero del documento?</p>
                      <p className="mt-1 text-xs leading-5 text-red-700">No se elimina su inscripción. La eliminación del documento se hará al guardar cambios.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={eliminar} disabled={ocupado} className={`${accion} bg-red-700 text-white hover:bg-red-800`}>Sí, quitar tercero</button>
                        <button type="button" onClick={() => setEliminandoId(null)} disabled={ocupado} className={`${accion} border border-red-200 text-red-800`}>Conservar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setEliminandoId(seleccionada.id)} disabled={ocupado} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-xs font-medium text-slate-500 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"><Trash2 size={14} aria-hidden="true" /> Quitar del documento</button>
                  )}
                </div>
              )}
            </article>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
              <span className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-emerald-700"><Users size={30} aria-hidden="true" /></span>
              <h3 className="text-lg font-bold text-slate-900">Una ficha, toda la información</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">Selecciona un tercero del directorio para consultar o editar sus datos completos.</p>
            </div>
          )}
        </div>
      </div>

      <footer className="z-20 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.2)] sm:sticky sm:bottom-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="status" className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${hayCambios ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" />
            {ocupado ? 'Procesando documento…' : hayCambios ? 'Tienes cambios sin guardar' : 'Sin cambios pendientes'}
          </div>
          {puedePrecargar && (
            <button type="button" onClick={onPrecargar} disabled={ocupado || hayCambios} title={hayCambios ? 'Guarda los cambios antes de precargar' : undefined}
              className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-emerald-700 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
              <Download size={15} aria-hidden="true" /> Precargar desde aspirantes
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="shrink-0" aria-hidden="true" /> La edición solo afecta este documento, no la ficha del aspirante.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onCancelar} disabled={ocupado} className={`${accion} flex-1 border border-slate-300 text-slate-600 hover:bg-slate-50 sm:flex-none sm:whitespace-nowrap`}>Volver</button>
            {puedeEditar && <button type="button" onClick={onGuardar} disabled={ocupado || !hayCambios} className={`${accion} flex-1 bg-emerald-700 text-white hover:bg-emerald-800 sm:flex-none sm:whitespace-nowrap`}><Save size={16} aria-hidden="true" /> {ocupado ? 'Guardando…' : 'Guardar cambios'}</button>}
          </div>
        </div>
      </footer>
    </section>
  )
}

export default EditorTerceros
