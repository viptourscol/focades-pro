import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  Filter,
  GraduationCap,
  Layers3,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const CHART_COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#b45309', '#14b8a6', '#64748b'];

const EMPTY_ANALYTICS = {
  metrics: {
    totalBeneficiarios: 0,
    activos: 0,
    suspendidos: 0,
    retirados: 0,
    totalDesembolsado: 0,
    pagoPromedio: 0,
  },
  charts: {
    activosPorModalidad: [],
    beneficiariosPorEstado: [],
    activosPorGenero: [],
    desembolsosPorConvocatoria: [],
    topUniversidades: [],
    tendenciaPagos: [],
    embudoConvocatoria: [],
    beneficiariosPorSemestre: [],
    actualizacionesPorEstado: [],
    coberturaPortal: [],
  },
  options: {
    modalidades: [],
    estadosBeneficiario: [],
    universidades: [],
    years: [],
  },
};

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(numberOrZero(value));

const formatInteger = (value) => new Intl.NumberFormat('es-CO').format(numberOrZero(value));

const sanitizeChartRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      label: String(row?.label || 'Sin dato'),
      value: numberOrZero(row?.value),
    }))
    .filter((row) => row.label);
};

const toSimpleArray = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((item) => String(item || '').trim()).filter(Boolean);
};

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

const chartToCsvRows = (title, rows) => {
  const sanitized = sanitizeChartRows(rows);
  return [[title, ''], ['Etiqueta', 'Valor'], ...sanitized.map((row) => [row.label, row.value])];
};

const ensureCurrentValue = (list, currentValue) => {
  if (currentValue === 'all') return list;
  if (list.includes(currentValue)) return list;
  return [currentValue, ...list];
};

