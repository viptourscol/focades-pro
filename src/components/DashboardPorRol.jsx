import { createElement } from 'react'
import { BookOpen, Check, CircleDollarSign, Eye, Landmark, ShieldCheck } from 'lucide-react'

const ROLES = {
  admin_educacion: { nombre: 'Educación', icono: BookOpen, paso: 0, tarea: 'Prepara la información de terceros y los registros presupuestales.', detalle: 'Crea el documento, precarga los aspirantes y verifica sus datos antes de enviarlo a revisión.' },
  admin_presupuesto: { nombre: 'Presupuesto', icono: ShieldCheck, paso: 1, tarea: 'Revisa, corrige y aprueba TERCEROS y RP.', detalle: 'Abre un documento en revisión. Las correcciones de celdas requieren un motivo y quedan en el historial.' },
  admin_contabilidad: { nombre: 'Contabilidad', icono: CircleDollarSign, paso: 2, tarea: 'Gestiona las órdenes de pago y los asientos contables.', detalle: 'Continúa el proceso a partir de los registros presupuestales aprobados.' },
  admin_pagos: { nombre: 'Pagos', icono: Landmark, paso: 3, tarea: 'Registra los pagos y completa el proceso de cargue.', detalle: 'Importa la información SIAFE y verifica los documentos antes de finalizar.' },
  admin_visualizacion: { nombre: 'Consulta', icono: Eye, paso: -1, tarea: 'Consulta el avance y la información de los documentos.', detalle: 'Tu acceso es de solo lectura. Los cambios corresponden al equipo responsable de cada etapa.' }
}

const DashboardPorRol = ({ userRole }) => {
  const rol = ROLES[userRole] || ROLES.admin_visualizacion
  const pasos = ['Educación', 'Presupuesto', 'Contabilidad', 'Pagos']
  return (
    <aside aria-label="Guía de tu rol" className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          {createElement(rol.icono, { size: 22, 'aria-hidden': true })}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">Tu espacio · {rol.nombre}</p>
          <h2 className="mt-1 text-base font-bold leading-6 text-slate-900">{rol.tarea}</h2>
          <p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-500">{rol.detalle}</p>
        </div>
      </div>
      <nav aria-label="Etapas del proceso documental">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Ruta del documento</p>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pasos.map((paso, i) => (
            <li key={paso} aria-current={i === rol.paso ? 'step' : undefined} className={`border-t-2 pt-3 ${i === rol.paso ? 'border-emerald-700 text-emerald-900' : 'border-slate-200 text-slate-500'}`}>
              <span className={`mb-2 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === rol.paso ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
              <span className="block text-xs font-semibold">{paso}</span>
              {i === rol.paso && <span className="mt-1 inline-flex items-center gap-1 text-[10px]"><Check size={11} aria-hidden="true" />Tu etapa</span>}
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  )
}

export default DashboardPorRol
