import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calculator,
  CircleDollarSign,
  Download,
  GraduationCap,
  ShieldCheck,
  Users,
} from 'lucide-react';

const LEVEL_ORDER = ['tecnico', 'tecnologo', 'profesional'];
const LEVEL_LABELS = {
  tecnico: 'Tecnico profesional',
  tecnologo: 'Tecnologo',
  profesional: 'Profesional',
};
const MODALITY_LABELS = {
  sueno: 'Sueno Educativo',
  merito: 'Merito Educativo',
};
const MODALITY_MULTIPLIERS = {
  sueno: 1,
  merito: 3.5,
};

const DEFAULT_PROJECTION = {
  smlv: 1423500,
  yearsToProject: 5,
  convocatoriasPerYear: 1,
  suenoPerConvocatoria: 75,
  meritoPerConvocatoria: 19,
  desertionRate: 0.12,
  graduationRate: 0.08,
  paymentsPerYear: 2,
  maxPagosTecnico: 4,
  maxPagosTecnologo: 6,
  maxPagosProfesional: 10,
  shareTecnico: 30,
  shareTecnologo: 30,
  shareProfesional: 40,
};

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const roundTo = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(numberOrZero(value) * factor) / factor;
};

const normalizeRateInput = (value) => clamp(numberOrZero(value), 0, 100) / 100;

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(numberOrZero(value));

const formatInteger = (value) => new Intl.NumberFormat('es-CO').format(numberOrZero(value));

const buildCsv = (rows) => rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

