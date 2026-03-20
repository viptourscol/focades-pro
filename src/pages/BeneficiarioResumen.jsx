import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, CreditCard, ShieldCheck, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PAYMENT_RIGHTS_RPC_SESSION_KEY = 'focades-payment-rights-rpc-unavailable';
const BENEFICIARIO_PAYMENT_RIGHTS_RPC = 'beneficiario_payment_rights';

const isRpcMarkedUnavailable = (rpcName) => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_RIGHTS_RPC_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Boolean(parsed?.[rpcName]);
  } catch {
    return false;
  }
};

const markRpcUnavailable = (rpcName) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_RIGHTS_RPC_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[rpcName] = true;
    window.sessionStorage.setItem(PAYMENT_RIGHTS_RPC_SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // noop
  }
};

const formatMoney = (value) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleDateString('es-CO');
};

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No disponible';
  return date.toLocaleString('es-CO');
};

const normalizeBeneficiarioLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('tecnol')) return 'tecnologo';
  if (normalized.includes('tecnic')) return 'tecnico';
  if (normalized.includes('universi') || normalized.includes('pregrado') || normalized.includes('profesional')) return 'profesional';
  return null;
};

const paymentCapForLevel = (value) => {
  const normalized = normalizeBeneficiarioLevel(value);
  if (normalized === 'tecnico') return 4;
  if (normalized === 'tecnologo') return 6;
  if (normalized === 'profesional') return 10;
  return null;
};

const toIntegerOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const buildLocalPaymentRights = ({ profile, paymentRows = [], enrollmentData = null }) => {
  const nivelFormacion = profile?.nivel_formacion || enrollmentData?.datos_formulario?.nivel_formacion || null;
  const modalidad = profile?.modalidad || enrollmentData?.datos_formulario?.modalidad || enrollmentData?.datos_formulario?.modalidad_aspira || null;
  const semestreIngreso = toIntegerOrNull(profile?.semestre_ingreso) || toIntegerOrNull(enrollmentData?.datos_formulario?.semestre_ingreso) || null;
  const topePagos = paymentCapForLevel(nivelFormacion);
  const derechoInicial = topePagos && semestreIngreso ? Math.max(0, topePagos - (semestreIngreso - 1)) : 0;
  const pagosEfectuados = paymentRows.filter((item) => item.estado === 'efectuado').length;
  const pagosRestantes = Math.max(0, derechoInicial - pagosEfectuados);
  const esActivo = profile?.estado_beneficiario === 'activo';

  let motivoBloqueo = null;
  let esElegible = false;

  if (!nivelFormacion) {
    motivoBloqueo = 'Falta nivel de formacion para calcular tus derechos de pago.';
  } else if (!semestreIngreso) {
    motivoBloqueo = 'Falta semestre de ingreso para calcular tus derechos de pago.';
  } else if (!esActivo) {
    motivoBloqueo = 'Tu estado actual no permite nuevos pagos.';
  } else if (pagosRestantes <= 0) {
    motivoBloqueo = 'Ya agotaste tus cupos de pago disponibles.';
  } else {
    esElegible = true;
  }

  return {
    nivelFormacion,
    modalidad,
    semestreIngreso,
    topePagos,
    derechoTotal: derechoInicial,
    pagosEfectuados,
    pagosRestantes,
    ajustesNetos: 0,
    esElegible,
    motivoBloqueo,
    source: 'local-fallback',
  };
};

