import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2, Save, RotateCcw, FlaskConical, History, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showErrorAlert, showSuccessAlert } from '../lib/alerts';

const PERFIL_DEMO = {
  sisben_grupo: 'Grupo A (Pobreza extrema)',
  ingresos_padre: 'Sin ingresos',
  ingresos_madre: 'Menos de 1 SMLV',
  puntaje_icfes: '320',
  enfoque_diferencial: 'Víctima del Conflicto',
  zona_residencia: 'Zona Rural',
  recibe_subsidio: 'No',
  semestre_ingreso: '1',
};

const CAMPO_LABELS = {
  sisben_grupo: 'SISBEN',
  ingresos_padre: 'Ingresos del padre',
  ingresos_madre: 'Ingresos de la madre',
  puntaje_icfes: 'Puntaje ICFES',
  enfoque_diferencial: 'Enfoque diferencial',
  zona_residencia: 'Zona de residencia',
  recibe_subsidio: '¿Recibe subsidio?',
  semestre_ingreso: 'Semestre de ingreso',
};

export default function AdminConfiguracionPuntaje() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reglas, setReglas] = useState(null);
  const [reglasOriginales, setReglasOriginales] = useState(null);
  const [versionActiva, setVersionActiva] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [nota, setNota] = useState('');

  const [perfil, setPerfil] = useState(PERFIL_DEMO);
  const [simulacion, setSimulacion] = useState(null);
  const [simulando, setSimulando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('portal_configuracion_puntaje')
      .select('version, reglas, is_active, nota, created_at')
      .order('version', { ascending: false });

    if (error) {
      showErrorAlert({ title: 'No se pudo cargar la configuración de puntaje.', text: error.message });
      setLoading(false);
      return;
    }

    const activa = (data || []).find((c) => c.is_active) || (data || [])[0] || null;
    setHistorial(data || []);
    setVersionActiva(activa?.version ?? null);
    setReglas(activa?.reglas ?? null);
    setReglasOriginales(activa?.reglas ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const sumaMaximos = useMemo(
    () => (reglas?.criterios || []).reduce((acc, c) => acc + (Number(c.max) || 0), 0),
    [reglas]
  );

  const hayCambios = useMemo(
    () => JSON.stringify(reglas) !== JSON.stringify(reglasOriginales),
    [reglas, reglasOriginales]
  );

  const sumaValida = sumaMaximos === 100;

  const actualizarMax = (claveCriterio, valor) => {
    setReglas((prev) => ({
      ...prev,
      criterios: prev.criterios.map((c) =>
        c.clave === claveCriterio ? { ...c, max: Number(valor) || 0 } : c
      ),
    }));
  };

  const actualizarPuntosRegla = (claveCriterio, indexRegla, valor) => {
    setReglas((prev) => ({
      ...prev,
      criterios: prev.criterios.map((c) =>
        c.clave !== claveCriterio
          ? c
          : {
              ...c,
              reglas: c.reglas.map((r, i) =>
                i === indexRegla ? { ...r, puntos: Number(valor) || 0 } : r
              ),
            }
      ),
    }));
  };

  const simular = useCallback(async () => {
    if (!reglas) return;
    setSimulando(true);
    const { data, error } = await supabase.rpc('calcular_puntaje_con_reglas', {
      p_datos: perfil,
      p_reglas: reglas,
    });
    setSimulando(false);
    if (error) {
      showErrorAlert({ title: 'Error al simular el puntaje.', text: error.message });
      return;
    }
    setSimulacion(data);
  }, [reglas, perfil]);

  useEffect(() => {
    if (reglas) simular();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglas, perfil]);

  const guardar = async () => {
    if (!sumaValida) {
      showErrorAlert({
        title: 'La suma de los puntajes máximos debe ser exactamente 100.',
        text: `Suma actual: ${sumaMaximos}`,
      });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_guardar_configuracion_puntaje', {
      p_reglas: reglas,
      p_nota: nota.trim() || null,
    });
    setSaving(false);
    if (error) {
      showErrorAlert({ title: 'No se pudo guardar la configuración.', text: error.message });
      return;
    }
    showSuccessAlert({
      title: 'Configuración guardada',
      text: `Se creó la versión ${data?.version}. Las inscripciones anteriores conservan su puntaje original.`,
    });
    setNota('');
    cargar();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Loader2 className="animate-spin" size={18} /> Cargando configuración…
      </div>
    );
  }

  if (!reglas) {
    return (
      <div className="p-8 text-slate-500">No hay configuración de puntaje registrada.</div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-secondary/10 flex items-center justify-center">
          <Calculator className="text-secondary" size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-primary">Configuración de Puntaje</h1>
          <p className="text-sm text-slate-500">
            Define cuántos puntos otorga cada criterio al calcular el puntaje de los aspirantes.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
          Versión activa: {versionActiva}
        </span>
      </div>

      <div
        className={`rounded-2xl p-4 flex items-center gap-3 ring-1 ${
          sumaValida
            ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
            : 'bg-amber-50 text-amber-800 ring-amber-200'
        }`}
      >
        {sumaValida ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
        <div className="flex-1 text-sm">
          <p className="font-bold">Suma de puntajes máximos: {sumaMaximos} / 100</p>
          {!sumaValida && (
            <p className="text-xs mt-0.5">
              Ajusta los máximos para que sumen exactamente 100 antes de guardar.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {reglas.criterios.map((criterio) => (
            <div key={criterio.clave} className="bg-white border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-primary">{criterio.label}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {criterio.tipo === 'rango' ? 'Evaluado por rangos numéricos' : 'Evaluado por opción seleccionada'}
                  </p>
                </div>
                <label className="shrink-0 text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Máximo
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={criterio.max}
                    onChange={(e) => actualizarMax(criterio.clave, e.target.value)}
                    className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-right"
                  />
                </label>
              </div>

              <div className="space-y-2">
                {criterio.reglas.map((regla, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-slate-600">
                      {criterio.tipo === 'rango'
                        ? `De ${regla.desde} a ${regla.hasta}`
                        : regla.valor}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={regla.puntos}
                      onChange={(e) => actualizarPuntosRegla(criterio.clave, i, e.target.value)}
                      className={`w-20 px-3 py-1.5 border rounded-lg text-sm text-right ${
                        Number(regla.puntos) > Number(criterio.max)
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200'
                      }`}
                    />
                    <span className="w-8 text-xs text-slate-400">pts</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-2xl p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="text-secondary" size={18} />
              <h3 className="font-bold text-primary text-sm uppercase tracking-wide">Simulador</h3>
            </div>

            <div className="space-y-2 mb-4">
              {Object.entries(perfil).map(([campo, valor]) => (
                <label key={campo} className="block">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {CAMPO_LABELS[campo] || campo}
                  </span>
                  <input
                    value={valor}
                    onChange={(e) => setPerfil((p) => ({ ...p, [campo]: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </label>
              ))}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-center mb-3">
              {simulando ? (
                <Loader2 className="animate-spin mx-auto text-slate-400" size={20} />
              ) : (
                <>
                  <p className="text-3xl font-black text-primary">{simulacion?.total ?? 0}</p>
                  <p className="text-xs text-slate-500">de {simulacion?.maximo ?? 100} puntos</p>
                </>
              )}
            </div>

            {simulacion?.detalle?.length > 0 && (
              <div className="space-y-1">
                {simulacion.detalle.map((d) => (
                  <div key={d.clave} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 truncate pr-2">{d.label}</span>
                    <span className="font-bold text-slate-700 shrink-0">
                      {d.puntos}/{d.max}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <label className="block mb-3">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                Nota del cambio
              </span>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                placeholder="Ej: Se aumentó el peso del enfoque diferencial."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none"
              />
            </label>

            <div className="flex gap-2">
              <button
                onClick={guardar}
                disabled={!hayCambios || !sumaValida || saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar versión
              </button>
              <button
                onClick={() => { setReglas(reglasOriginales); setNota(''); }}
                disabled={!hayCambios || saving}
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-slate-500 disabled:opacity-40"
                title="Descartar cambios"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
              Guardar crea una nueva versión. Las inscripciones ya registradas conservan el puntaje
              calculado con la versión que estaba vigente.
            </p>
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="text-slate-400" size={16} />
              <h3 className="font-bold text-primary text-xs uppercase tracking-wide">Historial</h3>
            </div>
            <div className="space-y-2">
              {historial.map((h) => (
                <div key={h.version} className="text-xs border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">v{h.version}</span>
                    {h.is_active && (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                        Activa
                      </span>
                    )}
                    <span className="text-slate-400 ml-auto">
                      {new Date(h.created_at).toLocaleDateString('es-CO')}
                    </span>
                  </div>
                  {h.nota && <p className="text-slate-500 mt-1 leading-snug">{h.nota}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
