/**
 * ImportStepper — Barra visual de 4 pasos del flujo de importación histórica.
 * Props:
 *   currentStep: 1 | 2 | 3 | 4
 *   loteId: string | undefined  — UUID del lote para generar links
 */
export default function ImportStepper({ currentStep = 1, loteId }) {
  const qs = loteId ? `?lote=${loteId}` : ''

  const steps = [
    { n: 1, label: 'Importar beneficiarios', href: `/admin/historicos/importar${qs}` },
    { n: 2, label: 'Subir documentos', href: `/admin/historicos/documentos${qs}` },
    { n: 3, label: 'Importar pagos', href: `/admin/historicos/pagos${qs}` },
    { n: 4, label: 'Activar', href: `/admin/historicos/activacion${qs}` }
  ]

  return (
    <nav aria-label="Pasos de importación" className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
      <ol className="flex items-center gap-0 overflow-x-auto">
        {steps.map((step, idx) => {
          const isDone = currentStep > step.n
          const isCurrent = currentStep === step.n
          const isLast = idx === steps.length - 1

          return (
            <li key={step.n} className="flex items-center flex-shrink-0">
              <a
                href={step.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : isDone
                    ? 'text-blue-700 hover:bg-blue-50'
                    : 'text-gray-400 pointer-events-none'
                }`}
              >
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  isCurrent
                    ? 'bg-white text-blue-600'
                    : isDone
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? '✓' : step.n}
                </span>
                <span className="whitespace-nowrap hidden sm:inline">{step.label}</span>
              </a>
              {!isLast && (
                <span className="mx-1 text-gray-300 text-sm select-none">›</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