const BeneficiarioResumen = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsNotice, setPaymentsNotice] = useState('');
  const [paymentRights, setPaymentRights] = useState(null);
  const [paymentRightsNotice, setPaymentRightsNotice] = useState('');

  const totalPagado = useMemo(() => {
    return payments
      .filter((item) => item.estado === 'efectuado')
      .reduce((acc, item) => acc + Number(item.monto || 0), 0);
  }, [payments]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('portal_beneficiarios')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (!mounted) return;
      setProfile(data || null);

      if (data?.id) {
        const { data: paymentRows, error: paymentsError } = await supabase
          .from('portal_beneficiario_pagos')
          .select('*')
          .eq('beneficiario_id', data.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;
        setPayments(Array.isArray(paymentRows) ? paymentRows : []);
        setPaymentsNotice(
          paymentsError
            ? 'Tu historial de pagos aun no puede consultarse desde esta cuenta. Falta desplegar el permiso de lectura o la migracion correspondiente en Supabase.'
            : ''
        );

        try {
          if (isRpcMarkedUnavailable(BENEFICIARIO_PAYMENT_RIGHTS_RPC)) {
            throw new Error('__PAYMENT_RIGHTS_RPC_UNAVAILABLE__');
          }

          const { data: rightsData, error: rightsError } = await supabase.rpc('beneficiario_payment_rights');
          if (rightsError) throw rightsError;
          if (!mounted) return;
          setPaymentRights(rightsData || null);
          setPaymentRightsNotice('');
        } catch (error) {
          let enrollmentData = null;

          if (data?.inscripcion_pk || data?.inscripcion_id) {
            const { data: inscripcionData } = await supabase
              .from('inscripciones')
              .select('id,datos_formulario')
              .eq('id', data.inscripcion_pk || data.inscripcion_id)
              .maybeSingle();
            enrollmentData = inscripcionData || null;
          }

          if (!mounted) return;
          setPaymentRights(
            buildLocalPaymentRights({
              profile: data,
              paymentRows: Array.isArray(paymentRows) ? paymentRows : [],
              enrollmentData,
            })
          );

          if (String(error?.message || '').includes('404') || String(error?.message || '').toLowerCase().includes('not found')) {
            markRpcUnavailable(BENEFICIARIO_PAYMENT_RIGHTS_RPC);
          }

          setPaymentRightsNotice(
            String(error?.message || '') === '__PAYMENT_RIGHTS_RPC_UNAVAILABLE__' ||
              String(error?.message || '').includes('404') ||
              String(error?.message || '').toLowerCase().includes('not found')
              ? 'El calculo centralizado de derechos de pago aun no esta desplegado. Te mostramos una estimacion local.'
              : 'No fue posible consultar el calculo centralizado. Te mostramos una estimacion local.'
          );
        }
      }

      setLoading(false);
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-white border border-border rounded-3xl p-8 text-center text-slate-500 animate-pulse">
          Cargando resumen...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white border border-border rounded-2xl p-8">
        <h2 className="text-xl font-extrabold text-primary">Mi Resumen</h2>
        <p className="text-sm text-slate-600 mt-3">
          Tu cuenta aún no está vinculada como beneficiario activo. Comunícate con el equipo administrador para habilitar el acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6 md:p-7 animate-slide-up">
        <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-sky-100/60 blur-2xl" />
        <div className="absolute -bottom-20 -left-12 w-44 h-44 rounded-full bg-amber-100/50 blur-2xl" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase bg-primary/10 text-primary">
              Mi Resumen
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-primary mt-3">{profile.nombre_completo || 'Beneficiario'}</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">
              Consulta en una sola vista tu estado general, derechos de pago y trazabilidad financiera.
            </p>
          </div>
          <span
            className={`inline-flex px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest ring-1 transition-all duration-300 ${
              profile.estado_beneficiario === 'activo'
                ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                : 'bg-amber-100 text-amber-700 ring-amber-200'
            }`}
          >
            Estado: {profile.estado_beneficiario || 'No disponible'}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 animate-slide-up" style={{ animationDelay: '50ms' }}>
        <MetricCard
          title="Semestre actual"
          value={profile.semestre_actual || 'No definido'}
          icon={<ShieldCheck size={18} className="text-blue-600" />}
          tone="bg-blue-50"
        />
        <MetricCard
          title="Total pagado"
          value={formatMoney(totalPagado)}
          icon={<Wallet size={18} className="text-teal-700" />}
          tone="bg-teal-50"
        />
        <MetricCard
          title="Pagos restantes"
          value={paymentRights?.pagosRestantes ?? 'No disponible'}
          icon={<CircleDollarSign size={18} className="text-amber-600" />}
          tone="bg-amber-50"
        />
      </section>

      <section className="bg-white border border-border rounded-3xl p-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-extrabold text-primary">Información del beneficiario</h3>
            <p className="text-sm text-slate-600 mt-1">Datos principales registrados en tu perfil.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2.5 md:gap-3">
          <SummaryItem label="Correo" value={profile.email} />
          <SummaryItem label="Teléfono" value={profile.telefono} />
          <SummaryItem label="Dirección" value={profile.direccion} />
          <SummaryItem label="Radicado" value={profile.radicado_inscripcion} />
          <SummaryItem label="Nivel formación" value={paymentRights?.nivelFormacion || profile.nivel_formacion} />
          <SummaryItem label="Modalidad" value={paymentRights?.modalidad || profile.modalidad} />
          <SummaryItem
            label="Semestre ingreso"
            value={paymentRights?.semestreIngreso ? String(paymentRights.semestreIngreso) : profile.semestre_ingreso ? String(profile.semestre_ingreso) : ''}
          />
          <SummaryItem label="Última actualización" value={profile.updated_at ? new Date(profile.updated_at).toLocaleString('es-CO') : ''} />
        </div>
      </section>

      <section className="bg-white border border-border rounded-3xl p-6 animate-slide-up" style={{ animationDelay: '150ms' }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-primary">Derechos de pago</h3>
            <p className="text-sm text-slate-600 mt-1">
              El tope por nivel es un máximo posible. Tu derecho real depende del semestre de ingreso y de los pagos ya efectuados.
            </p>
          </div>
          <span className={`inline-flex px-3 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${paymentRights?.esElegible ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 animate-pulse-gentle' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'}`}>
            {paymentRights?.esElegible ? 'Con cupo disponible' : 'Pago bloqueado'}
          </span>
        </div>

        {paymentRightsNotice ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 animate-fade-in">
            {paymentRightsNotice}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2.5 md:gap-4">
          <MetricCard title="Tope por nivel" value={paymentRights?.topePagos} icon={<ShieldCheck size={18} className="text-sky-600" />} tone="bg-sky-50" />
          <MetricCard title="Derecho total" value={paymentRights?.derechoTotal} icon={<Wallet size={18} className="text-teal-700" />} tone="bg-teal-50" />
          <MetricCard title="Pagos efectuados" value={paymentRights?.pagosEfectuados} icon={<CreditCard size={18} className="text-emerald-600" />} tone="bg-emerald-50" />
          <MetricCard title="Pagos restantes" value={paymentRights?.pagosRestantes} icon={<CircleDollarSign size={18} className="text-amber-600" />} tone="bg-amber-50" />
        </div>

        {!paymentRights?.esElegible && paymentRights?.motivoBloqueo ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in">
            {paymentRights.motivoBloqueo}
          </div>
        ) : null}
      </section>

      <section className="bg-white border border-border rounded-3xl p-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-primary">Historial de pagos</h3>
            <p className="text-sm text-slate-600 mt-1">Consulta tus desembolsos registrados, fechas y estado actual.</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-border px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500">Total pagado</p>
            <p className="text-lg font-extrabold text-primary mt-1">{formatMoney(totalPagado)}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {paymentsNotice ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 animate-fade-in">
              {paymentsNotice}
            </div>
          ) : payments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-6 text-sm text-slate-500 text-center animate-fade-in">
              Aun no tienes pagos registrados para mostrar en tu historial.
            </div>
          ) : (
            payments.map((payment, idx) => (
              <div key={payment.id} className="rounded-2xl border border-border px-4 py-4 bg-slate-50/70 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 animate-slide-up" style={{ animationDelay: `${220 + idx * 40}ms` }}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-primary">{payment.concepto || 'Pago registrado'}</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {formatMoney(payment.monto)} · {payment.periodo || 'Sin periodo'} · Ref. {payment.referencia || 'N/D'}
                    </p>
                  </div>
                  <span className={`inline-flex px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${payment.estado === 'efectuado' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : payment.estado === 'anulado' ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'}`}>
                    {payment.estado || 'sin estado'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2.5 md:gap-3 text-sm">
                  <SummaryItem label="Fecha programada" value={formatDate(payment.fecha_programada)} />
                  <SummaryItem label="Fecha efectiva" value={formatDate(payment.fecha_efectiva)} />
                  <SummaryItem label="Creado" value={formatDateTime(payment.created_at)} />
                  <SummaryItem label="Observación" value={payment.observacion} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ title, value, icon, tone }) => (
  <div className="rounded-2xl border border-border p-3 md:p-4 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
    <div className="flex items-center justify-between gap-3">
      <p className="text-[10px] md:text-[11px] uppercase tracking-wide font-bold text-slate-500">{title}</p>
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tone}`}>{icon}</div>
    </div>
    <p className="text-lg md:text-2xl font-extrabold text-primary mt-2.5 md:mt-3 leading-tight">{value ?? 'No disponible'}</p>
  </div>
);

const SummaryItem = ({ label, value }) => {
  const safeValue = value || 'No disponible';
  const isLongText = String(safeValue).length > 34;

  return (
    <div className={`rounded-xl border border-border p-2.5 md:p-3 bg-slate-50 hover:bg-white transition-colors duration-300 ${isLongText ? 'col-span-2 md:col-span-1' : ''}`}>
      <p className="text-[10px] md:text-[11px] uppercase tracking-wide font-bold text-slate-500">{label}</p>
      <p className="text-sm md:text-base font-semibold text-primary mt-1 leading-tight break-words">{safeValue}</p>
    </div>
  );
};

export default BeneficiarioResumen;
