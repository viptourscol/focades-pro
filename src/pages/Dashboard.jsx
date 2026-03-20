import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Users, UserCheck, UserX, Clock, BarChart3, Calculator,
  DollarSign, FileText, Activity, ChevronRight, RefreshCw,
  Bell, Calendar, Shield, CheckCircle2, TrendingUp, UploadCloud, UserPlus,
  HandCoins,
} from 'lucide-react';
import { invokeAdminTickets } from '../lib/adminTickets';

const formatCOP = (val) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val || 0);

// Mapas de clases estáticas para que Tailwind JIT no las purgue
const KPI_STYLES = {
  sky:     { bg: 'bg-sky-50',     border: 'border-sky-100',     icon: 'text-sky-500',     chevron: 'text-sky-300 group-hover:text-sky-500'     },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'text-emerald-500', chevron: 'text-emerald-300 group-hover:text-emerald-500' },
  teal:    { bg: 'bg-teal-50',  border: 'border-teal-100',  icon: 'text-teal-600',  chevron: 'text-teal-300 group-hover:text-teal-600'  },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-100',    icon: 'text-rose-500',    chevron: 'text-rose-300 group-hover:text-rose-500'    },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   icon: 'text-amber-500',   chevron: 'text-amber-300 group-hover:text-amber-500'   },
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-100',   icon: 'text-slate-500',   chevron: 'text-slate-300 group-hover:text-slate-500'   },
};

const HEALTH_STYLES = {
  sky:    { bar: 'bg-sky-500',    text: 'text-sky-600'    },
  emerald:{ bar: 'bg-emerald-500',text: 'text-emerald-600'},
  teal:   { bar: 'bg-teal-600', text: 'text-teal-700' },
  amber:  { bar: 'bg-amber-400',  text: 'text-amber-600'  },
};

const HEALTH_SCORE_STYLES = {
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: 'text-emerald-600', text: 'text-emerald-700' },
  amber:   { border: 'border-amber-200',   bg: 'bg-amber-50',   icon: 'text-amber-600',   text: 'text-amber-700'   },
  rose:    { border: 'border-rose-200',    bg: 'bg-rose-50',    icon: 'text-rose-600',    text: 'text-rose-700'    },
};

const QUICK_LINKS = [
  { to: '/admin/aspirantes',     label: 'Aspirantes',     icon: <Users size={14} />,        color: 'sky'     },
  { to: '/admin/beneficiarios',  label: 'Beneficiarios',  icon: <Shield size={14} />,       color: 'teal'    },
  { to: '/admin/actualizaciones',label: 'Actualizaciones',icon: <FileText size={14} />,     color: 'amber'   },
  { to: '/admin/importar',       label: 'Importar Históricos', icon: <UploadCloud size={14} />, color: 'sky' },
  { to: '/admin/importar-pagos', label: 'Importar Pagos', icon: <HandCoins size={14} />, color: 'emerald' },
  { to: '/admin/activacion',     label: 'Activar Históricos',  icon: <UserPlus size={14} />,    color: 'emerald' },
  { to: '/admin/resoluciones',   label: 'Resoluciones',   icon: <CheckCircle2 size={14} />, color: 'emerald' },
  { to: '/admin/condonaciones',  label: 'Condonaciones',  icon: <DollarSign size={14} />,   color: 'emerald' },
  { to: '/admin/tickets',        label: 'Tickets',         icon: <Bell size={14} />,         color: 'rose'    },
  { to: '/admin/analiticas',     label: 'Analíticas',     icon: <BarChart3 size={14} />,    color: 'sky'     },
  { to: '/admin/configuracion',  label: 'Configuración',  icon: <Activity size={14} />,     color: 'slate'   },
];