const AdminAnalytics = () => {
  const currentYear = new Date().getFullYear();

  const [filters, setFilters] = useState({
    year: String(currentYear),
    convocatoriaId: 'all',
    modalidad: 'all',
    estadoBeneficiario: 'all',
    universidad: 'all',
  });

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [analyticsData, setAnalyticsData] = useState(EMPTY_ANALYTICS);
  const [convocatorias, setConvocatorias] = useState([]);

  useEffect(() => {
    loadConvocatorias();
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [filters.year, filters.convocatoriaId, filters.modalidad, filters.estadoBeneficiario, filters.universidad]);

  const loadConvocatorias = async () => {
    const { data, error } = await supabase
      .from('convocatorias')
      .select('id,nombre,anio')
      .order('anio', { ascending: false })
      .order('nombre', { ascending: true });

    if (!error) {
      setConvocatorias(Array.isArray(data) ? data : []);
    }
  };

  const loadSnapshot = async () => {
    setLoading(true);
    setErrorMessage('');

    const payload = {
      p_year: Number(filters.year),
      p_convocatoria_id: filters.convocatoriaId === 'all' ? null : filters.convocatoriaId,
      p_modalidad: filters.modalidad === 'all' ? null : filters.modalidad,
      p_estado_beneficiario: filters.estadoBeneficiario === 'all' ? null : filters.estadoBeneficiario,
      p_universidad: filters.universidad === 'all' ? null : filters.universidad,
    };

    const { data, error } = await supabase.rpc('admin_analytics_snapshot', payload);

    if (error) {
      setErrorMessage(error.message || 'No se pudo cargar el snapshot analitico.');
      setAnalyticsData(EMPTY_ANALYTICS);
      setLoading(false);
      return;
    }

    const safeMetrics = {
      totalBeneficiarios: numberOrZero(data?.metrics?.totalBeneficiarios),
      activos: numberOrZero(data?.metrics?.activos),
      suspendidos: numberOrZero(data?.metrics?.suspendidos),
      retirados: numberOrZero(data?.metrics?.retirados),
      totalDesembolsado: numberOrZero(data?.metrics?.totalDesembolsado),
      pagoPromedio: numberOrZero(data?.metrics?.pagoPromedio),
    };

    const safeCharts = {
      activosPorModalidad: sanitizeChartRows(data?.charts?.activosPorModalidad),
      beneficiariosPorEstado: sanitizeChartRows(data?.charts?.beneficiariosPorEstado),
      activosPorGenero: sanitizeChartRows(data?.charts?.activosPorGenero),
      desembolsosPorConvocatoria: sanitizeChartRows(data?.charts?.desembolsosPorConvocatoria),
      topUniversidades: sanitizeChartRows(data?.charts?.topUniversidades),
      tendenciaPagos: sanitizeChartRows(data?.charts?.tendenciaPagos),
      embudoConvocatoria: sanitizeChartRows(data?.charts?.embudoConvocatoria),
      beneficiariosPorSemestre: sanitizeChartRows(data?.charts?.beneficiariosPorSemestre),
      actualizacionesPorEstado: sanitizeChartRows(data?.charts?.actualizacionesPorEstado),
      coberturaPortal: sanitizeChartRows(data?.charts?.coberturaPortal),
    };

    const safeOptions = {
      modalidades: toSimpleArray(data?.options?.modalidades),
      estadosBeneficiario: toSimpleArray(data?.options?.estadosBeneficiario),
      universidades: toSimpleArray(data?.options?.universidades),
      years: (Array.isArray(data?.options?.years) ? data.options.years : [])
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a),
    };

    setAnalyticsData({
      metrics: safeMetrics,
      charts: safeCharts,
      options: safeOptions,
    });

    setLoading(false);
  };

  const yearOptions = useMemo(() => {
    const base = analyticsData.options.years.length > 0 ? analyticsData.options.years : [currentYear];
    const full = ensureCurrentValue(base.map((item) => String(item)), filters.year);
    return full.map((year) => ({ value: String(year), label: String(year) }));
  }, [analyticsData.options.years, currentYear, filters.year]);

  const modalidadOptions = useMemo(
    () => ensureCurrentValue(analyticsData.options.modalidades, filters.modalidad),
    [analyticsData.options.modalidades, filters.modalidad]
  );

  const estadoOptions = useMemo(
    () => ensureCurrentValue(analyticsData.options.estadosBeneficiario, filters.estadoBeneficiario),
    [analyticsData.options.estadosBeneficiario, filters.estadoBeneficiario]
  );

  const universidadOptions = useMemo(
    () => ensureCurrentValue(analyticsData.options.universidades, filters.universidad),
    [analyticsData.options.universidades, filters.universidad]
  );

  const exportSummary = () => {
    const rows = [
      ['Indicador', 'Valor'],
      ['Total beneficiarios', analyticsData.metrics.totalBeneficiarios],
      ['Activos', analyticsData.metrics.activos],
      ['Suspendidos', analyticsData.metrics.suspendidos],
      ['Retirados', analyticsData.metrics.retirados],
      ['Total desembolsado', analyticsData.metrics.totalDesembolsado],
      ['Pago promedio', analyticsData.metrics.pagoPromedio],
    ];
    downloadCsv(`analiticas-resumen-${filters.year}.csv`, rows);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section className="bg-white border border-slate-200 shadow-sm rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.25em] text-teal-700">
              <BarChart3 size={14} /> Analiticas FOCADES
            </span>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Centro de analitica administrativa</h1>
              <p className="mt-2 text-sm md:text-base text-slate-600 max-w-3xl">
                Snapshot agregado desde SQL/RPC con filtros por ano, convocatoria, modalidad, estado del beneficiario y universidad.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={exportSummary}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Download size={16} /> Exportar resumen CSV
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FilterCard
            label="Ano analitico"
            icon={<Filter size={14} className="text-slate-500" />}
            value={filters.year}
            onChange={(value) => setFilters((prev) => ({ ...prev, year: value }))}
            options={yearOptions}
          />

          <FilterCard
            label="Convocatoria"
            value={filters.convocatoriaId}
            onChange={(value) => setFilters((prev) => ({ ...prev, convocatoriaId: value }))}
            options={[
              { value: 'all', label: 'Todas las convocatorias' },
              ...convocatorias.map((item) => ({
                value: String(item.id),
                label: `${item.nombre} - ${item.anio || 'Sin ano'}`,
              })),
            ]}
          />

          <FilterCard
            label="Modalidad"
            value={filters.modalidad}
            onChange={(value) => setFilters((prev) => ({ ...prev, modalidad: value }))}
            options={[
              { value: 'all', label: 'Todas las modalidades' },
              ...modalidadOptions.map((item) => ({ value: item, label: item })),
            ]}
          />

          <FilterCard
            label="Estado beneficiario"
            value={filters.estadoBeneficiario}
            onChange={(value) => setFilters((prev) => ({ ...prev, estadoBeneficiario: value }))}
            options={[
              { value: 'all', label: 'Todos los estados' },
              ...estadoOptions.map((item) => ({ value: item, label: item })),
            ]}
          />

          <FilterCard
            label="Universidad"
            value={filters.universidad}
            onChange={(value) => setFilters((prev) => ({ ...prev, universidad: value }))}
            options={[
              { value: 'all', label: 'Todas las universidades' },
              ...universidadOptions.map((item) => ({ value: item, label: item })),
            ]}
          />
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Algunas fuentes no cargaron completamente. Detalle: {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <MetricCard title="Beneficiarios filtrados" value={analyticsData.metrics.totalBeneficiarios} icon={<Users className="text-sky-600" />} accent="bg-sky-50" loading={loading} formatter={formatInteger} />
        <MetricCard title="Activos" value={analyticsData.metrics.activos} icon={<UserCheck className="text-emerald-600" />} accent="bg-emerald-50" loading={loading} formatter={formatInteger} />
        <MetricCard title="Suspendidos" value={analyticsData.metrics.suspendidos} icon={<ShieldCheck className="text-amber-600" />} accent="bg-amber-50" loading={loading} formatter={formatInteger} />
        <MetricCard title="Retirados" value={analyticsData.metrics.retirados} icon={<Layers3 className="text-rose-600" />} accent="bg-rose-50" loading={loading} formatter={formatInteger} />
        <MetricCard title="Desembolsado del ano" value={analyticsData.metrics.totalDesembolsado} icon={<CircleDollarSign className="text-teal-600" />} accent="bg-teal-50" loading={loading} formatter={formatCurrency} />
        <MetricCard title="Pago promedio" value={analyticsData.metrics.pagoPromedio} icon={<TrendingUp className="text-teal-700" />} accent="bg-teal-50" loading={loading} formatter={formatCurrency} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="Beneficiarios activos por modalidad"
          subtitle="Base activa sin registros eliminados."
          onExport={() => downloadCsv(`activos-modalidad-${filters.year}.csv`, chartToCsvRows('Activos por modalidad', analyticsData.charts.activosPorModalidad))}
        >
          <SimpleBarChart data={analyticsData.charts.activosPorModalidad} loading={loading} color="#0f766e" formatter={formatInteger} />
        </Panel>

        <Panel
          title="Beneficiarios por estado general"
          subtitle="Distribucion consolidada del universo filtrado."
          onExport={() => downloadCsv(`beneficiarios-estado-${filters.year}.csv`, chartToCsvRows('Beneficiarios por estado', analyticsData.charts.beneficiariosPorEstado))}
        >
          <SimplePieChart data={analyticsData.charts.beneficiariosPorEstado} loading={loading} formatter={formatInteger} />
        </Panel>

        <Panel
          title="Beneficiarios activos por genero"
          subtitle="Solo poblacion con estado activo."
          onExport={() => downloadCsv(`activos-genero-${filters.year}.csv`, chartToCsvRows('Activos por genero', analyticsData.charts.activosPorGenero))}
        >
          <SimpleBarChart data={analyticsData.charts.activosPorGenero} loading={loading} color="#0ea5e9" formatter={formatInteger} />
        </Panel>

        <Panel
          title={`Desembolsos por convocatoria - ${filters.year}`}
          subtitle="Suma de pagos efectuados en el ano seleccionado."
          onExport={() => downloadCsv(`desembolsos-convocatoria-${filters.year}.csv`, chartToCsvRows('Desembolsos por convocatoria', analyticsData.charts.desembolsosPorConvocatoria))}
        >
          <SimpleBarChart data={analyticsData.charts.desembolsosPorConvocatoria} loading={loading} color="#f59e0b" formatter={formatCurrency} horizontal />
        </Panel>

        <Panel
          title="Top 5 universidades por monto desembolsado"
          subtitle="Ranking por pagos efectuados con filtros aplicados."
          onExport={() => downloadCsv(`top-universidades-${filters.year}.csv`, chartToCsvRows('Top universidades', analyticsData.charts.topUniversidades))}
        >
          <SimpleBarChart data={analyticsData.charts.topUniversidades} loading={loading} color="#0d9488" formatter={formatCurrency} horizontal />
        </Panel>

        <Panel
          title={`Tendencia de pagos - ${filters.year}`}
          subtitle="Serie mensual basada en fecha efectiva del pago."
          onExport={() => downloadCsv(`tendencia-pagos-${filters.year}.csv`, chartToCsvRows('Tendencia pagos mensual', analyticsData.charts.tendenciaPagos))}
        >
          <TrendChart data={analyticsData.charts.tendenciaPagos} loading={loading} formatter={formatCurrency} />
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Embudo por convocatoria"
          subtitle="Inscripcion, revision, admision y promocion."
          onExport={() => downloadCsv(`embudo-convocatoria-${filters.year}.csv`, chartToCsvRows('Embudo convocatoria', analyticsData.charts.embudoConvocatoria))}
        >
          <SimpleBarChart data={analyticsData.charts.embudoConvocatoria} loading={loading} color="#ef4444" formatter={formatInteger} />
        </Panel>

        <Panel
          title="Beneficiarios activos por semestre"
          subtitle="Distribucion actual de permanencia academica."
          onExport={() => downloadCsv(`activos-semestre-${filters.year}.csv`, chartToCsvRows('Activos por semestre', analyticsData.charts.beneficiariosPorSemestre))}
        >
          <SimpleBarChart data={analyticsData.charts.beneficiariosPorSemestre} loading={loading} color="#14b8a6" formatter={formatInteger} />
        </Panel>

        <Panel
          title="Cobertura de acceso al portal"
          subtitle="Vinculacion entre beneficiario y cuenta autenticada."
          onExport={() => downloadCsv(`cobertura-portal-${filters.year}.csv`, chartToCsvRows('Cobertura portal', analyticsData.charts.coberturaPortal))}
        >
          <SimplePieChart data={analyticsData.charts.coberturaPortal} loading={loading} formatter={formatInteger} />
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="Estado de actualizaciones periodicas"
          subtitle="Carga operativa de revision administrativa."
          onExport={() => downloadCsv(`actualizaciones-estado-${filters.year}.csv`, chartToCsvRows('Actualizaciones por estado', analyticsData.charts.actualizacionesPorEstado))}
        >
          <SimpleBarChart data={analyticsData.charts.actualizacionesPorEstado} loading={loading} color="#64748b" formatter={formatInteger} />
        </Panel>

        <Panel title="Lectura rapida" subtitle="Notas de interpretacion de la capa SQL agregada.">
          <div className="space-y-4 text-sm text-slate-600">
            <InsightRow icon={<CircleDollarSign size={16} className="text-teal-600" />} text="Los desembolsos y tendencias consideran unicamente pagos en estado efectuado." />
            <InsightRow icon={<GraduationCap size={16} className="text-teal-700" />} text="Modalidad, genero y universidad se normalizan desde la inscripcion vinculada al beneficiario." />
            <InsightRow icon={<BarChart3 size={16} className="text-sky-600" />} text="Los filtros globales se aplican en SQL para reducir transferencia y costo en el navegador." />
            <InsightRow icon={<ShieldCheck size={16} className="text-amber-600" />} text="El RPC valida rol admin y excluye registros eliminados por soft delete." />
          </div>
        </Panel>
      </section>
    </div>
  );
};

function FilterCard({ label, icon = null, value, onChange, options }) {
  return (
    <label className="block rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
      <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
        {icon}
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({ title, value, icon, accent, loading, formatter }) {
  return (
    <div className={`${accent} rounded-2xl p-4 flex items-center gap-3 shadow-sm`}>
      <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{title}</p>
        <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatter(value)}</p>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, onExport, children }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Download size={14} /> CSV
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      No hay datos suficientes para esta visualizacion.
    </div>
  );
}

function SimpleBarChart({ data, loading, color, formatter, horizontal = false }) {
  if (loading) return <EmptyChartState />;
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  if (horizontal) {
    return (
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis dataKey="label" type="category" width={120} tick={{ fill: '#334155', fontSize: 12 }} />
            <Tooltip formatter={(value) => formatter(value)} />
            <Bar dataKey="value" radius={[0, 12, 12, 0]} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" angle={data.length > 4 ? -15 : 0} textAnchor={data.length > 4 ? 'end' : 'middle'} height={data.length > 4 ? 52 : 30} tick={{ fill: '#334155', fontSize: 12 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip formatter={(value) => formatter(value)} />
          <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimplePieChart({ data, loading, formatter }) {
  if (loading) return <EmptyChartState />;
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={`${entry.label}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatter(value)} />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ data, loading, formatter }) {
  if (loading) return <EmptyChartState />;
  if (!Array.isArray(data) || data.length === 0) return <EmptyChartState />;

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="paymentsTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#334155', fontSize: 12 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
          <Tooltip formatter={(value) => formatter(value)} />
          <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#paymentsTrend)" strokeWidth={3} />
          <Line type="monotone" dataKey="value" stroke="#0369a1" strokeWidth={2} dot={{ r: 3, fill: '#0369a1' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightRow({ icon, text }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mt-0.5">{icon}</div>
      <p>{text}</p>
    </div>
  );
}

export default AdminAnalytics;