const downloadCsv = (filename, rows) => {
  const csvContent = buildCsv(rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const distributeCohort = (total, shares) => {
  const precise = LEVEL_ORDER.map((level) => ({
    level,
    raw: total * (shares[level] / 100),
  }));

  const base = precise.map((item) => ({
    level: item.level,
    value: Math.floor(item.raw),
    remainder: item.raw - Math.floor(item.raw),
  }));

  const assigned = base.reduce((acc, item) => acc + item.value, 0);
  const missing = total - assigned;

  base
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, Math.max(0, missing))
    .forEach((item) => {
      item.value += 1;
    });

  return base.reduce((acc, item) => {
    acc[item.level] = item.value;
    return acc;
  }, {});
};

const AdminProjection = () => {
  const [projectionConfig, setProjectionConfig] = useState(DEFAULT_PROJECTION);

  const projection = useMemo(() => {
    const sharesRaw = {
      tecnico: clamp(numberOrZero(projectionConfig.shareTecnico), 0, 100),
      tecnologo: clamp(numberOrZero(projectionConfig.shareTecnologo), 0, 100),
      profesional: clamp(numberOrZero(projectionConfig.shareProfesional), 0, 100),
    };

    const totalShare = LEVEL_ORDER.reduce((acc, level) => acc + sharesRaw[level], 0) || 100;
    const shares = LEVEL_ORDER.reduce((acc, level) => {
      acc[level] = (sharesRaw[level] / totalShare) * 100;
      return acc;
    }, {});

    const maxPagos = {
      tecnico: Math.max(1, Math.round(numberOrZero(projectionConfig.maxPagosTecnico))),
      tecnologo: Math.max(1, Math.round(numberOrZero(projectionConfig.maxPagosTecnologo))),
      profesional: Math.max(1, Math.round(numberOrZero(projectionConfig.maxPagosProfesional))),
    };

    const paymentsPerYear = Math.max(1, Math.round(numberOrZero(projectionConfig.paymentsPerYear)));
    const yearsToProject = Math.max(1, Math.round(numberOrZero(projectionConfig.yearsToProject)));
    const convocatoriasPerYear = Math.max(1, Math.round(numberOrZero(projectionConfig.convocatoriasPerYear)));
    const smlv = Math.max(0, numberOrZero(projectionConfig.smlv));
    const desertionRate = clamp(numberOrZero(projectionConfig.desertionRate), 0, 1);
    const graduationRate = clamp(numberOrZero(projectionConfig.graduationRate), 0, 1);

    const annualRows = [];
    const detailRows = [];
    const cohorts = [];

    for (let yearIndex = 1; yearIndex <= yearsToProject; yearIndex += 1) {
      const suenoEntrants = convocatoriasPerYear * Math.max(0, Math.round(numberOrZero(projectionConfig.suenoPerConvocatoria)));
      const meritoEntrants = convocatoriasPerYear * Math.max(0, Math.round(numberOrZero(projectionConfig.meritoPerConvocatoria)));
      const distributedSueno = distributeCohort(suenoEntrants, shares);
      const distributedMerito = distributeCohort(meritoEntrants, shares);

      LEVEL_ORDER.forEach((level) => {
        const registerCohort = (modality, entrants) => {
          if (!entrants) return;
          cohorts.push({
            cohortYear: yearIndex,
            level,
            modality,
            active: entrants,
            paymentsUsed: 0,
          });
        };

        registerCohort('sueno', distributedSueno[level] || 0);
        registerCohort('merito', distributedMerito[level] || 0);
      });

      let yearCost = 0;
      let yearPayments = 0;
      let yearDesertions = 0;
      let yearGraduations = 0;
      let yearActiveStart = 0;
      let yearActiveEnd = 0;
      let yearSuenoCost = 0;
      let yearMeritoCost = 0;

      cohorts.forEach((cohort) => {
        if (cohort.active <= 0) return;
        if (cohort.paymentsUsed >= maxPagos[cohort.level]) return;

        const activeStart = cohort.active;
        yearActiveStart += activeStart;

        const availablePayments = Math.min(paymentsPerYear, maxPagos[cohort.level] - cohort.paymentsUsed);
        const annualPayments = activeStart * availablePayments;
        const annualCost = annualPayments * MODALITY_MULTIPLIERS[cohort.modality] * smlv;

        cohort.paymentsUsed += availablePayments;
        yearPayments += annualPayments;
        yearCost += annualCost;

        if (cohort.modality === 'sueno') yearSuenoCost += annualCost;
        if (cohort.modality === 'merito') yearMeritoCost += annualCost;

        const potentialDesertions = activeStart * desertionRate;
        const potentialGraduations = activeStart * graduationRate;
        const exits = potentialDesertions + potentialGraduations;
        const scale = exits > activeStart && activeStart > 0 ? activeStart / exits : 1;

        let desertions = roundTo(potentialDesertions * scale, 2);
        let graduations = roundTo(potentialGraduations * scale, 2);
        let activeEnd = roundTo(activeStart - desertions - graduations, 2);

        if (cohort.paymentsUsed >= maxPagos[cohort.level]) {
          graduations = roundTo(graduations + activeEnd, 2);
          activeEnd = 0;
        }

        cohort.active = activeEnd;

        yearDesertions += desertions;
        yearGraduations += graduations;
        yearActiveEnd += activeEnd;

        detailRows.push({
          year: yearIndex,
          cohort: `Cohorte ${cohort.cohortYear}`,
          modality: MODALITY_LABELS[cohort.modality],
          level: LEVEL_LABELS[cohort.level],
          activeStart,
          annualPayments,
          annualCost,
          desertions,
          graduations,
          activeEnd,
          paymentsUsed: cohort.paymentsUsed,
          maxPayments: maxPagos[cohort.level],
        });
      });

      annualRows.push({
        year: `Año ${yearIndex}`,
        yearIndex,
        activeStart: roundTo(yearActiveStart, 2),
        activeEnd: roundTo(yearActiveEnd, 2),
        payments: roundTo(yearPayments, 2),
        cost: roundTo(yearCost, 2),
        desertions: roundTo(yearDesertions, 2),
        graduations: roundTo(yearGraduations, 2),
        suenoCost: roundTo(yearSuenoCost, 2),
        meritoCost: roundTo(yearMeritoCost, 2),
      });
    }

    const annualCostChart = annualRows.map((row) => ({ label: row.year, value: row.cost }));
    const activeProjectionChart = annualRows.map((row) => ({ label: row.year, value: row.activeEnd }));
    const modalityCostChart = annualRows.map((row) => ({ label: row.year, sueno: row.suenoCost, merito: row.meritoCost }));
    const cumulativeCost = annualRows.reduce((acc, row) => acc + row.cost, 0);

    return {
      shares,
      maxPagos,
      annualRows,
      detailRows,
      annualCostChart,
      activeProjectionChart,
      modalityCostChart,
      summary: {
        cumulativeCost: roundTo(cumulativeCost, 2),
        averageAnnualCost: roundTo(annualRows.length > 0 ? cumulativeCost / annualRows.length : 0, 2),
        totalDesertions: roundTo(annualRows.reduce((acc, row) => acc + row.desertions, 0), 2),
        totalGraduations: roundTo(annualRows.reduce((acc, row) => acc + row.graduations, 0), 2),
        totalNewBeneficiaries:
          annualRows.length *
          convocatoriasPerYear *
          (Math.max(0, Math.round(numberOrZero(projectionConfig.suenoPerConvocatoria))) +
            Math.max(0, Math.round(numberOrZero(projectionConfig.meritoPerConvocatoria)))),
      },
    };
  }, [projectionConfig]);

  const exportProjection = () => {
    const rows = [
      ['Año', 'Activos inicio', 'Activos cierre', 'Pagos', 'Deserciones', 'Graduaciones', 'Costo Sueño', 'Costo Mérito', 'Costo total'],
      ...projection.annualRows.map((row) => [
        row.year,
        row.activeStart,
        row.activeEnd,
        row.payments,
        row.desertions,
        row.graduations,
        row.suenoCost,
        row.meritoCost,
        row.cost,
      ]),
    ];
    downloadCsv('proyeccion-costos-resumen.csv', rows);
  };

  const exportProjectionDetail = () => {
    const rows = [
      ['Año', 'Cohorte', 'Modalidad', 'Nivel', 'Activos inicio', 'Pagos anuales', 'Costo anual', 'Deserciones', 'Graduaciones', 'Activos cierre', 'Pagos usados', 'Max pagos'],
      ...projection.detailRows.map((row) => [
        row.year,
        row.cohort,
        row.modality,
        row.level,
        row.activeStart,
        row.annualPayments,
        row.annualCost,
        row.desertions,
        row.graduations,
        row.activeEnd,
        row.paymentsUsed,
        row.maxPayments,
      ]),
    ];
    downloadCsv('proyeccion-costos-detalle.csv', rows);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section className="bg-white border border-slate-200 shadow-sm rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.25em] text-emerald-700">
              <Calculator size={14} /> Proyeccion FOCADES
            </span>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Herramienta de proyeccion de costos</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-3xl">
                Planea el costo de pagos futuros con un modelo por cohortes. Ajusta entradas, tasas y topes por nivel para evaluar escenarios.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportProjection}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Download size={16} /> Exportar resumen
            </button>
            <button
              type="button"
              onClick={exportProjectionDetail}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Download size={16} /> Exportar detalle
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6 min-w-0">
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Calculator className="text-primary" size={20} />
            </div>
            <h2 className="text-base font-bold text-slate-900">Parámetros de Simulación</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <ProjectionInput label="SMLV vigente" value={projectionConfig.smlv} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, smlv: numberOrZero(value) }))} />
            <ProjectionInput label="Años a proyectar" value={projectionConfig.yearsToProject} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, yearsToProject: Math.max(1, Math.round(numberOrZero(value))) }))} />
            <ProjectionInput label="Convocatorias por año" value={projectionConfig.convocatoriasPerYear} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, convocatoriasPerYear: Math.max(1, Math.round(numberOrZero(value))) }))} />
            <ProjectionInput label="Sueño por convocatoria" value={projectionConfig.suenoPerConvocatoria} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, suenoPerConvocatoria: Math.max(0, Math.round(numberOrZero(value))) }))} />
            <ProjectionInput label="Mérito por convocatoria" value={projectionConfig.meritoPerConvocatoria} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, meritoPerConvocatoria: Math.max(0, Math.round(numberOrZero(value))) }))} />
            <ProjectionInput label="Pagos por año" value={projectionConfig.paymentsPerYear} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, paymentsPerYear: Math.max(1, Math.round(numberOrZero(value))) }))} />
            <ProjectionInput label="Deserción anual (%)" value={roundTo(projectionConfig.desertionRate * 100, 2)} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, desertionRate: normalizeRateInput(value) }))} />
            <ProjectionInput label="Graduación anual (%)" value={roundTo(projectionConfig.graduationRate * 100, 2)} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, graduationRate: normalizeRateInput(value) }))} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4">Topes Máximos de Pagos por Nivel</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ProjectionInput label="Técnico" value={projectionConfig.maxPagosTecnico} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, maxPagosTecnico: Math.max(1, Math.round(numberOrZero(value))) }))} />
                <ProjectionInput label="Tecnólogo" value={projectionConfig.maxPagosTecnologo} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, maxPagosTecnologo: Math.max(1, Math.round(numberOrZero(value))) }))} />
                <ProjectionInput label="Profesional" value={projectionConfig.maxPagosProfesional} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, maxPagosProfesional: Math.max(1, Math.round(numberOrZero(value))) }))} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4">Distribución de Cohortes por Nivel</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ProjectionInput label="Técnico (%)" value={projectionConfig.shareTecnico} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, shareTecnico: clamp(numberOrZero(value), 0, 100) }))} />
                <ProjectionInput label="Tecnólogo (%)" value={projectionConfig.shareTecnologo} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, shareTecnologo: clamp(numberOrZero(value), 0, 100) }))} />
                <ProjectionInput label="Profesional (%)" value={projectionConfig.shareProfesional} onChange={(value) => setProjectionConfig((prev) => ({ ...prev, shareProfesional: clamp(numberOrZero(value), 0, 100) }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <SummaryCard label="Costo acumulado" value={formatCurrency(projection.summary.cumulativeCost)} icon={<CircleDollarSign size={16} className="text-teal-600" />} tone="bg-teal-50" />
          <SummaryCard label="Costo promedio anual" value={formatCurrency(projection.summary.averageAnnualCost)} icon={<Calculator size={16} className="text-slate-700" />} tone="bg-slate-100" />
          <SummaryCard label="Beneficiarios nuevos" value={formatInteger(projection.summary.totalNewBeneficiaries)} icon={<Users size={16} className="text-sky-600" />} tone="bg-sky-50" />
          <SummaryCard label="Deserciones proyectadas" value={formatInteger(projection.summary.totalDesertions)} icon={<ShieldCheck size={16} className="text-amber-600" />} tone="bg-amber-50" />
          <SummaryCard label="Graduaciones proyectadas" value={formatInteger(projection.summary.totalGraduations)} icon={<GraduationCap size={16} className="text-teal-700" />} tone="bg-teal-50" />

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Reglas activas</p>
            <p>Sueno Educativo paga 1 SMLV por desembolso y Merito Educativo paga 3.5 SMLV.</p>
            <p>
              Topes activos: Tecnico {projection.maxPagos.tecnico}, Tecnologo {projection.maxPagos.tecnologo}, Profesional {projection.maxPagos.profesional}.
            </p>
            <p>
              Distribucion normalizada: Tecnico {roundTo(projection.shares.tecnico, 1)}%, Tecnologo {roundTo(projection.shares.tecnologo, 1)}%, Profesional {roundTo(projection.shares.profesional, 1)}%.
            </p>
            <button
              type="button"
              onClick={() => setProjectionConfig(DEFAULT_PROJECTION)}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Restablecer parametros
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-w-0">
        <ChartPanel title="Costo anual proyectado" subtitle="Costo total por año con cohortes activas.">
          <SimpleBarChart data={projection.annualCostChart} color="#0f766e" formatter={formatCurrency} />
        </ChartPanel>

        <ChartPanel title="Activos proyectados al cierre" subtitle="Beneficiarios activos despues de salidas anuales.">
          <TrendChart data={projection.activeProjectionChart} formatter={formatInteger} />
        </ChartPanel>
      </section>

      <section className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Costo anual por modalidad</h2>
            <p className="mt-1 text-sm text-slate-500">Composicion anual entre Sueno Educativo y Merito Educativo.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadCsv('proyeccion-modalidades.csv', [
                ['Año', 'Costo Sueño', 'Costo Mérito'],
                ...projection.modalityCostChart.map((row) => [row.label, row.sueno, row.merito]),
              ])
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Download size={14} /> CSV modalidades
          </button>
        </div>
        <StackedProjectionChart data={projection.modalityCostChart} formatter={formatCurrency} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Detalle anual</h2>
        <p className="mt-1 text-sm text-slate-500">Resumen de flujo anual de beneficiarios y costo proyectado.</p>
        <div className="mt-4 overflow-x-auto rounded-[1.3rem] border border-slate-200">
          <table className="min-w-[650px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-[0.18em] text-[11px] font-black">
              <tr>
                <th className="px-4 py-3 text-left">Año</th>
                <th className="px-4 py-3 text-right">Activos inicio</th>
                <th className="px-4 py-3 text-right">Pagos</th>
                <th className="px-4 py-3 text-right">Deserciones</th>
                <th className="px-4 py-3 text-right">Graduaciones</th>
                <th className="px-4 py-3 text-right">Activos cierre</th>
                <th className="px-4 py-3 text-right">Costo total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {projection.annualRows.map((row) => (
                <tr key={row.year}>
                  <td className="px-4 py-3 font-bold text-slate-900">{row.year}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatInteger(row.activeStart)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatInteger(row.payments)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatInteger(row.desertions)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatInteger(row.graduations)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatInteger(row.activeEnd)}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

function ProjectionInput({ label, value, onChange }) {
  return (
    <label className="group block cursor-pointer">
      <div className="relative rounded-xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50/30 px-4 py-3.5 transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-within:border-primary focus-within:shadow-lg focus-within:ring-4 focus-within:ring-primary/10">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 transition-colors group-focus-within:text-primary">
          {label}
        </span>
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-lg font-bold text-slate-900 outline-none placeholder:text-slate-300 transition-colors"
          placeholder="0"
        />
      </div>
    </label>
  );
}

function SummaryCard({ label, value, icon, tone = 'bg-slate-100' }) {
  return (
    <div className={`${tone} rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
      <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-black text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4 min-w-0">{children}</div>
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      No hay datos suficientes para esta visualizacion.
    </div>
  );
}

function SimpleBarChart({ data, color, formatter }) {
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 12 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip formatter={(value) => formatter(value)} />
          <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ data, formatter }) {
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  return (
    <div className="h-[280px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="projectionTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 12 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip formatter={(value) => formatter(value)} />
          <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#projectionTrend)" strokeWidth={3} />
          <Line type="monotone" dataKey="value" stroke="#0369a1" strokeWidth={2} dot={{ r: 3, fill: '#0369a1' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackedProjectionChart({ data, formatter }) {
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  return (
    <div className="h-[300px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 12 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip formatter={(value) => formatter(value)} />
          <Legend />
          <Bar dataKey="sueno" stackId="cost" name="Sueno" fill="#0f766e" radius={[8, 8, 0, 0]} />
          <Bar dataKey="merito" stackId="cost" name="Merito" fill="#0d9488" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AdminProjection;