function useCountUp(target, { duration = 900, decimals = 0, enabled = true } = {}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(Number(target || 0));
      return undefined;
    }

    const end = Number(target || 0);
    const startAt = performance.now();
    let rafId = 0;

    const tick = (now) => {
      const elapsed = now - startAt;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic para un arranque rápido y cierre suave.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = end * eased;

      setDisplayValue(decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, decimals, enabled]);

  return displayValue;
}

const Dashboard = () => {
  const [inscStats, setInscStats] = useState({ total: 0, admitidos: 0, rechazados: 0, revision: 0, promovidos: 0 });
  const [benStats,  setBenStats]  = useState({ total: 0, activos: 0, suspendidos: 0, retirados: 0 });
  const [pagoStats, setPagoStats] = useState({ count: 0, total: 0 });
  const [actStats,  setActStats]  = useState({ pendientes: 0, aprobadas: 0, rechazadas: 0 });
  const [ventanaActiva, setVentanaActiva] = useState(null);
  const [ticketStats, setTicketStats] = useState({ activos: 0, resueltos: 0, en_revision: 0, recibido: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchInscripciones(),
      fetchBeneficiarios(),
      fetchPagos(),
      fetchActualizaciones(),
      fetchVentana(),
      fetchTickets(),
    ]);
    setLastRefresh(new Date());
    setLoading(false);
  }

  async function fetchInscripciones() {
    const { data } = await supabase.from('inscripciones').select('estado,promovido_a_beneficiario');
    if (!data) return;
    setInscStats(data.reduce((acc, r) => {
      acc.total++;
      if (r.estado === 'Admitido')    acc.admitidos++;
      else if (r.estado === 'No admitido') acc.rechazados++;
      else if (r.estado === 'En revisión') acc.revision++;
      if (r.promovido_a_beneficiario) acc.promovidos++;
      return acc;
    }, { total: 0, admitidos: 0, rechazados: 0, revision: 0, promovidos: 0 }));
  }

  async function fetchBeneficiarios() {
    const { data } = await supabase.from('portal_beneficiarios').select('estado_beneficiario').is('deleted_at', null);
    if (!data) return;
    setBenStats(data.reduce((acc, r) => {
      acc.total++;
      if      (r.estado_beneficiario === 'activo')     acc.activos++;
      else if (r.estado_beneficiario === 'suspendido') acc.suspendidos++;
      else if (r.estado_beneficiario === 'retirado')   acc.retirados++;
      return acc;
    }, { total: 0, activos: 0, suspendidos: 0, retirados: 0 }));
  }

  async function fetchPagos() {
    const { data } = await supabase.from('portal_beneficiario_pagos').select('monto').eq('estado', 'efectuado');
    if (!data) return;
    setPagoStats({ count: data.length, total: data.reduce((s, r) => s + Number(r.monto || 0), 0) });
  }

  async function fetchActualizaciones() {
    const { data } = await supabase.from('portal_actualizaciones').select('estado');
    if (!data) return;
    setActStats(data.reduce((acc, r) => {
      if      (r.estado === 'enviada' || r.estado === 'pendiente') acc.pendientes++;
      else if (r.estado === 'aprobada')  acc.aprobadas++;
      else if (r.estado === 'rechazada') acc.rechazadas++;
      return acc;
    }, { pendientes: 0, aprobadas: 0, rechazadas: 0 }));
  }

  async function fetchVentana() {
    const { data } = await supabase
      .from('portal_ventanas_actualizacion')
      .select('id,nombre,fecha_inicio,fecha_fin,is_active')
      .eq('is_active', true)
      .maybeSingle();
    setVentanaActiva(data || null);
  }

  async function fetchTickets() {
    const res = await invokeAdminTickets({ action: 'stats' });
    if (res.ok) {
      setTicketStats({
        activos:    Number(res.data?.stats?.activos    || 0),
        resueltos:  Number(res.data?.stats?.resueltos  || 0),
        en_revision:Number(res.data?.stats?.en_revision|| 0),
        recibido:   Number(res.data?.stats?.recibido   || 0),
      });
    }
  }

  // Índices de salud derivados
  const processed   = inscStats.admitidos + inscStats.rechazados;
  const pctRevisados = inscStats.total > 0 ? Math.round((processed / inscStats.total) * 100) : 0;
  const pctBenActivos = benStats.total > 0 ? Math.round((benStats.activos / benStats.total) * 100) : 100;
  const totalAct = actStats.aprobadas + actStats.pendientes + actStats.rechazadas;
  const pctActAprobadas = totalAct > 0 ? Math.round((actStats.aprobadas / totalAct) * 100) : 0;

  const healthScore = inscStats.total === 0 && benStats.total === 0
    ? null
    : Math.round((pctRevisados + pctBenActivos + (totalAct > 0 ? pctActAprobadas : 80)) / 3);
  const animatedHealthScore = useCountUp(healthScore === null ? 0 : healthScore, { duration: 950, enabled: !loading && healthScore !== null });

  const healthKey = healthScore === null ? 'slate' : healthScore >= 75 ? 'emerald' : healthScore >= 50 ? 'amber' : 'rose';
  const hs = HEALTH_SCORE_STYLES[healthKey] ?? HEALTH_SCORE_STYLES.amber;

  return (
    <div className="space-y-6 animate-fade-in">

      <section className="admin-panel admin-grid relative overflow-hidden rounded-[34px] p-6 md:p-8 lg:p-10">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(200,140,58,0.18),transparent_68%)] pointer-events-none" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="admin-kicker">Lectura ejecutiva</p>
            <h1 className="admin-display mt-3 text-[clamp(2.2rem,5vw,4.7rem)]">Un centro de control sobrio, legible y con carácter institucional.</h1>
            <p className="mt-4 max-w-2xl text-sm md:text-base text-slate-600 leading-7">
              Reúne convocatorias, pagos, tickets y seguimiento académico en una experiencia más clara para trabajo operativo diario y toma de decisiones.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="admin-chip"><Shield size={13} /> Gestión pública</span>
              <span className="admin-chip"><DollarSign size={13} /> Seguimiento financiero</span>
              <span className="admin-chip-strong"><Bell size={13} /> {ticketStats.activos} tickets abiertos</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-full lg:min-w-[440px] lg:max-w-[500px]">
            <HeroMiniStat label="Beneficiarios activos" value={loading ? '—' : benStats.activos} note="Base vigente" />
            <HeroMiniStat label="Pagos efectuados" value={loading ? '—' : pagoStats.count} note="Histórico cargado" />
            <HeroMiniStat label="Ventana vigente" value={ventanaActiva ? 'Sí' : 'No'} note={ventanaActiva ? 'Actualización abierta' : 'Sin periodo activo'} />
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="admin-kicker">Tablero operativo</p>
          <p className="text-sm text-slate-600 mt-1">
            Resumen vivo del portal FOCADES
            {lastRefresh && (
              <span className="ml-2 text-xs text-slate-400">
                · actualizado {lastRefresh.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--gov-line)] bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-50 transition"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <Link to="/admin/analiticas" className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--gov-ink)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--gov-ink-soft)] transition">
            <BarChart3 size={13} /> Analíticas
          </Link>
          <Link to="/admin/proyecciones" className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--gov-line)] bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-white transition">
            <Calculator size={13} /> Proyecciones
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`admin-panel rounded-[28px] p-5 flex flex-col items-center justify-center text-center ${hs.border} ${hs.bg}`}>
          <Activity size={20} className={`${hs.icon} mb-2`} />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Salud operativa</p>
          <p className={`text-4xl font-black mt-1 ${hs.text}`}>
            {loading ? '—' : healthScore === null ? 'N/A' : `${animatedHealthScore}%`}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Índice del portal</p>
        </div>
        <div className="col-span-1 md:col-span-3 admin-panel rounded-[28px] p-5 space-y-4">
          <HealthBar
            label="Aspirantes revisados"
            value={pctRevisados}
            hint={`${processed} de ${inscStats.total} procesados`}
            colorKey="sky"
            loading={loading}
          />
          <HealthBar
            label="Beneficiarios activos"
            value={pctBenActivos}
            hint={`${benStats.activos} activos de ${benStats.total} totales`}
            colorKey="emerald"
            loading={loading}
          />
          <HealthBar
            label="Actualizaciones aprobadas"
            value={pctActAprobadas}
            hint={`${actStats.aprobadas} aprobadas · ${actStats.pendientes} pendientes · ${actStats.rechazadas} rechazadas`}
            colorKey="teal"
            loading={loading}
          />
        </div>
      </div>

      {ventanaActiva && (
        <div className="admin-panel rounded-[28px] border-sky-200 bg-sky-50/70 px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-sky-600 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Ventana activa</p>
              <p className="text-sm font-bold text-slate-800">{ventanaActiva.nombre}</p>
              <p className="text-xs text-slate-500">
                {new Date(ventanaActiva.fecha_inicio).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                {' → '}
                {new Date(ventanaActiva.fecha_fin).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {actStats.pendientes > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                <Bell size={11} /> {actStats.pendientes} pendientes
              </span>
            )}
            <Link
              to="/admin/actualizaciones"
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 transition"
            >
              Revisar <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Users size={16} />}      label="Inscritos"     value={inscStats.total}    sub={`${inscStats.revision} en revisión`}   colorKey="sky"     loading={loading} to="/admin/aspirantes" />
        <KpiCard icon={<UserCheck size={16} />}  label="Admitidos"     value={inscStats.admitidos} sub={`${inscStats.promovidos} promovidos`}  colorKey="emerald" loading={loading} to="/admin/aspirantes" />
        <KpiCard icon={<Shield size={16} />}     label="Beneficiarios" value={benStats.activos}    sub={`${benStats.suspendidos} suspendidos`} colorKey="teal"    loading={loading} to="/admin/beneficiarios" />
        <KpiCard icon={<UserX size={16} />}      label="No admitidos"  value={inscStats.rechazados} sub="aspirantes rechazados"                colorKey="rose"    loading={loading} to="/admin/aspirantes" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign size={16} />}   label="Desembolsado"      value={pagoStats.total} formatter={formatCOP} sub={`${pagoStats.count} pagos efectuados`}      colorKey="emerald" loading={loading} to="/admin/beneficiarios" />
        <KpiCard icon={<FileText size={16} />}     label="Act. aprobadas"    value={actStats.aprobadas}         sub={`${actStats.pendientes} por revisar`}        colorKey="sky"     loading={loading} to="/admin/actualizaciones" />
        <KpiCard icon={<Clock size={16} />}        label="Tickets abiertos"  value={ticketStats.activos}        sub={`${ticketStats.recibido} nuevos`}            colorKey="amber"   loading={loading} to="/admin/tickets" />
        <KpiCard icon={<CheckCircle2 size={16} />} label="Tickets resueltos" value={ticketStats.resueltos}      sub={`${ticketStats.en_revision} en proceso`}     colorKey="teal"    loading={loading} to="/admin/tickets" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="admin-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-slate-400" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Aspirantes por estado</h3>
            </div>
            <Link to="/admin/aspirantes" className="text-xs font-bold text-sky-600 hover:underline">Ver todos</Link>
          </div>
          <div className="space-y-3">
            <DistBar label="En revisión" value={inscStats.revision}  total={inscStats.total} barClass="bg-amber-400"   loading={loading} />
            <DistBar label="Admitidos"   value={inscStats.admitidos} total={inscStats.total} barClass="bg-emerald-500" loading={loading} />
            <DistBar label="No admitidos"value={inscStats.rechazados}total={inscStats.total} barClass="bg-rose-400"    loading={loading} />
            <DistBar
              label="Sin procesar"
              value={Math.max(0, inscStats.total - inscStats.admitidos - inscStats.rechazados - inscStats.revision)}
              total={inscStats.total}
              barClass="bg-slate-300"
              loading={loading}
            />
          </div>
        </div>

        <div className="admin-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-slate-400" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Beneficiarios por estado</h3>
            </div>
            <Link to="/admin/beneficiarios" className="text-xs font-bold text-sky-600 hover:underline">Ver todos</Link>
          </div>
          {benStats.total === 0 && !loading ? (
            <p className="text-xs text-slate-400 italic text-center py-10">Sin beneficiarios registrados.</p>
          ) : (
            <div className="space-y-3">
              <DistBar label="Activos"     value={benStats.activos}     total={benStats.total} barClass="bg-emerald-500" loading={loading} />
              <DistBar label="Suspendidos" value={benStats.suspendidos} total={benStats.total} barClass="bg-amber-400"   loading={loading} />
              <DistBar label="Retirados"   value={benStats.retirados}   total={benStats.total} barClass="bg-rose-400"    loading={loading} />
            </div>
          )}
        </div>
      </div>

      <div className="admin-panel rounded-[28px] p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Acciones rápidas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_LINKS.map(({ to, label, icon, color }) => {
            const s = KPI_STYLES[color];
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition hover:opacity-80 ${s.bg} ${s.border} ${s.icon}`}
              >
                {icon} {label}
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
};

function HealthBar({ label, value, hint, colorKey, loading }) {
  const s = HEALTH_STYLES[colorKey] ?? HEALTH_STYLES.sky;
  const animatedPct = useCountUp(value, { duration: 850, enabled: !loading });
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className={`text-xs font-black ${s.text}`}>{loading ? '—' : `${animatedPct}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        {!loading && (
          <div
            className={`h-full rounded-full transition-all duration-700 ${s.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, animatedPct))}%` }}
          />
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function KpiCard({ icon, label, value, formatter, sub, colorKey, loading, to }) {
  const s = KPI_STYLES[colorKey] ?? KPI_STYLES.slate;
  const isNumericValue = typeof value === 'number' && Number.isFinite(value);
  const animatedValue = useCountUp(isNumericValue ? value : 0, { duration: 900, enabled: !loading && isNumericValue });
  const displayValue = loading
    ? '—'
    : isNumericValue
      ? (typeof formatter === 'function' ? formatter(animatedValue) : animatedValue)
      : value;
  const inner = (
    <div className={`rounded-[26px] border p-5 hover:shadow-md transition group h-full ${s.bg} ${s.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={s.icon}>{icon}</div>
        {to && <ChevronRight size={13} className={`transition ${s.chevron}`} />}
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-xl font-black text-slate-800 mt-1">{displayValue}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function DistBar({ label, value, total, barClass, loading }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const animatedPct = useCountUp(pct, { duration: 900, enabled: !loading });
  const animatedValue = useCountUp(value, { duration: 900, enabled: !loading });
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-slate-600 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        {!loading && (
          <div
            className={`h-full rounded-full transition-all duration-700 ${barClass}`}
            style={{ width: `${animatedPct}%` }}
          />
        )}
      </div>
      <span className="w-20 text-right text-xs text-slate-500 shrink-0">
        {loading ? '—' : `${animatedValue} (${animatedPct}%)`}
      </span>
    </div>
  );
}

function HeroMiniStat({ label, value, note }) {
  const isNumericValue = typeof value === 'number' && Number.isFinite(value);
  const animatedValue = useCountUp(isNumericValue ? value : 0, { duration: 900, enabled: isNumericValue });
  return (
    <div className="rounded-[24px] border border-[rgba(16,35,63,0.10)] bg-white/74 px-4 py-4 shadow-sm backdrop-blur-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-[var(--gov-ink)]">{isNumericValue ? animatedValue : value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export default Dashboard;