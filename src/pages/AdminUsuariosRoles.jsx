import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertCircle, BookOpen, Check, CircleDollarSign, Clock3, Eye, Landmark, Loader2, Search, Save, ShieldCheck, ShieldX, UserCog, UserPlus, Wallet } from 'lucide-react'
import { showConfirmAlert, showErrorAlert, showSuccessAlert } from '../lib/alerts'
import { supabase } from '../lib/supabase'

const ROLES_OPERATIVOS = [
  { value: 'admin_educacion', label: 'Educación', detail: 'Gestiona TERCEROS y prepara RP.', icon: BookOpen },
  { value: 'admin_presupuesto', label: 'Presupuesto', detail: 'Revisa y aprueba TERCEROS y RP.', icon: ShieldCheck },
  { value: 'admin_contabilidad', label: 'Contabilidad', detail: 'Gestiona OP y asientos contables.', icon: CircleDollarSign },
  { value: 'admin_pagos', label: 'Pagos', detail: 'Gestiona SIAFE y completa pagos.', icon: Wallet },
  { value: 'admin_visualizacion', label: 'Visualización', detail: 'Consulta los documentos en modo lectura.', icon: Eye },
]

const ROLES_PORTAL = [
  { value: '', label: 'Sin acceso al portal' },
  { value: 'admin', label: 'Administrador' },
  { value: 'super_admin', label: 'Super administrador' },
]

const control = 'mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#c88c3a] focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100'

const nombreRolOperativo = (valor) => ROLES_OPERATIVOS.find((rol) => rol.value === valor)?.label || 'Sin rol operativo'

const fechaLegible = (valor) => {
  if (!valor) return 'Sin registro'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? 'Sin registro' : fecha.toLocaleDateString('es-CO', { dateStyle: 'medium' })
}

