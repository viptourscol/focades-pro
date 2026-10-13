import { AlertCircle, FileText, TrendingUp, CheckCircle } from 'lucide-react'

const DashboardPorRol = ({ userRole, estadisticas }) => {
  const roleConfig = {
    admin_educacion: {
      title: 'Panel Educación',
      descripcion: 'Crear y enviar documentos TERCEROS y RP',
      color: 'bg-purple-50 border-purple-200',
      accent: 'text-purple-700',
      acciones: [
        {
          id: 'crear-terceros',
          titulo: 'Crear TERCEROS',
          descripcion: 'Carga beneficiarios y terceros',
          icon: '👥',
          color: 'bg-purple-100'
        },
        {
          id: 'crear-rp',
          titulo: 'Crear RP',
          descripcion: 'Registros presupuestales',
          icon: '💰',
          color: 'bg-blue-100'
        }
      ],
      panelTexto: 'Como admin de Educación, eres responsable de crear y validar la información de terceros y registros presupuestales iniciales.'
    },
    admin_presupuesto: {
      title: 'Panel Presupuesto',
      descripcion: 'Revisar y aprobar documentos TERCEROS y RP',
      color: 'bg-blue-50 border-blue-200',
      accent: 'text-blue-700',
      acciones: [
        {
          id: 'revisar-terceros',
          titulo: 'Revisar TERCEROS',
          descripcion: 'Validar beneficiarios',
          icon: '✅',
          color: 'bg-purple-100'
        },
        {
          id: 'revisar-rp',
          titulo: 'Revisar RP',
          descripcion: 'Validar presupuesto',
          icon: '✅',
          color: 'bg-blue-100'
        }
      ],
      panelTexto: 'Tu rol es revisar y aprobar los documentos TERCEROS y RP creados por Educación.'
    },
    admin_contabilidad: {
      title: 'Panel Contabilidad',
      descripcion: 'Generar y validar OP y CONTABILIDAD',
      color: 'bg-green-50 border-green-200',
      accent: 'text-green-700',
      acciones: [
        {
          id: 'generar-op',
          titulo: 'Generar OP',
          descripcion: 'Órdenes de pago automáticas',
          icon: '📋',
          color: 'bg-orange-100'
        },
        {
          id: 'generar-contabilidad',
          titulo: 'Generar CONTABILIDAD',
          descripcion: 'Asientos contables',
          icon: '📊',
          color: 'bg-green-100'
        }
      ],
      panelTexto: 'Generas automáticamente las OP desde RP aprobados y los asientos contables correspondientes.'
    },
    admin_pagos: {
      title: 'Panel Pagos',
      descripcion: 'Importar y finalizar documentos SIAFE',
      color: 'bg-indigo-50 border-indigo-200',
      accent: 'text-indigo-700',
      acciones: [
        {
          id: 'importar-siafe',
          titulo: 'Importar SIAFE',
          descripcion: 'Datos bancarios del SIAFE',
          icon: '🏦',
          color: 'bg-indigo-100'
        },
        {
          id: 'finalizar',
          titulo: 'Finalizar Documentos',
          descripcion: 'Cerrar proceso de cargue',
          icon: '✅',
          color: 'bg-green-100'
        }
      ],
      panelTexto: 'Importas los datos de pago del SIAFE y finalizas el proceso de cargue de documentos.'
    },
    admin_visualizacion: {
      title: 'Panel Visualización',
      descripcion: 'Ver reportes y dashboards (Lectura)',
      color: 'bg-gray-50 border-gray-200',
      accent: 'text-gray-700',
      acciones: [
        {
          id: 'reportes',
          titulo: 'Ver Reportes',
          descripcion: 'Análisis completo del cargue',
          icon: '📈',
          color: 'bg-gray-100'
        },
        {
          id: 'historial',
          titulo: 'Ver Historial',
          descripcion: 'Auditoría de cambios',
          icon: '📜',
          color: 'bg-gray-100'
        }
      ],
      panelTexto: 'Acceso de solo lectura a todos los reportes y datos del sistema para análisis y auditoría.'
    }
  }

  const config = roleConfig[userRole] || roleConfig.admin_visualizacion

  return (
    <div className="w-full space-y-6">
      {/* Banner informativo del rol */}
      <div className={`p-4 md:p-6 rounded-lg border ${config.color}`}>
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <AlertCircle size={32} className={`${config.accent}`} />
          </div>
          <div>
            <h2 className={`text-lg md:text-xl font-bold ${config.accent}`}>{config.title}</h2>
            <p className={`text-sm ${config.accent} opacity-75 mt-1`}>{config.descripcion}</p>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">{config.panelTexto}</p>
          </div>
        </div>
      </div>

      {/* Tarjetas de acciones rápidas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.acciones.map((accion) => (
            <div key={accion.id} className={`p-4 rounded-lg border border-gray-200 hover:shadow-md transition cursor-pointer ${accion.color}`}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{accion.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{accion.titulo}</p>
                  <p className="text-xs text-gray-600 mt-1">{accion.descripcion}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Información sobre el flujo */}
      <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <TrendingUp size={18} />
          Flujo de Proceso
        </h3>
        <div className="space-y-3">
          {userRole === 'admin_educacion' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                  1
                </span>
              </div>
              <span>Tu rol: Crear TERCEROS y RP en estado "Borrador"</span>
            </div>
          )}

          {userRole === 'admin_presupuesto' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="flex-shrink-0">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                  2
                </span>
              </div>
              <span>Tu rol: Revisar y aprobar TERCEROS y RP</span>
            </div>
          )}

          {userRole === 'admin_contabilidad' && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                    3
                  </span>
                </div>
                <span>Tu rol: Generar OP automáticamente desde RP aprobados</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                    4
                  </span>
                </div>
                <span>Tu rol: Generar CONTABILIDAD automáticamente desde OP aprobados</span>
              </div>
            </>
          )}

          {userRole === 'admin_pagos' && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                    5
                  </span>
                </div>
                <span>Tu rol: Importar datos SIAFE desde banco</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                    6
                  </span>
                </div>
                <span>Tu rol: Finalizar documentos cuando se complete el cargue</span>
              </div>
            </>
          )}

          {userRole === 'admin_visualizacion' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="flex-shrink-0">
                <CheckCircle size={16} className="text-gray-700" />
              </div>
              <span>Acceso de solo lectura a todos los reportes y datos del sistema</span>
            </div>
          )}
        </div>
      </div>

      {/* Estadísticas del usuario */}
      {estadisticas && (
        <div className="bg-white p-4 md:p-6 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Mis Estadísticas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {estadisticas.total_documentos !== undefined && (
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{estadisticas.total_documentos}</p>
                <p className="text-xs text-gray-600 mt-1">Documentos Totales</p>
              </div>
            )}
            {estadisticas.documentos_borrador !== undefined && (
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-500">{estadisticas.documentos_borrador}</p>
                <p className="text-xs text-gray-600 mt-1">En Borrador</p>
              </div>
            )}
            {estadisticas.documentos_revision !== undefined && (
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{estadisticas.documentos_revision}</p>
                <p className="text-xs text-gray-600 mt-1">En Revisión</p>
              </div>
            )}
            {estadisticas.documentos_aprobados !== undefined && (
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{estadisticas.documentos_aprobados}</p>
                <p className="text-xs text-gray-600 mt-1">Aprobados</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Información de ayuda */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <p className="text-xs text-blue-800 leading-relaxed">
          <span className="font-semibold">💡 Consejo:</span> Los documentos pasan por varios estados: Borrador → En Revisión → Aprobado → Finalizado. Solo ciertos
          roles pueden realizar acciones en cada estado. Siempre valida los datos antes de enviar.
        </p>
      </div>
    </div>
  )
}

export default DashboardPorRol