export default function AdminUsuariosRoles() {
  const [usuarios, setUsuarios] = useState([])
  const [consulta, setConsulta] = useState('')
  const [seleccionadoId, setSeleccionadoId] = useState('')
  const [edicion, setEdicion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const solicitud = useRef(0)

  const usuarioSeleccionado = useMemo(
    () => usuarios.find((usuario) => usuario.user_id === seleccionadoId) || null,
    [usuarios, seleccionadoId]
  )
  const datosFormulario = useMemo(() => {
    if (!usuarioSeleccionado) return null
    if (edicion?.user_id === usuarioSeleccionado.user_id) return edicion
    return {
      user_id: usuarioSeleccionado.user_id,
      accesoPortal: usuarioSeleccionado.portal_active ? usuarioSeleccionado.portal_role || 'admin' : '',
      rolOperativo: usuarioSeleccionado.workflow_role || '',
      nota: '',
    }
  }, [edicion, usuarioSeleccionado])

  const cargarUsuarios = useCallback(async (filtro = '') => {
    const numeroSolicitud = ++solicitud.current
    setCargando(true)
    setError('')
    setExito('')

    try {
      const { data, error: fallo } = await supabase.rpc('admin_list_user_access', {
        p_query: filtro,
        p_limit: 100,
      })
      if (fallo) throw fallo
      if (!Array.isArray(data)) throw new Error('La consulta de usuarios no devolvió una lista válida.')
      if (numeroSolicitud !== solicitud.current) return

      setUsuarios(data)
      setSeleccionadoId((actual) => data.some((usuario) => usuario.user_id === actual)
        ? actual
        : data[0]?.user_id || '')
    } catch (fallo) {
      if (numeroSolicitud !== solicitud.current) return
      const mensaje = fallo.message || 'No se pudieron consultar los usuarios.'
      if (mensaje.toLowerCase().includes('super administrador')) {
        setError('Solo un super administrador puede consultar y gestionar los accesos.')
      } else {
        setError(mensaje)
      }
      setUsuarios([])
      setSeleccionadoId('')
    } finally {
      if (numeroSolicitud === solicitud.current) setCargando(false)
    }
  }, [])

  useEffect(() => {
    const filtro = consulta.trim()
    if (filtro.length === 1) return undefined

    const timer = window.setTimeout(() => cargarUsuarios(filtro), filtro ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [consulta, cargarUsuarios])

  const guardarAcceso = async (event) => {
    event.preventDefault()
    if (!usuarioSeleccionado || !datosFormulario || guardando) return
    if (!datosFormulario.accesoPortal && datosFormulario.rolOperativo) {
      setError('Activa el acceso al portal para asignar un rol operativo.')
      return
    }
    if (usuarioSeleccionado.is_current_user && datosFormulario.accesoPortal !== 'super_admin') {
      setError('No puedes reducir ni quitar tu propio acceso de super administrador.')
      return
    }

    if (!datosFormulario.accesoPortal && (usuarioSeleccionado.portal_active || usuarioSeleccionado.workflow_role)) {
      const confirmar = await showConfirmAlert({
        title: '¿Revocar todos los accesos?',
        text: 'Se desactivará el acceso administrativo y se retirará el rol operativo.',
        confirmButtonText: 'Revocar accesos',
        cancelButtonText: 'Cancelar',
      })
      if (!confirmar) return
    }

    setGuardando(true)
    setError('')
    setExito('')
    try {
      const { data, error: fallo } = await supabase.rpc('admin_set_user_access', {
        p_target_user_id: usuarioSeleccionado.user_id,
        p_portal_role: datosFormulario.accesoPortal || null,
        p_workflow_role: datosFormulario.rolOperativo || null,
        p_note: datosFormulario.nota.trim() || null,
      })
      if (fallo) throw fallo
      if (!data?.ok) throw new Error(data?.message || 'No se confirmó la actualización de permisos.')

      setEdicion(null)
      await cargarUsuarios(consulta.trim())
      setExito(datosFormulario.accesoPortal
        ? `Accesos actualizados para ${usuarioSeleccionado.email || 'el usuario'}.`
        : `Accesos revocados para ${usuarioSeleccionado.email || 'el usuario'}.`)
      await showSuccessAlert({
        title: datosFormulario.accesoPortal ? 'Accesos actualizados' : 'Accesos revocados',
        text: datosFormulario.accesoPortal
          ? 'El acceso al portal y el rol operativo quedaron guardados.'
          : 'El usuario ya no conserva acceso administrativo ni rol operativo.',
      })
    } catch (fallo) {
      setError(fallo.message || 'No se pudieron actualizar los accesos.')
      await showErrorAlert({ title: 'Error al actualizar accesos', text: fallo.message || 'Intenta nuevamente.' })
    } finally {
      setGuardando(false)
    }
  }

  const usuariosActivos = usuarios.filter((usuario) => usuario.portal_active).length
  const superAdministradores = usuarios.filter((usuario) => usuario.portal_active && usuario.portal_role === 'super_admin').length
  const rolesAsignados = usuarios.filter((usuario) => usuario.workflow_role).length
  const esUsuarioActual = usuarioSeleccionado?.is_current_user === true

  return (
    <main className="space-y-6">
      <header className="relative overflow-hidden rounded-[28px] bg-[#10233f] p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border border-amber-200/10" />
        <div className="absolute -right-2 -top-10 h-40 w-40 rounded-full border border-amber-200/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-amber-200">
              <ShieldCheck size={14} /> Gobierno de accesos
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Usuarios y roles</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Administra por separado el acceso al portal y la función operativa de cada cuenta. Los cambios quedan registrados en auditoría.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-amber-100">
            <UserCog size={26} />
          </div>
        </div>
      </header>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</p>}
      {exito && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><Check size={17} />{exito}</p>}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de accesos">
        <Resumen icon={<UsersIcon />} label="Usuarios encontrados" value={usuarios.length} />
        <Resumen icon={<ShieldCheck size={18} />} label="Accesos activos" value={usuariosActivos} />
        <Resumen icon={<Activity size={18} />} label="Roles operativos" value={rolesAsignados} detail={`${superAdministradores} super administradores activos`} />
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Directorio de accesos</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Busca por correo o nombre. Para dar acceso, la cuenta debe haber iniciado sesión en el portal al menos una vez.</p>
              </div>
              <button type="button" onClick={() => cargarUsuarios(consulta.trim().length >= 2 ? consulta.trim() : '')} disabled={cargando || consulta.trim().length === 1} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50" aria-label="Actualizar directorio" title="Actualizar directorio">
                <Loader2 size={17} className={cargando ? 'animate-spin' : ''} />
              </button>
            </div>
            <label className="relative mt-4 block">
              <span className="sr-only">Buscar usuario por correo o nombre</span>
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={consulta} onChange={(event) => {
                const siguiente = event.target.value
                setConsulta(siguiente)
                if (siguiente.trim().length === 1) {
                  solicitud.current += 1
                  setUsuarios([])
                  setSeleccionadoId('')
                  setEdicion(null)
                  setCargando(false)
                }
              }} className={`${control} !mt-0 !pl-10`} placeholder="Correo o nombre, mínimo 2 caracteres" />
            </label>
          </div>

          <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
            {cargando && usuarios.length === 0 && <p className="p-6 text-sm text-slate-500">Consultando usuarios…</p>}
            {!cargando && usuarios.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Search size={24} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">{consulta.trim().length === 1 ? 'Escribe al menos dos caracteres' : 'No se encontraron usuarios'}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Las cuentas nuevas aparecen después de su primer ingreso al portal.</p>
              </div>
            )}
            {usuarios.map((usuario) => {
              const activo = usuario.user_id === seleccionadoId
              return (
                <button key={usuario.user_id} type="button" onClick={() => { setSeleccionadoId(usuario.user_id); setEdicion(null); setError(''); setExito('') }} aria-pressed={activo}
                  className={`w-full px-5 py-4 text-left transition sm:px-6 ${activo ? 'bg-amber-50/70' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activo ? 'bg-[#10233f] text-amber-200' : 'bg-slate-100 text-slate-500'}`}><UserPlus size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{usuario.nombre_completo || usuario.email || 'Usuario'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${usuario.portal_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {usuario.portal_active ? 'Acceso activo' : 'Sin acceso activo'}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{usuario.email || 'Cuenta sin correo'}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">{usuario.portal_active ? <ShieldCheck size={12} /> : <ShieldX size={12} />}{usuario.portal_active ? (usuario.portal_role === 'super_admin' ? 'Super administrador' : 'Administrador') : 'Portal inactivo'}</span>
                        <span className="text-slate-300">·</span>
                        <span>{nombreRolOperativo(usuario.workflow_role)}</span>
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="min-w-0 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {usuarioSeleccionado ? (
            <form onSubmit={guardarAcceso} className="space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#9a6b27]">Perfil seleccionado</p>
                <h2 className="mt-1 break-words text-lg font-bold text-slate-900">{usuarioSeleccionado.nombre_completo || 'Usuario'}</h2>
                <p className="mt-1 break-all text-sm text-slate-500">{usuarioSeleccionado.email}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={13} />Último ingreso: {fechaLegible(usuarioSeleccionado.last_sign_in_at)}</p>
              </div>

              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                Acceso general al portal
                <select className={control} value={datosFormulario.accesoPortal} onChange={(event) => {
                  const siguiente = event.target.value
                  setEdicion({
                    ...datosFormulario,
                    accesoPortal: siguiente,
                    rolOperativo: siguiente ? datosFormulario.rolOperativo : '',
                  })
                }} disabled={guardando || esUsuarioActual}>
                  {ROLES_PORTAL.map((rol) => <option key={rol.value || 'none'} value={rol.value}>{rol.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] font-normal normal-case leading-5 text-slate-500">Este acceso permite entrar a las secciones administrativas del portal. Super administrador puede gestionar usuarios y roles.</span>
              </label>

              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                Rol operativo
                <select className={control} value={datosFormulario.rolOperativo} onChange={(event) => setEdicion({ ...datosFormulario, rolOperativo: event.target.value })} disabled={guardando}>
                  <option value="">Sin rol operativo</option>
                  {ROLES_OPERATIVOS.map((rol) => <option key={rol.value} value={rol.value}>{rol.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] font-normal normal-case leading-5 text-slate-500">Define las tareas y documentos disponibles en Cargue de documentos.</span>
              </label>

              {datosFormulario.rolOperativo && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  {(() => {
                    const rol = ROLES_OPERATIVOS.find((item) => item.value === datosFormulario.rolOperativo)
                    if (!rol) return null
                    const Icono = rol.icon
                    return <div className="flex items-start gap-3"><span className="rounded-xl bg-white p-2 text-[#9a6b27]"><Icono size={17} /></span><span><span className="block text-sm font-bold text-slate-900">{rol.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-600">{rol.detail}</span></span></div>
                  })()}
                </div>
              )}

              {esUsuarioActual && <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900">Tu propio acceso de super administrador está protegido; puedes cambiar tu rol operativo, pero no reducir tu acceso general.</p>}

              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                Nota de auditoría (opcional)
                <textarea className={`${control} min-h-20 resize-y`} maxLength={500} value={datosFormulario.nota} onChange={(event) => setEdicion({ ...datosFormulario, nota: event.target.value })} placeholder="Motivo del cambio de acceso" disabled={guardando} />
              </label>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button type="submit" disabled={guardando || cargando || (esUsuarioActual && datosFormulario.accesoPortal !== 'super_admin')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#19365d] disabled:cursor-not-allowed disabled:opacity-50">
                  <Save size={16} />{guardando ? 'Guardando…' : 'Guardar accesos'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <span className="rounded-2xl bg-slate-100 p-4 text-slate-500"><UserCog size={24} /></span>
              <h2 className="mt-4 font-bold text-slate-800">Selecciona un usuario</h2>
              <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">Elige una cuenta del directorio para consultar o actualizar su acceso y rol operativo.</p>
            </div>
          )}
        </section>
      </div>

      <aside className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        <Landmark size={16} className="mt-0.5 shrink-0 text-slate-500" />
        <p>Los cambios actualizan los metadatos de autenticación y la lista de administradores en una sola operación, y quedan en la auditoría. El usuario debe cerrar sesión y volver a ingresar para refrescar sus permisos.</p>
      </aside>
    </main>
  )
}

function UsersIcon() {
  return <UserCog size={18} />
}

function Resumen({ icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs font-semibold">{label}</span></div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-slate-500">{detail}</p>}
    </div>
  )
}
